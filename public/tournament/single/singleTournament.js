const { Client, ButtonBuilder, EmbedBuilder } = require("discord.js");
const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const csvParser = require("csv-parser");
const fs = require("fs");
const path = require("path");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/database/write.js") + "");
eval(fs.readFileSync("./public/tournament/tournamentutils.js") + "");
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
    return;
  }

  let single = tournamentDetails[currentTournamentName];

  var matchesPerDay = single.roundsPerTurn;

  let previousMatch = single.matches.length;
  let matchNumber = single.matches.length + 1;

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
    for (var entry of single.rounds[nextRound]) {
      if (entry.match == matchNumber) {
        foundEntries.push(entry);
        thisRound = nextRound;
      }
    }
  }

  var stringRound = thisRound.toString();

  var matchData = {
    round: stringRound,
    match: matchNumber,
    nextRoundNextMatch: "1",
    isChallonge: single.isChallonge,
    progress: "in-progress",
    entrant1: {
      name: foundEntries[0].name,
      title: foundEntries[0].title,
      link: foundEntries[0].link,
      //contest: foundEntries[0].contest,
      challongeSeed: foundEntries[0].challongeSeed,
      voters: [],
      points: 0,
    },
    entrant2: {
      name: foundEntries[1].name,
      title: foundEntries[1].title,
      link: foundEntries[1].link,
      //contest: foundEntries[1].contest,
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

  SendSingleBattleMessage(
    interaction,
    matchData,
    bot,
    single,
    secondOfDay,
    previousMatches
  );
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
  var matchesPerDay = single.roundsPerTurn;

  var tiedMatches = [];

  var inProgressMatches = [];
  var matchesForEmbed = [];

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
      contest: "",
      challongeSeed: "",
    };

    var secondPlace = {
      name: "",
      title: "",
      link: "",
      match: "",
      contest: "",
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
          //contest: match.entrant1.contest,
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
          //contest: match.entrant2.contest,
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
          //contest: match.entrant2.contest,
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
          //contest: match.entrant1.contest,
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
      firstPlace: {
        name: firstPlace.name,
        title: firstPlace.title,
        link: firstPlace.link,
        //contest: firstPlace.contest,
        challongeSeed: firstPlace.challongeSeed,
        voters: firstPlace.voters,
        points: firstPlace.points,
        voteLetter: firstPlace.voteLetter,
      },
      secondPlace: {
        name: secondPlace.name,
        title: secondPlace.title,
        link: secondPlace.link,
        //contest: secondPlace.contest,
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

  await db
    .get("tournaments")
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
  return [matchesForEmbed, tiedMatches];
  //SendDoubleElimBattleMessage(interaction, matchData);
}
