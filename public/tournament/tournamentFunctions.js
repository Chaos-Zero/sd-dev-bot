const { Client, ButtonBuilder, EmbedBuilder } = require("discord.js");
const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const csvParser = require("csv-parser");
const fs = require("fs");
const path = require("path");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/database/write.js") + "");
eval(
  fs.readFileSync("./public/tournament/single/singleTournament.js") + ""
);
eval(
  fs.readFileSync("./public/tournament/doubleElim/doubleElimTournament.js") + ""
);
eval(fs.readFileSync("./public/tournament/triple/tripleTournament.js") + "");

const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const adapter = new FileSync("db.json");
const db = low(adapter);

async function getCurrentTournament(db) {
  return db.get("tournaments[0].currentTournament").value();
}

async function registerTournament(
  tournamentTitle,
  tournamentFormat,
  isRandom,
  csvFilePath,
  roundsPerTurn = 1,
  adminId
) {
  var db = GetDb();
  db.read();
  let currentTournamentName = await getCurrentTournament(db);
  console.log("Current Tournament Name: " + currentTournamentName);
  if (currentTournamentName !== "N/A") {
    console.log("There is a tournament already running!");
    return;
  }

  let participantNum = tournamentFormat == "3v3 Ranked" ? 3 : 2;
  let participants = [];
  downloadFile(csvFilePath).then((readStream) => {
    readStream
      .pipe(csvParser())
      .on("data", (row) => {
        // Split the Name field into name and title
        participants.push({
          name: row.Name,
          title: row.Title,
          link: row.Link,
          match: 0,
        });
      })
      .on("end", () => {
        // Prepare the tournament details
        let currentTournamentName = tournamentTitle;
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

          if ((i + 1) % participantNum == 0) {
            tempMatchNumber++;
          }
        }

        console.log("Here's the Random entries: " + participants);
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
              currentTournament: currentTournamentName,
              [currentTournamentName]: {
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
              },
            })
            .write();
        } else {
          db.get("tournaments")
            .nth(0)
            .assign({
              currentTournament: currentTournamentName,
              [currentTournamentName]: {
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
              },
            })
            .write();
        }
        // Check if the admin ID is not already present and add if necessary
        //          if (adminId && !tournamentDetails.admin.includes(adminId)) {
        //           tournamentDetails.admin.push(adminId);
        //        }

        // Save the tournament details
        // db.get("tournaments").push(tournamentDetails).write();
      });
  });
}

// Neeed Round, Match Number, Names, Game, Links, Status
// Neeed Round, Match Number, Names, Game, Links, Status
async function StartMatch(
  interaction,
  bot = "",
  secondOfDay = false,
  previousMatches = []
) {
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

  switch (tournament.tournamentFormat) {
    case "Single":
      StartSingleMatch(interaction, bot, secondOfDay, previousMatches);
      break;
    case "Double Elimination":
      StartDoubleElimMatch(interaction, bot, secondOfDay, previousMatches);
      break;
    case "3v3 Ranked":
      StartTripleMatch(interaction, bot, secondOfDay, previousMatches);
      break;
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
    case "Single":
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
