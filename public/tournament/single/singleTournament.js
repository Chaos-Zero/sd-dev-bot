const { Client, ButtonBuilder, EmbedBuilder } = require("discord.js");
const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const csvParser = require("csv-parser");
const fs = require("fs");
const path = require("path");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/database/write.js") + "");
eval(fs.readFileSync("./public/tournament/tournamentutils.js") + "");
eval(fs.readFileSync("./public/utils/compatibilityStore.js") + "");
eval(fs.readFileSync("./public/tournament/challonge/challongeClient.js") + "");
eval(
  fs.readFileSync("./public/tournament/single/singletournamentmessages.js") + ""
);

const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const adapter = new FileSync("db.json");
const db = low(adapter);

async function getCurrentTournament(db) {
  return db.get("tournaments[0].currentTournament").value();
}

function buildTieRoundsToCheck(matches, roundThreshold) {
  let roundsToCheck = "";
  for (const match of matches) {
    if (!match) {
      continue;
    }
    const matchRound = parseInt(match.round);
    if (
      match.progress === "tie" &&
      !isNaN(matchRound) &&
      matchRound < roundThreshold
    ) {
      console.log(
        "Tie summary match data:",
        JSON.stringify(
          {
            match: match.match,
            round: match.round,
            progress: match.progress,
            entrant1: match.entrant1,
            entrant2: match.entrant2,
          },
          null,
          2
        )
      );
      const entrant1Name = match?.entrant1?.name || "TBD";
      const entrant2Name = match?.entrant2?.name || "TBD";
      roundsToCheck +=
        "\n**Match " +
        match.match +
        "**: " +
        entrant2Name +
        " vs " +
        entrant1Name;
    }
  }
  return roundsToCheck;
}

function getSingleTotalRounds(startingMatchCount) {
  let matchesThisRound = parseInt(startingMatchCount);
  if (isNaN(matchesThisRound) || matchesThisRound < 1) {
    return 0;
  }
  let rounds = 0;
  while (matchesThisRound >= 1) {
    rounds += 1;
    if (matchesThisRound === 1) {
      break;
    }
    matchesThisRound = Math.ceil(matchesThisRound / 2);
  }
  return rounds;
}

function getThirdPlaceMatchNumber(startingMatchCount, hasThirdPlaceMatch) {
  if (!hasThirdPlaceMatch) {
    return null;
  }
  const baseFinalMatchNumber = parseInt(startingMatchCount) * 2 - 1;
  if (isNaN(baseFinalMatchNumber) || baseFinalMatchNumber < 1) {
    return null;
  }
  return baseFinalMatchNumber;
}

function getChallongeMatchNumberForSingle(single, matchNumber, isThirdPlace) {
  if (!single?.isChallonge) {
    return matchNumber;
  }
  const thirdPlaceMatchNumber = getThirdPlaceMatchNumber(
    single.startingMatchCount,
    single.hasThirdPlaceMatch
  );
  if (!thirdPlaceMatchNumber) {
    return matchNumber;
  }
  const finalMatchNumber = thirdPlaceMatchNumber + 1;
  if (isThirdPlace || matchNumber === thirdPlaceMatchNumber) {
    return finalMatchNumber;
  }
  if (matchNumber === finalMatchNumber) {
    return thirdPlaceMatchNumber;
  }
  return matchNumber;
}

function getSingleFinalRoundNumberForTournament(single) {
  const baseRounds = getSingleTotalRounds(single.startingMatchCount);
  if (!baseRounds) {
    return 0;
  }
  return single.hasThirdPlaceMatch ? baseRounds + 1 : baseRounds;
}

function hasStartableSingleMatch(single, minRound = 1) {
  if (!single || !single.rounds) {
    return false;
  }
  const startedMatches = new Set(single.matches.map((match) => match.match));
  const rounds = Object.keys(single.rounds)
    .map((round) => parseInt(round, 10))
    .filter((round) => !isNaN(round) && round >= minRound)
    .sort((a, b) => a - b);

  for (const round of rounds) {
    const entries = Array.isArray(single.rounds[round])
      ? single.rounds[round]
      : [];
    const byMatch = new Map();
    for (const entry of entries) {
      if (!entry?.match) {
        continue;
      }
      if (!byMatch.has(entry.match)) {
        byMatch.set(entry.match, []);
      }
      byMatch.get(entry.match).push(entry);
    }
    for (const [matchNumber, matchEntries] of byMatch.entries()) {
      if (startedMatches.has(matchNumber)) {
        continue;
      }
      const validEntries = matchEntries.filter(
        (entry) => entry?.name && entry?.name !== "TBD" && !entry?.isPlaceholder
      );
      if (validEntries.length >= 2) {
        return true;
      }
    }
  }
  return false;
}

function findNextStartableSingleMatch(single, minRound = 1) {
  if (!single || !single.rounds) {
    return null;
  }
  const startedMatches = new Set(single.matches.map((match) => match.match));
  const rounds = Object.keys(single.rounds)
    .map((round) => parseInt(round, 10))
    .filter((round) => !isNaN(round) && round >= minRound)
    .sort((a, b) => a - b);

  for (const round of rounds) {
    const entries = Array.isArray(single.rounds[round])
      ? single.rounds[round]
      : [];
    const byMatch = new Map();
    for (const entry of entries) {
      if (!entry?.match) {
        continue;
      }
      if (!byMatch.has(entry.match)) {
        byMatch.set(entry.match, []);
      }
      byMatch.get(entry.match).push(entry);
    }
    const matchNumbers = Array.from(byMatch.keys()).sort((a, b) => a - b);
    for (const matchNumber of matchNumbers) {
      if (startedMatches.has(matchNumber)) {
        continue;
      }
      const matchEntries = byMatch.get(matchNumber) || [];
      const validEntries = matchEntries.filter(
        (entry) => entry?.name && entry?.name !== "TBD" && !entry?.isPlaceholder
      );
      if (validEntries.length >= 2) {
        return {
          round,
          matchNumber,
          entries: matchEntries,
        };
      }
    }
  }
  return null;
}

function collectStartableSingleMatches(single, minRound = 1) {
  if (!single || !single.rounds) {
    return [];
  }
  const startedMatches = new Set(single.matches.map((match) => match.match));
  const rounds = Object.keys(single.rounds)
    .map((round) => parseInt(round, 10))
    .filter((round) => !isNaN(round) && round >= minRound)
    .sort((a, b) => a - b);

  const startable = [];
  for (const round of rounds) {
    const entries = Array.isArray(single.rounds[round])
      ? single.rounds[round]
      : [];
    const byMatch = new Map();
    for (const entry of entries) {
      if (!entry?.match) {
        continue;
      }
      if (!byMatch.has(entry.match)) {
        byMatch.set(entry.match, []);
      }
      byMatch.get(entry.match).push(entry);
    }
    const matchNumbers = Array.from(byMatch.keys()).sort((a, b) => a - b);
    for (const matchNumber of matchNumbers) {
      if (startedMatches.has(matchNumber)) {
        continue;
      }
      const matchEntries = byMatch.get(matchNumber) || [];
      const validEntries = matchEntries.filter(
        (entry) => entry?.name && entry?.name !== "TBD" && !entry?.isPlaceholder
      );
      if (validEntries.length >= 2) {
        startable.push({
          round,
          matchNumber,
          entries: matchEntries,
        });
      }
    }
  }
  return startable;
}

function ensureThirdPlaceState(single) {
  if (single.hasThirdPlaceMatch === undefined) {
    single.hasThirdPlaceMatch = true;
  }
  if (!Array.isArray(single.thirdPlaceEntrants)) {
    single.thirdPlaceEntrants = [];
  }
}

// Neeed Round, Match Number, Names, Game, Links, Status
// Neeed Round, Match Number, Names, Game, Links, Status
async function StartSingleMatch(
  interaction,
  bot = "",
  secondOfDay = false,
  previousMatches = [],
  hasStartedMatchThisRun = false,
  forcedMatchNumber = null
) {
  var db = GetDb();
  await db.read();
  console.log("Starting Single Match");
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
    return { blocked: true, reason: "no_tournament" };
  }

  let single = tournamentDetails[currentTournamentName];
  ensureThirdPlaceState(single);

  if (
    Array.isArray(previousMatches) &&
    Array.isArray(previousMatches[0]) &&
    previousMatches[0].length > 0
  ) {
    for (const result of previousMatches[0]) {
      await AddSingleWinnerToNextRound(
        result.firstPlace,
        result.round,
        result.isThirdPlace,
        result.match
      );
    }
    await db.read();
    tournamentDetails = await db.get("tournaments").nth(0).value();
    single = tournamentDetails[currentTournamentName];
    ensureThirdPlaceState(single);
  }

  var matchesPerDay = single.roundsPerTurn;

  let previousMatch = single.matches.length;
  let matchNumber = forcedMatchNumber ?? single.matches.length + 1;
  const thirdPlaceMatchNumber = getThirdPlaceMatchNumber(
    single.startingMatchCount,
    single.hasThirdPlaceMatch
  );

  var thisRound = 0;

  var bracket = "";

  let foundEntries = [];

  if (!forcedMatchNumber) {
    const nextStartable = findNextStartableSingleMatch(single, single.round);
    if (nextStartable) {
      matchNumber = nextStartable.matchNumber;
      foundEntries = [...nextStartable.entries];
      thisRound = nextStartable.round;
    }
  }

  if (foundEntries.length < 1) {
    for (var entry of single.rounds[single.round]) {
      if (entry.match == matchNumber) {
        foundEntries.push(entry);
        thisRound = single.round;
      }
    }
  }

  if (foundEntries.length < 1 && thisRound == 0) {
    var nextRound = parseInt(single.round) + 1;
    const nextRoundEntries = Array.isArray(single.rounds[nextRound])
      ? single.rounds[nextRound]
      : [];
    for (var entry of nextRoundEntries) {
      if (entry.match == matchNumber) {
        foundEntries.push(entry);
        thisRound = nextRound;
      }
    }
  }
  if (foundEntries.length < 1) {
    const allRounds = Object.keys(single.rounds)
      .map((roundKey) => parseInt(roundKey, 10))
      .filter((roundKey) => !isNaN(roundKey))
      .sort((a, b) => a - b);
    for (const roundKey of allRounds) {
      const entries = Array.isArray(single.rounds[roundKey])
        ? single.rounds[roundKey]
        : [];
      for (const entry of entries) {
        if (entry.match == matchNumber) {
          foundEntries.push(entry);
          thisRound = roundKey;
        }
      }
      if (foundEntries.length > 0) {
        break;
      }
    }
  }

  if (single.isChallonge && foundEntries.length > 1) {
    foundEntries.sort((a, b) => {
      const seedA = parseInt(a?.challongeSeed || 0, 10);
      const seedB = parseInt(b?.challongeSeed || 0, 10);
      if (seedA && seedB && seedA !== seedB) {
        return seedA - seedB;
      }
      return 0;
    });
  }

  const existingMatch = single.matches.find(
    (match) => parseInt(match.match) === parseInt(matchNumber)
  );
  if (existingMatch && existingMatch.progress !== "tie") {
    if (!forcedMatchNumber) {
      const alternateMatch = findNextStartableSingleMatch(single, 1);
      if (
        alternateMatch &&
        alternateMatch.matchNumber &&
        alternateMatch.matchNumber !== matchNumber
      ) {
        console.log(
          "Match " +
            matchNumber +
            " already exists. Starting alternate match " +
            alternateMatch.matchNumber +
            " instead."
        );
        return await StartSingleMatch(
          interaction,
          bot,
          true,
          [],
          true,
          alternateMatch.matchNumber
        );
      }
    }
    console.log(
      "Match " +
        matchNumber +
        " already exists with progress=" +
        existingMatch.progress +
        ". Skipping."
    );
    return { blocked: true, reason: "match_already_exists" };
  }

  const hasPlaceholderEntrant = foundEntries.some(
    (entry) => entry?.isPlaceholder === true || entry?.name === "TBD"
  );
  if (foundEntries.length < 2 || hasPlaceholderEntrant) {
    const alternateMatch = findNextStartableSingleMatch(single, 1);
    if (
      alternateMatch &&
      alternateMatch.matchNumber &&
      alternateMatch.matchNumber !== matchNumber
    ) {
      console.log(
        "Insufficient entrants for match " +
          matchNumber +
          ". Starting alternate match " +
          alternateMatch.matchNumber +
          " instead."
      );
      return await StartSingleMatch(
        interaction,
        bot,
        true,
        [],
        true,
        alternateMatch.matchNumber
      );
    }
    console.log(
      "There are not enough entrants available for the next match yet."
    );
    const roundNumberForOutstanding = thisRound || parseInt(single.round);
    const finalRoundNumber = getSingleFinalRoundNumberForTournament(single);
    if (roundNumberForOutstanding === finalRoundNumber) {
      console.log(
        "Final round reached; skipping outstanding match notice."
      );
      if (!secondOfDay && previousMatches && previousMatches.length > 0) {
        const guildObject =
          interaction == "" && bot !== ""
            ? await bot.guilds.cache.get(process.env.GUILD_ID)
            : interaction.guild;
        await SendPreviousSingleDayResultsEmbeds(
          guildObject,
          previousMatches,
          { round: roundNumberForOutstanding?.toString() || "" },
          false
        );
      }
      return {
        blocked: true,
        stopForDay: true,
        reason: "final_round_complete",
      };
    }
    if (!secondOfDay && previousMatches && previousMatches.length > 0) {
      const guildObject =
        interaction == "" && bot !== ""
          ? await bot.guilds.cache.get(process.env.GUILD_ID)
          : interaction.guild;
      await SendPreviousSingleDayResultsEmbeds(
        guildObject,
        previousMatches,
        { round: roundNumberForOutstanding?.toString() || "" },
        false
      );
    }

    const hasAnyStartableMatch = hasStartableSingleMatch(single, 1);
    const isFinalRound = roundNumberForOutstanding === finalRoundNumber;
    const isThirdPlaceRound =
      thirdPlaceMatchNumber &&
      roundNumberForOutstanding === getSingleTotalRounds(single.startingMatchCount);

    if (!hasAnyStartableMatch && !hasStartedMatchThisRun) {
      if (isFinalRound || isThirdPlaceRound) {
        console.log(
          "Skipping tie resend: final/third-place round only."
        );
      } else {
        const tiedMatchesToResend = single.matches.filter(
          (match) => match.progress === "tie"
        );
        if (tiedMatchesToResend.length > 0) {
          console.log(
            "Resending tied matches due to insufficient entrants:",
            tiedMatchesToResend.map((match) => match.match).join(",")
          );
          for (const tiedMatch of tiedMatchesToResend) {
            await SendSingleBattleMessage(
              interaction,
              tiedMatch,
              bot,
              single,
              true,
              [],
              { isTieResend: true }
            );
          }
        }
      }
    } else if (hasStartedMatchThisRun) {
      console.log(
        "Skipping tie resend: a match was already started in this run."
      );
    } else if (hasAnyStartableMatch) {
      console.log(
        "Skipping tie resend: other startable matches exist in the bracket."
      );
    }
    return { blocked: true, stopForDay: true, reason: "insufficient_entrants" };
  }

  var stringRound = thisRound.toString();
  const nextRoundNumber = parseInt(stringRound);
  const baseRounds = getSingleTotalRounds(single.startingMatchCount);
  const shouldGateForTies = baseRounds > 0 && thisRound >= baseRounds;
  if (shouldGateForTies) {
    const blockingTies = single.matches.filter(
      (match) =>
        match.progress === "tie" && parseInt(match.round) < nextRoundNumber
    );
    const malformedBlockingTies = blockingTies.filter(
      (match) => !match?.entrant1?.name || !match?.entrant2?.name
    );
    console.log(
      "Blocking tie payloads:",
      JSON.stringify(
        blockingTies.map((match) => ({
          match: match?.match,
          round: match?.round,
          progress: match?.progress,
          entrant1: match?.entrant1,
          entrant2: match?.entrant2,
        })),
        null,
        2
      )
    );
    console.log(
      "Round gate check (no block): currentRound=" +
        stringRound +
        " nextRoundNumber=" +
        nextRoundNumber +
        " blockingTieMatches=" +
        blockingTies.map((match) => match.match).join(",")
    );
    if (malformedBlockingTies.length > 0) {
      console.log(
        "Malformed tie entries (missing entrant names):",
        JSON.stringify(
          malformedBlockingTies.map((match) => ({
            match: match?.match,
            round: match?.round,
            progress: match?.progress,
            entrant1: match?.entrant1,
            entrant2: match?.entrant2,
          })),
          null,
          2
        )
      );
    }
  }

  var matchData = {
    round: stringRound,
    match: matchNumber,
    nextRoundNextMatch: "1",
    isChallonge: single.isChallonge,
    isThirdPlace: matchNumber === thirdPlaceMatchNumber,
    progress: "in-progress",
    entrant1: {
      name: foundEntries[0].name,
      title: foundEntries[0].title,
      link: foundEntries[0].link,
      type: foundEntries[0].type,
      challongeSeed: foundEntries[0].challongeSeed,
      voters: [],
      points: 0,
    },
    entrant2: {
      name: foundEntries[1].name,
      title: foundEntries[1].title,
      link: foundEntries[1].link,
      type: foundEntries[1].type,
      challongeSeed: foundEntries[1].challongeSeed,
      voters: [],
      points: 0,
    },
  };

  single.round = thisRound;
  single.matchNumber = matchNumber;
  single.matches.push(matchData);

  db.get("tournaments")
    .nth(0)
    .assign({
      [currentTournamentName]: single,
    })
    .write();
  if (interaction !== "") {
    await interaction.editReply({
      content: "Looks good.",
      ephemeral: true,
    });
  }

  await SendSingleBattleMessage(
    interaction,
    matchData,
    bot,
    single,
    secondOfDay,
    previousMatches
  );
  if (matchNumber === thirdPlaceMatchNumber) {
    console.log("Third place match posted; stopping further matches for today.");
    return { blocked: false, stopForDay: true, reason: "third_place_day" };
  }
  return { blocked: false };
}

async function StartSingleMatchBatch(
  interaction,
  bot = "",
  previousMatches = [],
  maxMatchesPerDay = 1
) {
  const db = GetDb();
  await db.read();
  const currentTournamentName = await getCurrentTournament(db);
  const tournamentDetails = await db.get("tournaments").nth(0).value();
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
    return { blocked: true, reason: "no_tournament" };
  }

  let single = tournamentDetails[currentTournamentName];
  ensureThirdPlaceState(single);
  if (
    Array.isArray(previousMatches) &&
    Array.isArray(previousMatches[0]) &&
    previousMatches[0].length > 0
  ) {
    for (const completed of previousMatches[0]) {
      if (completed?.firstPlace) {
        await AddSingleWinnerToNextRound(
          completed.firstPlace,
          completed.round,
          completed.isThirdPlace,
          completed.match
        );
      }
    }
    await db.read();
    const refreshed = await db.get("tournaments").nth(0).value();
    single = refreshed[currentTournamentName];
    ensureThirdPlaceState(single);
  }
  const tieMatchesToSend = [];
  if (Array.isArray(single.matches)) {
    const tiedMatches = single.matches
      .filter((match) => match.progress === "tie")
      .sort((a, b) => {
        const roundA = parseInt(a.round);
        const roundB = parseInt(b.round);
        if (roundA !== roundB) {
          return roundA - roundB;
        }
        return parseInt(a.match) - parseInt(b.match);
      });
    tieMatchesToSend.push(...tiedMatches);
  }
  const simulated = JSON.parse(JSON.stringify(single));
  const planned = collectStartableSingleMatches(simulated, 1).slice(
    0,
    maxMatchesPerDay
  );

  if (planned.length === 0 && tieMatchesToSend.length === 0) {
    return await StartSingleMatch(
      interaction,
      bot,
      false,
      previousMatches,
      false
    );
  }

  let lastResult = { blocked: false };
  if (tieMatchesToSend.length > 0) {
    let firstTie = true;
    for (const tiedMatch of tieMatchesToSend) {
      await SendSingleBattleMessage(
        interaction,
        tiedMatch,
        bot,
        single,
        !firstTie,
        firstTie ? previousMatches : [],
        { isTieResend: true }
      );
      firstTie = false;
    }
  }

  if (planned.length > 0) {
    const hasSentFirstMessage = tieMatchesToSend.length > 0;
    for (let i = 0; i < planned.length; i++) {
      const isFirstPlanned = i === 0;
      const secondOfDay = hasSentFirstMessage || !isFirstPlanned;
      const includePreviousMatches =
        !hasSentFirstMessage && isFirstPlanned ? previousMatches : [];
      lastResult = await StartSingleMatch(
        interaction,
        bot,
        secondOfDay,
        includePreviousMatches,
        true,
        planned[i].matchNumber
      );
      if (lastResult?.blocked || lastResult?.stopForDay) {
        break;
      }
    }
  }
  return lastResult;
}

// Digusting method: needs split down. Far too large.
async function EndSingleMatches(interaction = "") {
  var db = GetDb();
  await db.read();
  console.log("Ending Single Matches");
  console.log("TP_SYNC: EndSingleMatches entered");
  let currentTournamentName = await getCurrentTournament(db);

  let tournamentDetails = await db.get("tournaments").nth(0).value();

  if (tournamentDetails.currentTournament == "N/A") {
    if (interaction !== "") {
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

  let single = tournamentDetails[currentTournamentName];
  ensureThirdPlaceState(single);
  var matchesPerDay = single.roundsPerTurn;
  const baseRounds = getSingleTotalRounds(single.startingMatchCount);
  const finalRoundNumber = single.hasThirdPlaceMatch
    ? baseRounds + 1
    : baseRounds;
  const thirdPlaceMatchNumber = getThirdPlaceMatchNumber(
    single.startingMatchCount,
    single.hasThirdPlaceMatch
  );
  console.log(
    "TP_SYNC: third place config",
    "tournament=" + currentTournamentName,
    "baseRounds=" + baseRounds,
    "thirdPlaceMatchNumber=" + thirdPlaceMatchNumber,
    "hasThirdPlaceMatch=" + single.hasThirdPlaceMatch
  );

  var tiedMatches = [];

  var inProgressMatches = [];
  var matchesForEmbed = [];
  var completedMatchesForCompat = [];

  for (var match of single.matches) {
    if (match.progress !== "complete") {
      inProgressMatches.push(match);
    }
  }

  var elimatedArray = [];

  var originalMatch = 0;
  var firstPlaceEntrant = "";
  var secondPlaceEntrant = "";
  var continuedTie = false;
  var previouslyTied = false;

  for (var eliminated of single.eliminated) {
    elimatedArray.push(eliminated);
  }

  for (var match of inProgressMatches) {
    continuedTie = false;
    previouslyTied = false;

    // winnerNum = match.match;
    // loserNum = match.match;
    var firstPlace = {
      name: "",
      title: "",
      link: "",
      match: "",
      type: "",
      challongeSeed: "",
    };

    var secondPlace = {
      name: "",
      title: "",
      link: "",
      match: "",
      type: "",
      challongeSeed: "",
    };

    var winnerExists =
      match.entrant1.points > match.entrant2.points ||
      match.entrant2.points > match.entrant1.points;
    console.log("Going through match: " + match.match);
    if (!winnerExists) {
      tiedMatches.push(match);

      firstPlace.name = "placeholder";
      firstPlace.match = match.match;
      firstPlace.link = [match.entrant1.link, match.entrant2.link];

      secondPlace.name = "placeholder";
      secondPlace.match = match.match;
      secondPlace.link = [match.entrant1.link, match.entrant2.link];

      if (match.progress == "tie") {
        continuedTie = true;
      }
      match.progress = "tie";

      var matchObj = single.matches.find(
        (dbMatch) => dbMatch.match == match.match
      );

      matchObj = match;
      originalMatch = match.match;

      firstPlace = match.entrant1;
      secondPlace = match.entrant2;
    } else {
      originalMatch = match.match;

      if (parseInt(match.entrant1.points) > parseInt(match.entrant2.points)) {
        firstPlace = {
          name: match.entrant1.name,
          title: match.entrant1.title,
          link: match.entrant1.link,
          match: match.match,
          type: match.entrant1.type,
          challongeSeed: match.entrant1.challongeSeed,
          points: match.entrant1.points,
          voters: match.entrant1.voters,
          voteLetter: "A",
        };
        secondPlace = {
          name: match.entrant2.name,
          title: match.entrant2.title,
          link: match.entrant2.link,
          match: match.match,
          type: match.entrant2.type,
          challongeSeed: match.entrant2.challongeSeed,
          points: match.entrant2.points,
          voters: match.entrant2.voters,
          voteLetter: "B",
        };
        firstPlaceEntrant = match.entrant1;
        secondPlaceEntrant = match.entrant2;
      } else if (
        parseInt(match.entrant2.points) > parseInt(match.entrant1.points)
      ) {
        firstPlace = {
          name: match.entrant2.name,
          title: match.entrant2.title,
          link: match.entrant2.link,
          match: match.match,
          type: match.entrant2.type,
          challongeSeed: match.entrant2.challongeSeed,
          points: match.entrant2.points,
          voters: match.entrant2.voters,
          voteLetter: "B",
        };
        secondPlace = {
          name: match.entrant1.name,
          title: match.entrant1.title,
          link: match.entrant1.link,
          match: match.match,
          type: match.entrant1.type,
          challongeSeed: match.entrant1.challongeSeed,
          points: match.entrant1.points,
          voters: match.entrant1.voters,
          voteLetter: "A",
        };

        firstPlaceEntrant = match.entrant2;
        secondPlaceEntrant = match.entrant1;
      }
      // var winnerMatchNumber = parseInt(winner.match);
      // var loserMatchNumber = parseInt(loser.match);
      //
      if (match.progress == "tie") {
        previouslyTied = true;
      }
      match.progress = "complete";
      var matchObj = single.matches.find(
        (dbMatch) => dbMatch.match == match.match
      );
      matchObj = match;
      completedMatchesForCompat.push(match);

    if (
      single.hasThirdPlaceMatch &&
      thirdPlaceMatchNumber &&
      baseRounds > 0 &&
      parseInt(match.round) === baseRounds - 1
    ) {
      const alreadyTracked = single.thirdPlaceEntrants.some(
        (entrant) => entrant.fromMatch == match.match
      );
      if (!alreadyTracked) {
        single.thirdPlaceEntrants.push({
          name: secondPlace.name,
          title: secondPlace.title,
          link: secondPlace.link,
          type: secondPlace.type,
          challongeSeed: secondPlace.challongeSeed,
          match: thirdPlaceMatchNumber,
          fromMatch: match.match,
          round: baseRounds,
        });
      }
    }

      if (single.isChallonge) {
        const challongeResults =
          match.entrant1.points + "-" + match.entrant2.points;
        const thirdPlaceMatchNumber = getThirdPlaceMatchNumber(
          single.startingMatchCount,
          single.hasThirdPlaceMatch
        );
        const finalMatchNumber = thirdPlaceMatchNumber
          ? thirdPlaceMatchNumber + 1
          : null;
        let matchType = null;
        if (match.isThirdPlace || match.match === thirdPlaceMatchNumber) {
          matchType = "third_place";
        } else if (finalMatchNumber && match.match === finalMatchNumber) {
          matchType = "final";
        }

        endMatchByNumber(
          replaceSpacesWithUnderlines(currentTournamentName.replace(/-/g, " ")),
          match.match,
          challongeResults,
          matchType ? { matchType } : {}
        );
      }
    }

    /*
       var firstPlace = {
      name: "",
      title: "",
      link: "",
      match: "",
    };
    */
    //  loser.match = loserMatchNumber;

    var embedDetails = {
      round: match.round,
      match: originalMatch,
      isThirdPlace: match.isThirdPlace,
      firstPlace: {
        name: firstPlace.name,
        title: firstPlace.title,
        link: firstPlace.link,
        type: firstPlace.type,
        challongeSeed: firstPlace.challongeSeed,
        voters: firstPlace.voters,
        points: firstPlace.points,
        voteLetter: firstPlace.voteLetter,
      },
      secondPlace: {
        name: secondPlace.name,
        title: secondPlace.title,
        link: secondPlace.link,
        type: secondPlace.type,
        challongeSeed: secondPlace.challongeSeed,
        voters: secondPlace.voters,
        points: secondPlace.points,
        voteLetter: secondPlace.voteLetter,
      },
    };
    if (firstPlaceEntrant.points > secondPlaceEntrant.points) {
      matchesForEmbed.push(embedDetails);
    }

    //elimatedArray.push(secondPlace);
    //  }
    single.eliminated = elimatedArray;
    //}
  }

  if (single.hasThirdPlaceMatch && thirdPlaceMatchNumber && baseRounds > 0) {
    console.log("TP_SYNC: entering third place sync block");
    const semifinalMatches = single.matches.filter(
      (match) =>
        parseInt(match.round) === baseRounds - 1 &&
        match.isThirdPlace !== true
    );
    if (!single.rounds[baseRounds]) {
      single.rounds[baseRounds] = [];
    }

    const existingByFromMatch = new Map(
      single.rounds[baseRounds].map((entry) => [entry.fromMatch, entry])
    );
    const thirdPlaceEntrants = [];

    console.log(
      "Third place sync:",
      "baseRounds=" + baseRounds,
      "semifinalMatches=" + semifinalMatches.map((match) => match.match).join(","),
      "round3Entries=" + (single.rounds[baseRounds]?.length || 0)
    );

    for (const match of semifinalMatches) {
      const entrant1Points = parseInt(match.entrant1.points);
      const entrant2Points = parseInt(match.entrant2.points);
      const isTie =
        match.progress === "tie" || entrant1Points === entrant2Points;
      const loser = isTie
        ? null
        : entrant1Points > entrant2Points
        ? match.entrant2
        : match.entrant1;

      const desiredEntry = loser
        ? {
            name: loser.name,
            title: loser.title,
            link: loser.link,
            type: loser.type,
            challongeSeed: loser.challongeSeed,
            match: thirdPlaceMatchNumber,
            fromMatch: match.match,
          }
        : {
            name: "TBD",
            title: "TBD",
            link: "",
            type: "",
            challongeSeed: "",
            match: thirdPlaceMatchNumber,
            fromMatch: match.match,
            isPlaceholder: true,
          };

      const existing = existingByFromMatch.get(match.match);
      if (
        !existing ||
        (existing.isPlaceholder === true && desiredEntry.isPlaceholder !== true)
      ) {
        single.rounds[baseRounds] = single.rounds[baseRounds].filter(
          (entry) => entry.fromMatch !== match.match
        );
        single.rounds[baseRounds].push(desiredEntry);
      }

      if (!desiredEntry.isPlaceholder) {
        thirdPlaceEntrants.push({
          ...desiredEntry,
          round: baseRounds,
        });
      }
    }

    single.thirdPlaceEntrants = thirdPlaceEntrants;
  }

  await db
    .get("tournaments")
    .nth(0)
    .assign({
      [currentTournamentName]: single,
    })
    .write();

  UpdateCompatibilityForMatches(
    currentTournamentName,
    "Single Elimination",
    completedMatchesForCompat
  );
  if (interaction !== "") {
    await interaction.editReply({
      content: "Looks good.",
      ephemeral: true,
    });
  }
  return [matchesForEmbed, tiedMatches];
  //SendDoubleElimBattleMessage(interaction, matchData);
}
