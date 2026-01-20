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
  fs.readFileSync("./public/tournament/triple/tripletournamentmessages.js") + ""
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
async function StartTripleMatch(
  interaction,
  bot = "",
  secondOfDay = false,
  previousMatches = []
) {
  var db = GetDb();
  await db.read();
  console.log("Starting Triple Match");
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

  let triple = tournamentDetails[currentTournamentName];

  var matchesPerDay = triple.roundsPerTurn;

  let previousMatch = triple.matches.length;
  let matchNumber = triple.matches.length + 1;

  var thisRound = 0;

  var bracket = "";

  let foundEntries = [];

  for (var entry of triple.rounds[triple.round]) {
    if (entry.match == matchNumber) {
      foundEntries.push(entry);
      thisRound = triple.round;
    }
  }

  if (foundEntries.length < 1 && thisRound == 0) {
    var nextRound = parseInt(triple.round) + 1;
    for (var entry of triple.rounds[nextRound]) {
      if (entry.match == matchNumber) {
        foundEntries.push(entry);
        thisRound = nextRound;
      }
    }
  }

  var stringRound = thisRound.toString();

  console.log("Triple  obejct: " + triple);
  var matchData = {}/*
    round: stringRound,
    match: matchNumber,
    nextRoundNextMatch: triple.nextRoundNextMatch,
    progress: "in-progress",
    entrant1: {
      name: foundEntries[0].name,
      title: foundEntries[0].title,
      link: foundEntries[0].link,
      voters: {
        first: [],
        second: [],
      },
      points: 0,
    },
    entrant2: {
      name: foundEntries[1].name,
      title: foundEntries[1].title,
      link: foundEntries[1].link,
      voters: {
        first: [],
        second: [],
      },
      points: 0,
    },
    entrant3: {
      name: foundEntries[2].name,
      title: foundEntries[2].title,
      link: foundEntries[2].link,
      voters: {
        first: [],
        second: [],
      },
      points: 0,
    },
  };*/

  triple.round = thisRound;
  triple.matchNumber = matchNumber;
  triple.matches.push(matchData);

  db.get("tournaments")
    .nth(0)
    .assign({
      [currentTournamentName]: triple,
    })
    .write();
  if (interaction !== "") {
    await interaction.editReply({
      content: "Looks good.",
      ephemeral: true,
    });
  }
  SendTripleBattleMessage(
    interaction,
    matchData,
    bot,
    triple,
    secondOfDay,
    previousMatches
  );
}

// Digusting method: needs split down. Far too large.
async function EndTripleMatches(interaction = "") {
  var db = GetDb();
  await db.read();
  console.log("Ending Triple Matches");
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

  let triple = tournamentDetails[currentTournamentName];
  var matchesPerDay = triple.roundsPerTurn;

  var tiedMatches = [];

  var inProgressMatches = [];
  var matchesForEmbed = [];
  var completedMatchesForCompat = [];

  for (var match of triple.matches) {
    if (match.progress !== "complete") {
      inProgressMatches.push(match);
    }
  }

  var elimatedArray = [];

  var originalMatch = 0;
  var firstPlaceEntrant = "";
  var secondPlaceEntrant = "";
  var thirdPlaceEntrant = "";
  var continuedTie = false;
  var previouslyTied = false;

  for (var eliminated of triple.eliminated) {
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
    };

    var secondPlace = {
      name: "",
      title: "",
      link: "",
      match: "",
    };

    var thirdPlace = {
      name: "",
      title: "",
      link: "",
      match: "",
    };

    var winnerExists =
      (match.entrant1.points > match.entrant2.points &&
        match.entrant1.points > match.entrant3.points) ||
      (match.entrant2.points > match.entrant1.points &&
        match.entrant2.points > match.entrant3.points) ||
      (match.entrant3.points > match.entrant1.points &&
        match.entrant3.points > match.entrant2.points);
    console.log("Going through match: " + match.match);
    if (!winnerExists) {
      tiedMatches.push(match);

      firstPlace.name = "placeholder";
      firstPlace.match = match.match;
      firstPlace.link = [
        match.entrant1.link,
        match.entrant2.link,
        match.entrant3.link,
      ];

      secondPlace.name = "placeholder";
      secondPlace.match = match.match;
      secondPlace.link = [
        match.entrant1.link,
        match.entrant2.link,
        match.entrant3.link,
      ];

      thirdPlace.name = "placeholder";
      thirdPlace.match = match.match;
      thirdPlace.lnk = [
        match.entrant1.link,
        match.entrant2.link,
        match.entrant3.link,
      ];

      if (match.progress == "tie") {
        continuedTie = true;
      }
      match.progress = "tie";

      var matchObj = triple.matches.find(
        (dbMatch) => dbMatch.match == match.match
      );

      matchObj = match;
      originalMatch = match.match;

      firstPlace = match.entrant1;
      secondPlace = match.entrant2;
      thirdPlace = match.entrant3;
    } else {
      originalMatch = match.match;

      if (
        parseInt(match.entrant1.points) > parseInt(match.entrant2.points) &&
        parseInt(match.entrant2.points) >= parseInt(match.entrant3.points)
      ) {
        firstPlace = {
          name: match.entrant1.name,
          title: match.entrant1.title,
          link: match.entrant1.link,
          match: match.match,
          points: match.entrant1.points,
          voters: match.entrant1.voters,
          voteLetter: "A",
        };
        secondPlace = {
          name: match.entrant2.name,
          title: match.entrant2.title,
          link: match.entrant2.link,
          match: match.match,
          points: match.entrant2.points,
          voters: match.entrant2.voters,
          voteLetter: "B",
        };
        thirdPlace = {
          name: match.entrant3.name,
          title: match.entrant3.title,
          link: match.entrant3.link,
          match: match.match,
          points: match.entrant3.points,
          voters: match.entrant3.voters,
          voteLetter: "C",
        };
        firstPlaceEntrant = match.entrant1;
        secondPlaceEntrant = match.entrant2;
        thirdPlaceEntrant = match.entrant3;
      } else if (
        parseInt(match.entrant1.points) > parseInt(match.entrant3.points) &&
        parseInt(match.entrant3.points) >= parseInt(match.entrant2.points)
      ) {
        firstPlace = {
          name: match.entrant1.name,
          title: match.entrant1.title,
          link: match.entrant1.link,
          match: match.match,
          points: match.entrant1.points,
          voters: match.entrant1.voters,
          voteLetter: "A",
        };
        secondPlace = {
          name: match.entrant3.name,
          title: match.entrant3.title,
          link: match.entrant3.link,
          match: match.match,
          points: match.entrant3.points,
          voters: match.entrant3.voters,
          voteLetter: "C",
        };
        thirdPlace = {
          name: match.entrant2.name,
          title: match.entrant2.title,
          link: match.entrant2.link,
          match: match.match,
          points: match.entrant2.points,
          voters: match.entrant2.voters,
          voteLetter: "B",
        };
        firstPlaceEntrant = match.entrant1;
        secondPlaceEntrant = match.entrant3;
        thirdPlaceEntrant = match.entrant2;
      } else if (
        parseInt(match.entrant2.points) > parseInt(match.entrant1.points) &&
        parseInt(match.entrant1.points) >= parseInt(match.entrant3.points)
      ) {
        firstPlace = {
          name: match.entrant2.name,
          title: match.entrant2.title,
          link: match.entrant2.link,
          match: match.match,
          points: match.entrant2.points,
          voters: match.entrant2.voters,
          voteLetter: "B",
        };
        secondPlace = {
          name: match.entrant1.name,
          title: match.entrant1.title,
          link: match.entrant1.link,
          match: match.match,
          points: match.entrant1.points,
          voters: match.entrant1.voters,
          voteLetter: "A",
        };
        thirdPlace = {
          name: match.entrant3.name,
          title: match.entrant3.title,
          link: match.entrant3.link,
          match: match.match,
          points: match.entrant3.points,
          voters: match.entrant3.voters,
          voteLetter: "C",
        };
        firstPlaceEntrant = match.entrant2;
        secondPlaceEntrant = match.entrant1;
        thirdPlaceEntrant = match.entrant3;
      } else if (
        parseInt(match.entrant2.points) > parseInt(match.entrant3.points) &&
        parseInt(match.entrant3.points) >= parseInt(match.entrant1.points)
      ) {
        firstPlace = {
          name: match.entrant2.name,
          title: match.entrant2.title,
          link: match.entrant2.link,
          match: match.match,
          points: match.entrant2.points,
          voters: match.entrant2.voters,
          voteLetter: "B",
        };
        secondPlace = {
          name: match.entrant3.name,
          title: match.entrant3.title,
          link: match.entrant3.link,
          match: match.match,
          points: match.entrant3.points,
          voters: match.entrant3.voters,
          voteLetter: "C",
        };
        thirdPlace = {
          name: match.entrant1.name,
          title: match.entrant1.title,
          link: match.entrant1.link,
          match: match.match,
          points: match.entrant1.points,
          voters: match.entrant1.voters,
          voteLetter: "A",
        };
        firstPlaceEntrant = match.entrant2;
        secondPlaceEntrant = match.entrant3;
        thirdPlaceEntrant = match.entrant1;
      } else if (
        parseInt(match.entrant3.points) > parseInt(match.entrant1.points) &&
        parseInt(match.entrant1.points) >= parseInt(match.entrant2.points)
      ) {
        firstPlace = {
          name: match.entrant3.name,
          title: match.entrant3.title,
          link: match.entrant3.link,
          match: match.match,
          points: match.entrant3.points,
          voters: match.entrant3.voters,
          voteLetter: "C",
        };
        secondPlace = {
          name: match.entrant1.name,
          title: match.entrant1.title,
          link: match.entrant1.link,
          match: match.match,
          points: match.entrant1.points,
          voters: match.entrant1.voters,
          voteLetter: "A",
        };
        thirdPlace = {
          name: match.entrant2.name,
          title: match.entrant2.title,
          link: match.entrant2.link,
          match: match.match,
          points: match.entrant2.points,
          voters: match.entrant2.voters,
          voteLetter: "B",
        };
        firstPlaceEntrant = match.entrant3;
        secondPlaceEntrant = match.entrant1;
        thirdPlaceEntrant = match.entrant2;
      } else if (
        parseInt(match.entrant3.points) > parseInt(match.entrant2.points) &&
        parseInt(match.entrant2.points) >= parseInt(match.entrant1.points)
      ) {
        firstPlace = {
          name: match.entrant3.name,
          title: match.entrant3.title,
          link: match.entrant3.link,
          match: match.match,
          points: match.entrant3.points,
          voters: match.entrant3.voters,
          voteLetter: "C",
        };
        secondPlace = {
          name: match.entrant2.name,
          title: match.entrant2.title,
          link: match.entrant2.link,
          match: match.match,
          points: match.entrant2.points,
          voters: match.entrant2.voters,
          voteLetter: "B",
        };
        thirdPlace = {
          name: match.entrant1.name,
          title: match.entrant1.title,
          link: match.entrant1.link,
          match: match.match,
          points: match.entrant1.points,
          voters: match.entrant1.voters,
          voteLetter: "A",
        };
        firstPlaceEntrant = match.entrant3;
        secondPlaceEntrant = match.entrant2;
        thirdPlaceEntrant = match.entrant1;
      }
      // var winnerMatchNumber = parseInt(winner.match);
      // var loserMatchNumber = parseInt(loser.match);
      //
      if (match.progress == "tie") {
        previouslyTied = true;
      }
      match.progress = "complete";
      var matchObj = triple.matches.find(
        (dbMatch) => dbMatch.match == match.match
      );
      matchObj = match;
      completedMatchesForCompat.push(match);
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
        voters: firstPlace.voters,
        points: firstPlace.points,
        voteLetter: firstPlace.voteLetter,
      },
      secondPlace: {
        name: secondPlace.name,
        title: secondPlace.title,
        link: secondPlace.link,
        voters: secondPlace.voters,
        points: secondPlace.points,
        voteLetter: secondPlace.voteLetter,
      },
      thirdPlace: {
        name: thirdPlace.name,
        title: thirdPlace.title,
        link: thirdPlace.link,
        voters: thirdPlace.voters,
        points: thirdPlace.points,
        voteLetter: thirdPlace.voteLetter,
      },
    };
    if (firstPlaceEntrant.points > secondPlaceEntrant.points) {
      matchesForEmbed.push(embedDetails);
    }

    //if (!continuedTie) {
    //  if (previouslyTied) {
    //    elimatedArray.push(secondPlace, thirdPlace);
    //  } else {
    elimatedArray.push(secondPlace, thirdPlace);
    //  }
    triple.eliminated = elimatedArray;
    //}
  }

  await db
    .get("tournaments")
    .nth(0)
    .assign({
      [currentTournamentName]: triple,
    })
    .write();

  UpdateCompatibilityForMatches(
    currentTournamentName,
    "3v3 Ranked",
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
