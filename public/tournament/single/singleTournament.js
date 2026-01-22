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
  previousMatches = []
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

  var matchesPerDay = single.roundsPerTurn;

  let previousMatch = single.matches.length;
  let matchNumber = single.matches.length + 1;
  const thirdPlaceMatchNumber = getThirdPlaceMatchNumber(
    single.startingMatchCount,
    single.hasThirdPlaceMatch
  );

  var thisRound = 0;

  var bracket = "";

  let foundEntries = [];

  for (var entry of single.rounds[single.round]) {
    if (entry.match == matchNumber) {
      foundEntries.push(entry);
      thisRound = single.round;
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

  if (foundEntries.length < 2) {
    console.log(
      "There are not enough entrants available for the next match yet."
    );
    const roundNumberForOutstanding = thisRound || parseInt(single.round);
    let roundsToCheck = "";
    if (!isNaN(roundNumberForOutstanding)) {
      for (const match of single.matches) {
        if (
          parseInt(match.round) === parseInt(roundNumberForOutstanding) &&
          match.progress !== "complete"
        ) {
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
    }
    let message =
      "\n❗There are still outstanding matches in this round.❗\nPlease vote on or reconsider these matches before we continue into the next round: ";
    if (roundsToCheck) {
      message += roundsToCheck;
    }
    if (interaction !== "") {
      await interaction.editReply({
        content: message,
        ephemeral: true,
      });
    }
    console.log(message);
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
    return { blocked: true, stopForDay: true, reason: "insufficient_entrants" };
  }

  var stringRound = thisRound.toString();
  const nextRoundNumber = parseInt(stringRound);
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
    "Round gate check: currentRound=" +
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
  const hasBlockingTie = blockingTies.length > 0;
  if (hasBlockingTie) {
    let roundsToCheck = "";
    for (const match of blockingTies) {
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
    let message =
      "\n❗There are still outstanding matches in this round.❗\nPlease vote on or reconsider these matches before we continue into the next round: ";
    if (roundsToCheck) {
      message += roundsToCheck;
    }
    if (interaction !== "") {
      await interaction.editReply({
        content: message,
        ephemeral: true,
      });
    }
    console.log(message);
    if (!secondOfDay && previousMatches && previousMatches.length > 0) {
      const guildObject =
        interaction == "" && bot !== ""
          ? await bot.guilds.cache.get(process.env.GUILD_ID)
          : interaction.guild;
      await SendPreviousSingleDayResultsEmbeds(
        guildObject,
        previousMatches,
        { round: stringRound },
        false
      );
    }
    return { blocked: true, reason: "tie_block" };
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

// Digusting method: needs split down. Far too large.
async function EndSingleMatches(interaction = "") {
  var db = GetDb();
  await db.read();
  console.log("Ending Single Matches");
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

        endMatchByNumber(
          replaceSpacesWithUnderlines(currentTournamentName),
          match.match,
          challongeResults
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

  if (
    single.hasThirdPlaceMatch &&
    thirdPlaceMatchNumber &&
    baseRounds > 0 &&
    single.thirdPlaceEntrants.length === 2
  ) {
    if (!single.rounds[baseRounds]) {
      single.rounds[baseRounds] = [];
    }
    const existingThirdPlaceEntries = single.rounds[baseRounds].filter(
      (entry) => entry.match == thirdPlaceMatchNumber
    );
    if (existingThirdPlaceEntries.length < 2) {
      const existingNames = new Set(
        existingThirdPlaceEntries.map((entry) => entry.name)
      );
      for (const entrant of single.thirdPlaceEntrants) {
        if (existingNames.has(entrant.name)) {
          continue;
        }
        single.rounds[baseRounds].push({
          name: entrant.name,
          title: entrant.title,
          link: entrant.link,
          type: entrant.type,
          challongeSeed: entrant.challongeSeed,
          match: thirdPlaceMatchNumber,
          fromMatch: entrant.fromMatch,
        });
      }
    }
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
