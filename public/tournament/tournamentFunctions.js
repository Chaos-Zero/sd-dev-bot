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

async function registerTournament(
  tournamentTitle,
  tournamentFormat,
  isRandom,
  isChallonge,
  isHiddenBracket,
  csvFilePath,
  roundsPerTurn = 1
) {
  console.log("Received CSV file path (URL):", csvFilePath);
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

  let participantNames = [];

  try {
    const readStream = await downloadFile(csvFilePath);
    readStream
      .pipe(csvParser())
      .on("data", (row) => {
        participants.push({
          title: row.Title,
          name: row.Name,
          link: row.Link,
          match: 0,
        });
      })
      .on("end", () => {
        console.log(`Processed ${participants.length} participants.`);

        if (participants.length === 0) {
          console.error("No participants found in CSV.");
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

        // Handle Challonge integration if required
        const urlName = replaceSpacesWithUnderlines(tournamentTitle);
        const url = "https://challonge.com/" + urlName;

        if (isChallonge) {
          createChallongeTournament(
            tournamentTitle,
            urlName,
            "",
            "Single Elimination",
            isHiddenBracket
          )
            .then(() => sleep(8000))
            .then(() => addChallongeEntrants(participantNames, urlName))
            .catch((error) =>
              console.warn("Challonge integration error:", error)
            );
        }
      })
      .on("error", (error) => {
        console.error("Error processing CSV file:", error);
        // Handle the error (e.g., notify the user, abort the operation)
        // Save the tournament details
        // db.get("tournaments").push(tournamentDetails).write();
      });
  } catch (error) {
    console.error("Failed to download or process CSV file:", error);
    // Handle the error appropriately
    return;
  }
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
    case "Single Elimination":
      console.log("Starting Single Match");
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
