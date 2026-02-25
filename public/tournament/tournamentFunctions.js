const { Client, ButtonBuilder, EmbedBuilder } = require("discord.js");
const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const csvParser = require("csv-parser");
const fs = require("fs");
const path = require("path");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/database/write.js") + "");
eval(fs.readFileSync("./public/tournament/tournamentutils.js") + "");
eval(fs.readFileSync("./public/tournament/single/singleTournament.js") + "");
eval(
  fs.readFileSync("./public/tournament/doubleElim/doubleElimTournament.js") + ""
);
eval(fs.readFileSync("./public/tournament/triple/tripleTournament.js") + "");

eval(fs.readFileSync("./public/tournament/challonge/challongeClient.js") + "");

const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const adapter = new FileSync("db.json");
const db = low(adapter);

async function getCurrentTournament(db) {
  return db.get("tournaments[0].currentTournament").value();
}

function getAdjustedMatchesPerDay(tournamentDb) {
  if (!tournamentDb) {
    return 1;
  }
  const baseMatchesPerDay = parseInt(tournamentDb.roundsPerTurn) || 1;
  if (baseMatchesPerDay !== 4) {
    return baseMatchesPerDay;
  }
  if (tournamentDb.tournamentFormat !== "Single Elimination") {
    return baseMatchesPerDay;
  }
  const rounds = tournamentDb.rounds || {};
  let roundKey = parseInt(tournamentDb.round);
  if (!rounds[roundKey]) {
    const availableRounds = Object.keys(rounds)
      .map((key) => parseInt(key, 10))
      .filter((key) => !isNaN(key))
      .sort((a, b) => b - a);
    roundKey = availableRounds[0] ?? roundKey;
  }
  const entries = Array.isArray(rounds[roundKey]) ? rounds[roundKey] : [];
  const uniqueMatches = new Set(entries.map((entry) => entry.match));
  const matchCount = uniqueMatches.size;
  if (matchCount > 0 && matchCount % 4 === 0) {
    return 4;
  }
  if (matchCount > 0 && matchCount % 2 === 0) {
    return 2;
  }
  return 1;
}

function extractYouTubeVideoIdFromUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.searchParams.has("v")) {
      const id = parsedUrl.searchParams.get("v");
      if (id && id.length === 11) {
        return id;
      }
    }

    if (parsedUrl.hostname.includes("youtu.be")) {
      const shortMatch = parsedUrl.pathname.match(/^\/([\w-]{11})$/);
      if (shortMatch) {
        return shortMatch[1];
      }
    }

    const embedMatch = parsedUrl.pathname.match(/embed\/([\w-]{11})/);
    if (embedMatch) {
      return embedMatch[1];
    }
  } catch (_) {
    const fallbackMatch = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    if (fallbackMatch) {
      return fallbackMatch[1];
    }
  }

  return null;
}

function buildWatchPlaylistUrlFromTrackLinks(trackLinks) {
  if (!Array.isArray(trackLinks) || trackLinks.length < 1) {
    return "";
  }

  const videoIds = [];
  const seenIds = new Set();
  for (const trackLink of trackLinks) {
    const videoId = extractYouTubeVideoIdFromUrl(trackLink);
    if (!videoId || seenIds.has(videoId)) {
      continue;
    }
    seenIds.add(videoId);
    videoIds.push(videoId);
    if (videoIds.length >= 50) {
      break;
    }
  }

  if (videoIds.length < 1) {
    return "";
  }

  return (
    "https://www.youtube.com/watch_videos?video_ids=" +
    videoIds.join(",")
  );
}

function collectDailyTrackLinksForSingle(tournamentDb, matchesPerDay) {
  const links = [];
  if (!tournamentDb) {
    return links;
  }

  const tieMatches = Array.isArray(tournamentDb.matches)
    ? tournamentDb.matches
        .filter((match) => match?.progress === "tie")
        .sort((a, b) => {
          const roundA = parseInt(a?.round || 0, 10);
          const roundB = parseInt(b?.round || 0, 10);
          if (roundA !== roundB) {
            return roundA - roundB;
          }
          return parseInt(a?.match || 0, 10) - parseInt(b?.match || 0, 10);
        })
    : [];

  for (const tieMatch of tieMatches) {
    if (tieMatch?.entrant1?.link) {
      links.push(tieMatch.entrant1.link);
    }
    if (tieMatch?.entrant2?.link) {
      links.push(tieMatch.entrant2.link);
    }
  }

  const simulatedTournament = JSON.parse(JSON.stringify(tournamentDb));
  const plannedMatches = collectStartableSingleMatches(simulatedTournament, 1).slice(
    0,
    matchesPerDay
  );
  for (const plannedMatch of plannedMatches) {
    const validEntries = (plannedMatch?.entries || []).filter(
      (entry) => entry?.name && entry.name !== "TBD" && !entry?.isPlaceholder
    );
    for (const entry of validEntries.slice(0, 2)) {
      if (entry?.link) {
        links.push(entry.link);
      }
    }
  }

  return links;
}

function collectDailyTrackLinksForDouble(tournamentDb, matchesPerDay) {
  const links = [];
  if (!tournamentDb) {
    return links;
  }

  const currentMatchCount = Array.isArray(tournamentDb.matches)
    ? tournamentDb.matches.length
    : 0;
  const nextMatchNumber = currentMatchCount + 1;
  const bracketEntries = Array.isArray(tournamentDb.brackets)
    ? tournamentDb.brackets
    : [];

  for (let i = 0; i < matchesPerDay; i++) {
    const matchNumber = nextMatchNumber + i;
    const entries = bracketEntries.filter(
      (entry) => parseInt(entry?.match || 0, 10) === matchNumber
    );
    if (entries.length < 2) {
      break;
    }
    if (entries[0]?.link) {
      links.push(entries[0].link);
    }
    if (entries[1]?.link) {
      links.push(entries[1].link);
    }
  }

  return links;
}

function collectDailyTrackLinksForTriple(tournamentDb, matchesPerDay) {
  const links = [];
  if (!tournamentDb) {
    return links;
  }

  const simulatedTournament = JSON.parse(JSON.stringify(tournamentDb));
  if (!Array.isArray(simulatedTournament.matches)) {
    simulatedTournament.matches = [];
  }

  for (let i = 0; i < matchesPerDay; i++) {
    const matchNumber = simulatedTournament.matches.length + 1;
    let thisRound = 0;
    let foundEntries = [];

    const currentRoundEntries = Array.isArray(
      simulatedTournament?.rounds?.[simulatedTournament.round]
    )
      ? simulatedTournament.rounds[simulatedTournament.round]
      : [];
    for (const entry of currentRoundEntries) {
      if (parseInt(entry?.match || 0, 10) === matchNumber) {
        foundEntries.push(entry);
        thisRound = simulatedTournament.round;
      }
    }

    if (foundEntries.length < 1 && thisRound === 0) {
      const nextRound = parseInt(simulatedTournament.round || 0, 10) + 1;
      const nextRoundEntries = Array.isArray(simulatedTournament?.rounds?.[nextRound])
        ? simulatedTournament.rounds[nextRound]
        : [];
      for (const entry of nextRoundEntries) {
        if (parseInt(entry?.match || 0, 10) === matchNumber) {
          foundEntries.push(entry);
          thisRound = nextRound;
        }
      }
    }

    const validEntries = foundEntries.filter(
      (entry) => entry?.name && entry.name !== "TBD" && !entry?.isPlaceholder
    );
    if (validEntries.length < 3) {
      break;
    }

    for (const entry of validEntries.slice(0, 3)) {
      if (entry?.link) {
        links.push(entry.link);
      }
    }

    simulatedTournament.round = thisRound || simulatedTournament.round;
    simulatedTournament.matchNumber = matchNumber;
    simulatedTournament.matches.push({ match: matchNumber });
  }

  return links;
}

function buildDailyPlaylistUrlForTournament(tournamentDb, matchesPerDay = 1) {
  if (!tournamentDb) {
    return "";
  }

  const maxMatchesPerDay = Math.max(1, parseInt(matchesPerDay || 1, 10));
  let trackLinks = [];

  switch (tournamentDb.tournamentFormat) {
    case "Single Elimination":
      trackLinks = collectDailyTrackLinksForSingle(tournamentDb, maxMatchesPerDay);
      break;
    case "Double Elimination":
      trackLinks = collectDailyTrackLinksForDouble(tournamentDb, maxMatchesPerDay);
      break;
    case "3v3 Ranked":
      trackLinks = collectDailyTrackLinksForTriple(tournamentDb, maxMatchesPerDay);
      break;
    default:
      trackLinks = [];
  }

  return buildWatchPlaylistUrlFromTrackLinks(trackLinks);
}

async function registerTournament(
  tournamentTitle,
  tournamentFormat,
  isRandom,
  isChallonge,
  isHiddenBracket,
  csvFilePath,
  roundsPerTurn = 1,
  participantRoleId = "",
  tournamentChannelId = "",
  tournamentChannelName = ""
) {
  console.log("Received CSV file path (URL):", csvFilePath);
  var db = GetDb();
  db.read();
  let currentTournamentName = await getCurrentTournament(db);
  console.log("Current Tournament Name: " + currentTournamentName);
  if (currentTournamentName !== "N/A") {
    console.log("There is a tournament already running!");
    return { ok: false, reason: "tournament_running" };
  }
  let tournamentDetails = await db.get("tournaments").nth(0).value();
  if (tournamentDetails?.[tournamentTitle]) {
    console.log(
      `Tournament name already exists: ${tournamentTitle}. ` +
        "Please use a different name."
    );
    return { ok: false, reason: "name_exists" };
  }

  let participantNum = tournamentFormat == "3v3 Ranked" ? 3 : 2;
  let participants = [];

  let participantNames = [];

  try {
    const readStream = await downloadFile(csvFilePath);
    return await new Promise((resolve) => {
      let resolved = false;
      const finish = (result) => {
        if (resolved) {
          return;
        }
        resolved = true;
        resolve(result);
      };
      const requiredHeaders = ["Name", "Title", "Link"];
      const headerAliases = new Map([
        ["name", "Name"],
        ["title", "Title"],
        ["link", "Link"],
        ["type", "Type"],
      ]);
      const parser = csvParser({
        mapHeaders: ({ header }) => {
          if (!header) {
            return header;
          }
          const normalized = header.trim().toLowerCase();
          return headerAliases.get(normalized) || header.trim();
        },
      });

      parser.on("headers", (headers) => {
        const headerSet = new Set(
          (headers || []).map((header) => (header || "").trim())
        );
        const missing = requiredHeaders.filter(
          (header) => !headerSet.has(header)
        );
        if (missing.length > 0) {
          const message =
            `CSV missing required columns: ${missing.join(", ")}. ` +
            "Required columns: Name, Title, Link (Type optional).";
          finish({ ok: false, reason: "missing_headers", message });
          readStream.destroy();
        }
      });

      readStream
        .pipe(parser)
        .on("data", (row) => {
          if (resolved) {
            return;
          }
          participants.push({
            name: row.Name,
            title: row.Title,
            link: row.Link,
            type: row.Type || "",
            match: 0,
          });
        })
        .on("end", async () => {
          if (resolved) {
            return;
          }
          console.log(`Processed ${participants.length} participants.`);

          if (participants.length === 0) {
            console.error("No participants found in CSV.");
            finish({ ok: false, reason: "no_participants" });
            return;
          }

          if (isRandom) {
            let shuffled = participants
              .map((value) => ({ value, sort: Math.random() }))
              .sort((a, b) => a.sort - b.sort)
              .map(({ value }) => value);
            participants = shuffled;
          }
          console.log(participants.length);
          var tempMatchNumber = 1;
          for (var i = 0; i < participants.length; i++) {
            participants[i].match = tempMatchNumber;

            var entrantNum = i + 1;
            if (isChallonge) {
              participants[i].challongeSeed = entrantNum;
              participants[i].challongeSeed = i + 1;
            }
            if (isHiddenBracket) {
              participantNames.push("Entrant #" + entrantNum);
            } else {
              participantNames.push(
                participants[i].name + " - " + participants[i].title
              );
            }

            if ((i + 1) % participantNum == 0) {
              tempMatchNumber++;
            }
          }

          // Handle Challonge integration if required
          const urlName = replaceSpacesWithUnderlines(
            tournamentTitle.replace(/-/g, " ")
          );

          if (isChallonge) {
            try {
              await createChallongeTournament(
                tournamentTitle,
                urlName,
                "",
                "Single Elimination",
                isHiddenBracket
              );
              await sleep(8000);
              await addChallongeEntrants(participantNames, urlName);
            } catch (error) {
              const challongeErrors =
                error?.response?.data?.errors?.join(", ") ||
                error?.message ||
                "Unknown error";
              console.warn("Challonge integration error:", challongeErrors);
              finish({
                ok: false,
                reason: "challonge_failed",
                message:
                  `Challonge setup failed: ${challongeErrors}. ` +
                  "Please amend your tournament title and try again.",
              });
              return;
            }
          }

        var RoundLength =
          tournamentFormat == "3v3 Ranked"
            ? parseInt(participants.length) / 3
            : parseInt(participants.length) / 2;
        var nextRoundLength =
          tournamentFormat == "3v3 Ranked"
            ? parseInt(RoundLength.length) / 3
            : parseInt(RoundLength.length) / 2;
        if (tournamentFormat == "Double Elimination") {
          db.get("tournaments")
            .nth(0)
            .assign({
              currentTournament: tournamentTitle,
              [tournamentTitle]: {
                tournamentFormat: tournamentFormat,
                startingParticipantCount: RoundLength,
                nextWinnerInNextRound: RoundLength + nextRoundLength,
                nextLoserInNextRound: RoundLength,
                matchNumber: 0,
                round: 1,
                currentBracket: "winnersBracket",
                roundsPerTurn: roundsPerTurn,
                matches: [],
                winnersBracket: { 1: participants },
                losersBracket: {},
                eliminated: [],
                final: [],
                isChallonge: isChallonge,
                channelId: tournamentChannelId,
                channelName: tournamentChannelName,
                participantRoleId: participantRoleId,
                roleId: participantRoleId,
              },
            })
            .write();
        } else {
          db.get("tournaments")
            .nth(0)
            .assign({
              currentTournament: tournamentTitle,
              [tournamentTitle]: {
                tournamentFormat: tournamentFormat,
                startingMatchCount: RoundLength,
                nextRoundNextMatch: RoundLength + 1,
                matchNumber: 0,
                round: 1,
                roundsPerTurn: roundsPerTurn,
                matches: [],
                rounds: { 1: participants },
                eliminated: [],
                final: [],
                isChallonge: isChallonge,
                channelId: tournamentChannelId,
                channelName: tournamentChannelName,
                participantRoleId: participantRoleId,
                roleId: participantRoleId,
              },
            })
            .write();
        }

          finish({ ok: true });
        })
        .on("error", (error) => {
          if (resolved) {
            return;
          }
          console.error("Error processing CSV file:", error);
          finish({ ok: false, reason: "csv_error" });
        });
    });
  } catch (error) {
    console.error("Failed to download or process CSV file:", error);
    return { ok: false, reason: "download_error" };
  }
}

// Neeed Round, Match Number, Names, Game, Links, Status
// Neeed Round, Match Number, Names, Game, Links, Status
async function StartMatch(
  interaction,
  bot = "",
  secondOfDay = false,
  previousMatches = [],
  hasStartedMatchThisRun = false,
  maxMatchesPerDay = 1,
  options = {}
) {
  var db = GetDb();
  await db.write();
  await db.read();
  let currentTournamentName = await getCurrentTournament(db);
  let tournamentDetails = await db.get("tournaments").nth(0).value();

  if (tournamentDetails.currentTournament == "N/A") {
    if (interaction != "") {
      await interaction.editReply({
        content:
          "There doesn't appear to be a tournament running at this time.",
        ephemeral: true,
      });
    }
    console.log(
      "There doesn't appear to be a tournament running at this time."
    );
    return;
  }

  let tournament = tournamentDetails[currentTournamentName];
  switch (tournament.tournamentFormat) {
    case "Single Elimination":
      console.log("Starting Single Match");
      if (!secondOfDay) {
        return await StartSingleMatchBatch(
          interaction,
          bot,
          previousMatches,
          maxMatchesPerDay,
          options
        );
      }
      return await StartSingleMatch(
        interaction,
        bot,
        secondOfDay,
        previousMatches,
        hasStartedMatchThisRun,
        null,
        options
      );
    case "Double Elimination":
      return await StartDoubleElimMatch(
        interaction,
        bot,
        secondOfDay,
        previousMatches,
        options
      );
    case "3v3 Ranked":
      return await StartTripleMatch(
        interaction,
        bot,
        secondOfDay,
        previousMatches,
        options
      );
  }
}

// Digusting method: needs split down. Far too large.
async function EndMatches(interaction = "") {
  var db = GetDb();
  await db.read();
  let currentTournamentName = await getCurrentTournament(db);
  let tournamentDetails = await db.get("tournaments").nth(0).value();

  if (tournamentDetails.currentTournament == "N/A") {
    if (interaction != "") {
      await interaction.editReply({
        content:
          "There doesn't appear to be a tournament running at this time.",
        ephemeral: true,
      });
    }
    console.log(
      "There doesn't appear to be a tournament running at this time."
    );
    return;
  }

  let tournament = tournamentDetails[currentTournamentName];
  var previousMatches = [];
  switch (tournament.tournamentFormat) {
    case "Single Elimination":
      previousMatches = await EndSingleMatches(interaction);
      break;
    case "Double Elimination":
      previousMatches = await EndDoubleElimMatches(interaction);
      break;
    case "3v3 Ranked":
      previousMatches = await EndTripleMatches(interaction);
      break;
  }
  return previousMatches;
}
