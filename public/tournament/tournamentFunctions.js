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

async function registerTournament(
  tournamentTitle,
  tournamentFormat,
  isRandom,
  isChallonge,
  isHiddenBracket,
  csvFilePath,
  roundsPerTurn = 1,
  participantRoleId = ""
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
      readStream
        .pipe(csvParser())
        .on("data", (row) => {
          participants.push({
            name: row.Name,
            title: row.Title,
            link: row.Link,
            type: row.Type || "",
            match: 0,
          });
        })
        .on("end", async () => {
          console.log(`Processed ${participants.length} participants.`);

          if (participants.length === 0) {
            console.error("No participants found in CSV.");
            resolve({ ok: false, reason: "no_participants" });
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
              resolve({
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
              },
            })
            .write();
        }

          resolve({ ok: true });
        })
        .on("error", (error) => {
          console.error("Error processing CSV file:", error);
          resolve({ ok: false, reason: "csv_error" });
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
  maxMatchesPerDay = 1
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
      if (!secondOfDay && maxMatchesPerDay > 1) {
        return await StartSingleMatchBatch(
          interaction,
          bot,
          previousMatches,
          maxMatchesPerDay
        );
      }
      return await StartSingleMatch(
        interaction,
        bot,
        secondOfDay,
        previousMatches,
        hasStartedMatchThisRun
      );
    case "Double Elimination":
      return await StartDoubleElimMatch(interaction, bot, secondOfDay, previousMatches);
    case "3v3 Ranked":
      return await StartTripleMatch(interaction, bot, secondOfDay, previousMatches);
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
