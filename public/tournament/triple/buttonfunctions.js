const {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
} = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/database/write.js") + "");
eval(fs.readFileSync("./public/tournament/dmUtils.js") + "");

async function HandleTripleButtonPress(interaction, db) {
  db.read();
  const guildObject = await bot.guilds.cache.get(process.env.GUILD_ID);
  const reportChannel = await GetChannelByName(guildObject, "majordomo-logs-internal");

  const splitButtonName = interaction.customId.split("-");
  console.log(splitButtonName);

  var foundEntry = false;

  console.log("Entering Triple");
  //Button -> triple-A>B>C-matchNumber
  var selection;
  let tournamentDetails = db.get("tournaments").nth(0).value();
  let tripleName = await db.get("tournaments[0].currentTournament").value();
  let triple = await tournamentDetails[tripleName];

  if (splitButtonName[1] == "registerReceipt") {
    if (splitButtonName[2] == "yes") {
      RegisterUserReceipts(interaction, true);
      await interaction
        .update({
          content:
            "You will now receive DM's when casting votes.\nYou can change this at any time by using the `/tournament-toggle-dm-receipts` slash command",
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    } else {
      RegisterUserReceipts(interaction, false);
      await interaction
        .update({
          content:
            "You will not receive DM's on votes cast.\nYou can change this at any time by using the `/oggle-dm-receipts` slash command",
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    }
  }

  if (splitButtonName[1] != "resetVote") {
    for (const match of triple.matches) {
      // triple-a-matchNumber
      if (match.match == splitButtonName[2] && match.progress == "complete") {
        await interaction
          .reply({
            content:
              "This match has already concluded.\nPlease vote on the most up-to-date match.",
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
        return 0;
      }
    }
    if (splitButtonName[2] > triple.matches.length) {
      console.log(
        "Button number: " +
          splitButtonName[2] +
          "\ntriple.matches.length: " +
          triple.matches.length
      );
      await interaction
        .reply({
          content:
            "This match could not be found.\nPlease contact an administrator.",
          ephemeral: true,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
      return 0;
    }
  }
  await IsTripleSecondVote(interaction, db, tripleName, splitButtonName).then(
    async (foundEntryAndVote) => {
      console.log("Found Entry is: " + foundEntryAndVote);

      if (foundEntryAndVote[0]) {
        var changeVoteButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              //Button -> tripleElim-a-matchNumber
              .setCustomId(
                `triple-resetVote-yes-${splitButtonName[1]}-${splitButtonName[2]}`
              )
              .setLabel("Yes")
              .setStyle("4")
          )
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`triple-resetVote-no-${splitButtonName[1]}`)
              .setLabel("No")
              .setStyle("1")
          );

        var removeVoteButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `triple-resetVote-remove-${splitButtonName[1]}-${splitButtonName[2]}`
              )
              .setLabel("Yes")
              .setStyle("4")
          )
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`triple-resetVote-no-${splitButtonName[1]}`)
              .setLabel("No")
              .setStyle("1")
          );
        //await interaction.deleteReply();

        if (foundEntryAndVote[1] == splitButtonName[1]) {
          await interaction
            .reply({
              content:
                "It would appear you have already voted for `" +
                foundEntryAndVote[1] +
                "` in `match " +
                splitButtonName[2] +
                "`.\nWould you like to remove your vote?",
              components: [removeVoteButtons],
              ephemeral: true,
            })
            .then(() => console.log("Reply sent."))
            .catch((_) => null);
          return 0;
        }
        if (foundEntryAndVote[1] !== splitButtonName[1]) {
          await interaction
            .reply({
              content:
                "It would appear you have already voted for `" +
                foundEntryAndVote[1] +
                "` in `match " +
                splitButtonName[2] +
                "`.\nWould you like to change your vote to `" +
                splitButtonName[1] +
                "`?`",
              components: [changeVoteButtons],
              ephemeral: true,
            })
            .then(() => console.log("Reply sent."))
            .catch((_) => null);
          return 0;
        }
      }

      if (splitButtonName[1] == "resetVote") {
        if (splitButtonName[2] == "yes") {
          //console.log(interaction);
          await interaction
            .update({
              content:
                "Thank you for voting!\nYour vote has been changed to ``" +
                splitButtonName[3] +
                "``.",
              components: [],
              ephemeral: true,
            })
            .catch(console.error);

          console.log("Match: " + splitButtonName[4]);
          await SwapTripleVotes(
            interaction,
            db,
            tripleName,
            interaction.member.id,
            splitButtonName
          );

          UpdateTournamentTable(db);
          reportChannel.send(
            interaction.user.username +
              " changed their vote to " +
              splitButtonName[3]
          );

          console.log("Is it this we're hitting?");

          await UpdateTournamentTable(db);
          reportChannel.send(
            interaction.user.username +
              " changed their vote to " +
              splitButtonName[3]
          );
          return 0;
        } else if (splitButtonName[2] == "remove") {
          await interaction
            .update({
              content: "Your vote has been reset.",
              components: [],
              ephemeral: true,
            })
            .catch(console.error);

          console.log("Match: " + splitButtonName[4]);
          await RemoveUserVotesFromMatch(
            db,
            tripleName,
            interaction.member.id,
            splitButtonName
          );
          SendRemovedVoteDm(interaction, db, { match: splitButtonName[4] });
          reportChannel.send(interaction.user.username + " reset their vote");
        } else if (splitButtonName[2] == "no") {
          await interaction.update({
            content: "Your vote has not been changed.",
            components: [],
            ephemeral: true,
          });
          return 0;
        }
        return 0;
      }
      if (!foundEntryAndVote) {
        console.log("This should only happen on first entry");
        var entrants = await AddVotes(
          interaction,
          db,
          tripleName,
          splitButtonName,
          true
        ).catch(console.error);
        reportChannel.send(
          interaction.user.username + " voted for " + splitButtonName[1]
        );

        SendVotedDm(interaction, db, {
          match: splitButtonName[2],
          vote: splitButtonName[1],
          entrant: entrants,
        });
        await interaction.reply({
          content:
            "Thank you for voting!\nYou voted `" +
            splitButtonName[1] +
            "` in Match `" +
            splitButtonName[2] +
            "`.",
          ephemeral: true,
        });
        //if (firstPass) {

        //}
        SendDmSubscriptionNotice(interaction);
      }

      await UpdateTournamentTable(db);
    }
  );
}
/**
 * Called to check whether a user has already voted
 **/
async function IsTripleSecondVote(
  interaction,
  db,
  currentTournamentName,
  splitButtonName
) {
  db.read();
  let tournamentDetails = db.get("tournaments").nth(0).value();

  let triple = await tournamentDetails[currentTournamentName];

  var promise = new Promise((resolve) => {
    for (const match of triple.matches) {
      if (match.progress == "in-progress" || match.progress == "tie") {
        if (match.match == splitButtonName[2]) {
          console.log("entrant1.voters.first: " + match.entrant1.voters.first);

          var abc =
            match.entrant1.voters.first.includes(interaction.member.id) &&
            match.entrant2.voters.second.includes(interaction.member.id);
          var acb =
            match.entrant1.voters.first.includes(interaction.member.id) &&
            match.entrant3.voters.second.includes(interaction.member.id);
          var bac =
            match.entrant2.voters.first.includes(interaction.member.id) &&
            match.entrant1.voters.second.includes(interaction.member.id);
          var bca =
            match.entrant2.voters.first.includes(interaction.member.id) &&
            match.entrant3.voters.second.includes(interaction.member.id);
          var cab =
            match.entrant3.voters.first.includes(interaction.member.id) &&
            match.entrant1.voters.second.includes(interaction.member.id);
          var cba =
            match.entrant3.voters.first.includes(interaction.member.id) &&
            match.entrant2.voters.second.includes(interaction.member.id);

          if (abc) {
            console.log("We found the user");
            resolve([true, "A>B>C"]);
            return promise;
          } else if (acb) {
            console.log("We found the user");
            resolve([true, "A>C>B"]);
            return promise;
          } else if (bac) {
            console.log("We found the user");
            resolve([true, "B>A>C"]);
            return promise;
          } else if (bca) {
            console.log("We found the user");
            resolve([true, "B>C>A"]);
            return promise;
          } else if (cab) {
            console.log("We found the user");
            resolve([true, "C>A>B"]);
            return promise;
          } else if (cba) {
            console.log("We found the user");
            resolve([true, "C>B>A"]);
            return promise;
          }
        }
      }
    }

    resolve(false);
  });

  return promise;
}

async function AddVotes(
  interaction,
  db,
  currentTournamentName,
  splitButtonName,
  firstPass
) {
  db.read();
  let tournamentDetails = db.get("tournaments").nth(0).value();

  let triple = await tournamentDetails[currentTournamentName];

  var matchNumber = firstPass ? splitButtonName[2] : splitButtonName[4];
  console.log("matchNumber: " + matchNumber);
  var vote = firstPass ? splitButtonName[1] : splitButtonName[3];
  console.log("vote: " + vote);

  // Find the match object based on the match number
  const matchObj = triple.matches.find((match) => match.match == matchNumber);

  console.log(matchObj);

  await AddVoteToDB(
    interaction,
    db,
    currentTournamentName,
    splitButtonName,
    firstPass
  );
  var entrants = [];

  switch (vote) {
    case "A>B>C":
      entrants.push(matchObj.entrant1, matchObj.entrant2);
      break;
    case "A>C>B":
      entrants.push(matchObj.entrant1, matchObj.entrant3);
      break;
    case "B>A>C":
      entrants.push(matchObj.entrant2, matchObj.entrant1);
      break;
    case "B>C>A":
      entrants.push(matchObj.entrant2, matchObj.entrant3);
      break;
    case "C>A>B":
      entrants.push(matchObj.entrant3, matchObj.entrant1);
      break;
    case "C>B>A":
      entrants.push(matchObj.entrant3, matchObj.entrant2);
      break;
  }

  return entrants;

  //sendDmSubscriptionNotice(interaction, populatedDb, roundNumber, vote);
}

async function UpdateTournamentTable(db) {
  return new Promise(async (resolve) => {
    db.read();
    let tournamentDetails = db.get("tournaments").nth(0).value();
    let currentTournamentName = db
      .get("tournaments[0].currentTournament")
      .value();

    let triple = await tournamentDetails[currentTournamentName];

    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: triple,
      })
      .write();
  });
}

async function SwapTripleVotes(
  interaction,
  db,
  currentTournamentName,
  userId,
  splitButton
) {
  console.log("We are swapping Triple votes");
  await RemoveUserVotesFromMatch(
    db,
    currentTournamentName,
    userId,
    splitButton
  );
  var entrants = await AddVoteToDB(
    interaction,
    db,
    currentTournamentName,
    splitButton,
    false,
    true
  );
  var entrants = [];
  let tournamentDetails = db.get("tournaments").nth(0).value();

  let triple = await tournamentDetails[currentTournamentName];

  var matchNumber = splitButton[4];
  console.log("matchNumber: " + matchNumber);
  var vote = splitButton[3];
  console.log("vote: " + vote);

  // Find the match object based on the match number
  const matchObj = triple.matches.find((match) => match.match == matchNumber);

  /* switch (vote) {
        case "A>B>C":
          entrants.push(matchObj.entrant1, matchObj.entrant2);
          break;
        case "A>C>B":
          entrants.push(matchObj.entrant1, matchObj.entrant3);
          break;
        case "B>A>C":
          entrants.push(matchObj.entrant2, matchObj.entrant1);
          break;
        case "B>C>A":
          entrants.push(matchObj.entrant2, matchObj.entrant3);
          break;
        case "C>A>B":
          entrants.push(matchObj.entrant3, matchObj.entrant1);
          break;
        case "C>B>A":
          entrants.push(matchObj.entrant3, matchObj.entrant2);
          break;

          console.log(matchObj);
*/
  SendChangedVoteDm(interaction, db, {
    vote: vote,
    match: matchNumber,
    entrant: entrants,
  });
}

async function AddVoteToDB(
  interaction,
  db,
  currentTournamentName,
  splitButtonName,
  firstPass,
  isChangeVote
) {
  db.read();
  let tournamentDetails = db.get("tournaments").nth(0).value();

  let triple = await tournamentDetails[currentTournamentName];

  var matchNumber = firstPass ? splitButtonName[2] : splitButtonName[4];
  console.log("matchNumber: " + matchNumber);
  var vote = firstPass ? splitButtonName[1] : splitButtonName[3];
  console.log("vote: " + vote);

  // Find the match object based on the match number
  const matchObj = triple.matches.find((match) => match.match == matchNumber);

  console.log(matchObj);

  if (vote == "A>B>C") {
    matchObj.entrant1.voters.first.push(interaction.member.id);
    var matchPoints1 = parseInt(matchObj.entrant1.points) + 2;

    matchObj.entrant2.voters.second.push(interaction.member.id);
    var matchPoints2 = parseInt(matchObj.entrant2.points) + 1;

    matchObj.entrant1.points = matchPoints1;
    matchObj.entrant2.points = matchPoints2;

    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: triple,
      })
      .write();
  } else if (vote == "A>C>B") {
    matchObj.entrant1.voters.first.push(interaction.member.id);
    var matchPoints1 = parseInt(matchObj.entrant1.points) + 2;

    matchObj.entrant3.voters.second.push(interaction.member.id);
    var matchPoints2 = parseInt(matchObj.entrant3.points) + 1;

    matchObj.entrant1.points = matchPoints1;
    matchObj.entrant3.points = matchPoints2;

    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: triple,
      })
      .write();
  } else if (vote == "B>A>C") {
    matchObj.entrant2.voters.first.push(interaction.member.id);
    var matchPoints1 = parseInt(matchObj.entrant2.points) + 2;

    matchObj.entrant1.voters.second.push(interaction.member.id);
    var matchPoints2 = parseInt(matchObj.entrant1.points) + 1;

    matchObj.entrant2.points = matchPoints1;
    matchObj.entrant1.points = matchPoints2;

    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: triple,
      })
      .write();
  } else if (vote == "B>C>A") {
    matchObj.entrant2.voters.first.push(interaction.member.id);
    var matchPoints1 = parseInt(matchObj.entrant2.points) + 2;

    matchObj.entrant3.voters.second.push(interaction.member.id);
    var matchPoints2 = parseInt(matchObj.entrant3.points) + 1;

    matchObj.entrant2.points = matchPoints1;
    matchObj.entrant3.points = matchPoints2;

    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: triple,
      })
      .write();
  } else if (vote == "C>A>B") {
    matchObj.entrant3.voters.first.push(interaction.member.id);
    var matchPoints1 = parseInt(matchObj.entrant3.points) + 2;

    matchObj.entrant1.voters.second.push(interaction.member.id);
    var matchPoints2 = parseInt(matchObj.entrant1.points) + 1;

    matchObj.entrant3.points = matchPoints1;
    matchObj.entrant1.points = matchPoints2;

    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: triple,
      })
      .write();
  } else if (vote == "C>B>A") {
    matchObj.entrant3.voters.first.push(interaction.member.id);
    var matchPoints1 = parseInt(matchObj.entrant3.points) + 2;

    matchObj.entrant2.voters.second.push(interaction.member.id);
    var matchPoints2 = parseInt(matchObj.entrant2.points) + 1;

    matchObj.entrant3.points = matchPoints1;
    matchObj.entrant2.points = matchPoints2;

    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: triple,
      })
      .write();
  } else {
    console.error(`Match ${matchNumber} not found`);
    await interaction.reply({
      content:
        "Something went wrong. Your vote has not been counted.\nPlease try to vote again.",
      ephemeral: true,
    });
  }
}

async function RemoveUserVotesFromMatch(
  db,
  currentTournamentName,
  userId,
  splitButton
) {
  console.log("Swapping Votes");
  db.read();
  let tournamentDetails = db.get("tournaments").nth(0).value();

  //var matchNumbert = splitButton[1] == 'resetVote' ? splitButton[4] :

  let triple = await tournamentDetails[currentTournamentName];
  // Find the match object based on the match number (this will always be a redo for split numbers)
  console.log(
    "We're removing something here: Math " +
      splitButton[4] +
      " Vote: " +
      splitButton[3]
  );
  const matchObj = triple.matches.find(
    (match) => match.match == splitButton[4]
  );
  console.log("Match Object " + matchObj);

  var dmEntrant = [];
  if (matchObj) {
    var userIdExistsEntrant1First =
      matchObj.entrant1.voters.first.includes(userId);
    var userIdExistsEntrant2First =
      matchObj.entrant2.voters.first.includes(userId);
    var userIdExistsEntrant3First =
      matchObj.entrant3.voters.first.includes(userId);
    var userIdExistsEntrant1Second =
      matchObj.entrant1.voters.second.includes(userId);
    var userIdExistsEntrant2Second =
      matchObj.entrant2.voters.second.includes(userId);
    var userIdExistsEntrant3Second =
      matchObj.entrant3.voters.second.includes(userId);
    /////////////////////////////////////////
    if (userIdExistsEntrant1First) {
      var filteredArray = matchObj.entrant1.voters.first.filter(function (e) {
        return e !== userId;
      });

      matchObj.entrant1.voters.first = filteredArray;
      matchObj.entrant1.points = parseInt(matchObj.entrant1.points) - 2;
      ///////////////////////////////////////
    } else if (userIdExistsEntrant2First) {
      var filteredArray = matchObj.entrant2.voters.first.filter(function (e) {
        return e !== userId;
      });

      matchObj.entrant2.voters.first = filteredArray;
      matchObj.entrant2.points = parseInt(matchObj.entrant2.points) - 2;
    }
    /////////////////////////////////////////
    else if (userIdExistsEntrant3First) {
      var filteredArray = matchObj.entrant3.voters.first.filter(function (e) {
        return e !== userId;
      });

      matchObj.entrant3.voters.first = filteredArray;
      matchObj.entrant3.points = parseInt(matchObj.entrant3.points) - 2;
    }
    ////////////////////////////////////////
    if (userIdExistsEntrant1Second) {
      var filteredArray = matchObj.entrant1.voters.second.filter(function (e) {
        return e !== userId;
      });

      matchObj.entrant1.voters.second = filteredArray;
      matchObj.entrant1.points = parseInt(matchObj.entrant1.points) - 1;
      //////////////////////////////////////
    } else if (userIdExistsEntrant2Second) {
      var filteredArray = matchObj.entrant2.voters.second.filter(function (e) {
        return e !== userId;
      });

      matchObj.entrant2.voters.second = filteredArray;
      matchObj.entrant2.points = parseInt(matchObj.entrant2.points) - 1;
      /////////////////////////////////////
    } else if (userIdExistsEntrant3Second) {
      var filteredArray = matchObj.entrant3.voters.second.filter(function (e) {
        return e !== userId;
      });

      matchObj.entrant3.voters.second = filteredArray;
      matchObj.entrant3.points = parseInt(matchObj.entrant3.points) - 1;
    }
  }

  await db
    .get("tournaments")
    .nth(0)
    .assign({
      [currentTournamentName]: triple,
    })
    .write();
}

// var entriesForRound = GetCurrentBattle(populatedDb, round);
//  console.log("Setting round to ran" + entriesForRound[0]);
//  entriesForRound.forEach((entry) => {
//    entry.hasTakenPlace = true;
//
//    populatedDb.map((item) => {
//      if (item.round == round) {
//        item.entries.map((dbEntry) => {
//          if (dbEntry.name == entry.name) {
//            dbEntry = entry;
//          }
//        });
//      }
//    });
//  });
//  console.log(
//    "--------------\n" +
//      JSON.stringify(populatedDb.find((item) => item.round == round).entries) +
//      "\n--------------"
//  );
//}
