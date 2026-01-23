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
eval(fs.readFileSync("./public/tournament/doubleElim/doubleelimtournamentmessages.js") + "");

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
    if (
      match.progress === "tie" &&
      parseInt(match.round) < roundThreshold
    ) {
      roundsToCheck +=
        "\n**Match " +
        match.match +
        "**: " +
        match.entrant1.name +
        " vs " +
        match.entrant2.name;
    }
  }
  return roundsToCheck;
}

// Neeed Round, Match Number, Names, Game, Links, Status
async function StartDoubleElimMatch(
  interaction,
  bot = "",
  secondOfDay = false,
  previousMatches = []
) {
  var db = GetDb();
  await db.read();
  console.log("Starting Double Elimination Match");
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

  let doubleElimination = tournamentDetails[currentTournamentName];

  var matchesPerDay = doubleElimination.roundsPerTurn;
  let matchNumber = doubleElimination.matches.length + 1;

  var thisRound = 0;

  var bracket = "";

  let foundEntries = [];

  for (var entry of doubleElimination.brackets) {
    if (entry.match == matchNumber) {
      foundEntries.push(entry);
      thisRound = entry.round;
      bracket = entry.bracket;
    }
  }

  var stringRound = thisRound.toString();
  const nextRoundNumber = parseInt(stringRound);
  const hasBlockingTie = doubleElimination.matches.some(
    (match) =>
      match.progress === "tie" &&
      parseInt(match.round) < nextRoundNumber
  );
  if (hasBlockingTie) {
    const roundsToCheck = buildTieRoundsToCheck(
      doubleElimination.matches,
      nextRoundNumber
    );
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
    return;
  }

  console.log("Double Elimination  obejct: " + doubleElimination);
  var matchData = {
    braket: bracket,
    round: stringRound,
    match: matchNumber,
    challongeMatchNumber: foundEntries[0].challongeId,
    progress: "in-progress",
    entrant1: {
      name: foundEntries[0].name,
      title: foundEntries[0].title,
      link: foundEntries[0].link,
      challongeEntrantId: foundEntries[0].userId,
      voters: [],
      points: 0,
    },
    entrant2: {
      name: foundEntries[1].name,
      title: foundEntries[1].title,
      link: foundEntries[1].link,
      challongeEntrantId: foundEntries[1].userId,
      voters: [],
      points: 0,
    },
  };
  doubleElimination.matchNumber = matchNumber;
  doubleElimination.matches.push(matchData);
  const urlName = replaceSpacesWithUnderlines(
    currentTournamentName.replace(/-/g, " ")
  );

  var challongeMatchId = matchData.challongeMatchNumber;
  console.log("MatchID = " + challongeMatchId);
  await startChallongeMatch(urlName, challongeMatchId);

  db.get("tournaments")
    .nth(0)
    .assign({
      [currentTournamentName]: doubleElimination,
    })
    .write();
  if (interaction !== "") {
    await interaction.editReply({
      content: "Looks good.",
      ephemeral: true,
    });
  }

  SendDoubleElimBattleMessage(
    interaction,
    matchData,
    bot,
    secondOfDay,
    previousMatches
  );
}

// Digusting method: needs split down. Far too large.
async function EndDoubleElimMatches(interaction = "") {
  var db = GetDb();
  await db.read();
  console.log("Ending Double Elimination Matches");
  let currentTournamentName = await getCurrentTournament(db);
  const urlName = replaceSpacesWithUnderlines(
    currentTournamentName.replace(/-/g, " ")
  );

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

  let doubleElimination = tournamentDetails[currentTournamentName];
  var matchesPerDay = doubleElimination.roundsPerTurn;

  var tiedMatches = [];
  var bracket = doubleElimination.currentBracket;

  var inProgressMatches = [];
  var matchesForEmbed = [];
  var completedMatchesForCompat = [];

  for (var match of doubleElimination.matches) {
    if (match.progress !== "complete") {
      inProgressMatches.push(match);
    }
  }

  var elimatedArray = [];

  var originalMatch = 0;
  var winnerEntrant = "";
  var loserEntrant = "";
  var continuedTie = false;
  var perviouslyTied = false;

  for (var eliminated of doubleElimination.eliminated) {
    elimatedArray.push(eliminated);
  }

  for (var match of inProgressMatches) {
    continuedTie = false;
    perviouslyTied = false;
    var bracket = match.braket;

    // winnerNum = match.match;
    // loserNum = match.match;
    var winner = {
      name: "",
      title: "",
      link: "",
      match: "",
    };

    var loser = {
      name: "",
      title: "",
      link: "",
      match: "",
    };

    console.log("Going through match: " + match.match);
    if (match.entrant1.points == match.entrant2.points) {
      tiedMatches.push(match);
      winner.name = "placeholder";
      winner.match = match.match;
      winner.link = [match.entrant1.link, match.entrant2.link];
      loser.name = "placeholder";
      loser.match = match.match;
      loser.lnk = [match.entrant1.link, match.entrant2.link];

      if (match.progress == "tie") {
        continuedTie = true;
      }
      match.progress = "tie";

      var matchObj = doubleElimination.matches.find(
        (dbMatch) => dbMatch.match == match.match
      );

      matchObj = match;
      originalMatch = match.match;

      winnerEntrant = match.entrant1;
      loserEntrant = match.entrant2;
    } else {
      originalMatch = match.match;

      if (parseInt(match.entrant1.points) > parseInt(match.entrant2.points)) {
        winner = {
          name: match.entrant1.name,
          title: match.entrant1.title,
          link: match.entrant1.link,
          match: match.match,
          voteLetter: "A",
        };
        loser = {
          name: match.entrant2.name,
          title: match.entrant2.title,
          link: match.entrant2.link,
          match: match.match,
          voteLetter: "B",
        };
        winnerEntrant = match.entrant1;
        loserEntrant = match.entrant2;
      }
      if (parseInt(match.entrant2.points) > parseInt(match.entrant1.points)) {
        winner = {
          name: match.entrant2.name,
          title: match.entrant2.title,
          link: match.entrant2.link,
          match: match.match,
          voteLetter: "B",
        };
        loser = {
          name: match.entrant1.name,
          title: match.entrant1.title,
          link: match.entrant1.link,
          match: match.match,
          voteLetter: "A",
        };
        winnerEntrant = match.entrant2;
        loserEntrant = match.entrant1;
      }
      // var winnerMatchNumber = parseInt(winner.match);
      // var loserMatchNumber = parseInt(loser.match);
      //
      if (match.progress == "tie") {
        perviouslyTied = true;
      }
      match.progress = "complete";
      var matchObj = doubleElimination.matches.find(
        (dbMatch) => dbMatch.match == match.match
      );
      matchObj = match;
      completedMatchesForCompat.push(match);
    }

    //  winnerMatchNumber += baseNum;
    //  winnerMatchNumber += baseNum / 2;
    //  winner.match = winnerMatchNumber;
    //
    //  loserMatchNumber += baseNum;
    //  loser.match = loserMatchNumber;

    var embedDetails = {
      round: winnerEntrant.round,
      bracket: bracket,
      match: originalMatch,
      challongeMatchNumber: match.challongeMatchNumber,
      winner: {
        name: winnerEntrant.name,
        title: winnerEntrant.title,
        link: winnerEntrant.link,
        voters: winnerEntrant.voters,
        points: winnerEntrant.points,
        voteLetter: winner.voteLetter,
      },
      loser: {
        name: loserEntrant.name,
        title: loserEntrant.title,
        link: loserEntrant.link,
        voters: loserEntrant.voters,
        points: loserEntrant.points,
        voteLetter: loser.voteLetter,
      },
    };
    if (embedDetails.winner.points !== embedDetails.loser.points) {
      matchesForEmbed.push(embedDetails);
      console.log(
        "matches length: " +
          matchesForEmbed.length +
          " Z|ZZZZZZZZZZZZZZZZZZZZZZZZ"
      );

      console.log(match.entrant1);
      var winnerId =
        match.entrant1.points > match.entrant2.points
          ? match.entrant1.challongeEntrantId
          : match.entrant2.challongeEntrantId;
      console.log("Winner ID is : " + winnerId);
      var csv = match.entrant1.points + "-" + match.entrant2.points;

      await endChallongeMatch(
        urlName,
        embedDetails.challongeMatchNumber,
        csv,
        winnerId
      );
      await unmarkChallongeMatch(urlName, embedDetails.challongeMatchNumber);
      await completeChallongeMatch(urlName, embedDetails.challongeMatchNumber);
    }

    // //
    if (!continuedTie) {
      if (perviouslyTied && match.bracket == "losersBracket") {
        elimatedArray.push(loser);
      } else {
        if (bracket == "losersBracket") {
          elimatedArray.push(loser);
        }
        doubleElimination.eliminated = elimatedArray;
      }
    }
  }

  await db
    .get("tournaments")
    .nth(0)
    .assign({
      [currentTournamentName]: doubleElimination,
    })
    .write();

  UpdateCompatibilityForMatches(
    currentTournamentName,
    "Double Elimination",
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

function replaceSpacesWithUnderlines(str) {
  return str.replace(/ /g, "_");
}
