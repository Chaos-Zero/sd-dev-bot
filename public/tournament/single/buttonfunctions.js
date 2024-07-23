const {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
} = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/database/write.js") + "");
eval(fs.readFileSync("./public/tournament/dmUtils.js") + "");

async function handleSingleElimButtonPress(interaction, db) {
  db.read();
  const guildObject = await bot.guilds.cache.get(process.env.GUILD_ID);
  const reportChannel = await GetChannelByName(guildObject, "sd-contest-bot");

 const splitButtonName = interaction.customId.split("-");
  console.log(splitButtonName);

  var foundEntry = false;

  console.log("Entering Doulble");
  //Button -> doubleElim-a-matchNumber
  var selection;
  let tournamentDetails = db.get("tournaments").nth(0).value();
  let singleName = await db
    .get("tournaments[0].currentTournament")
    .value();
  let singleTournament = await tournamentDetails[singleName];

  if (splitButtonName[1] == "registerReceipt") {
    if (splitButtonName[2] == "yes") {
      RegisterUserReceipts(interaction, true);
      await interaction
        .update({
          content:
            "You will now receive DM's when casting votes.\nYou can change this at any time by using the `/toggle-dm-receipts` slash command",
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
            "You will not receive DM's on votes cast.\nYou can change this at any time by using the `/toggle-dm-receipts` slash command",
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    }
  }

  if (splitButtonName[1] != "resetVote") {
    for (const match of singleTournament.matches) {
      // doubleElim-a-matchNumber
      if (match.match == splitButtonName[2] && match.progress == "complete") {
        await interaction
          .reply({
            content:
              "This match has already concluded.\nPlease vote on the most up-to-date matches.",
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
        return;
      }
    }
    if (splitButtonName[2] > singleTournament.matches.length) {
      console.log(
        "Button number: " +
          splitButtonName[2] +
          "\nsingleTournament.matches.length: " +
          singleTournament.matches.length
      );
      await interaction
        .reply({
          content:
            "This match could not be found.\nPlease contact an administrator.",
          ephemeral: true,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
      return;
    }
  }
  await IsSingleSecondVote(
    interaction,
    db,
    singleName,
    splitButtonName
  ).then(async (foundEntryAndVote) => {
    console.log("Found Entry is: " + foundEntryAndVote);

    if (foundEntryAndVote[0]) {
      var changeVoteButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            //Button -> doubleElim-a-matchNumber
            .setCustomId(
              `singleElim-resetVote-yes-${splitButtonName[1]}-${splitButtonName[2]}`
            )
            .setLabel("Yes")
            .setStyle("4")
        )
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`singleElim-resetVote-no-${splitButtonName[1]}`)
            .setLabel("No")
            .setStyle("1")
        );

      var removeVoteButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `singleElim-resetVote-remove-${splitButtonName[1]}-${splitButtonName[2]}`
            )
            .setLabel("Yes")
            .setStyle("4")
        )
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`singleElim-resetVote-no-${splitButtonName[1]}`)
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
              "` in `match" + splitButtonName[2] + "`.\nWould you like to remove your vote?",
            components: [removeVoteButtons],
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
        return;
      }
      if (foundEntryAndVote[1] !== splitButtonName[1]) {
        await interaction
          .reply({
            content:
              "It would appear you have already voted for `" +
              foundEntryAndVote[1] +
              "` in `match" + splitButtonName[2] + "`.\nWould you like to change your vote to `" +
              splitButtonName[1] +
              "`?`",
            components: [changeVoteButtons],
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
        return;
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
        reportChannel
          .send(
            interaction.user.username +
              " changed their vote to " +
              splitButtonName[3]
          )
          .catch(console.error);
        await SwapVotes(
          interaction,
          db,
          singleName,
          interaction.member.id,
          splitButtonName
        ).catch(console.error);

        await UpdateTournamentTable(db);

        return;
      } else if (splitButtonName[2] == "remove") {
        await interaction
          .update({
            content: "Your vote has been reset.",
            components: [],
            ephemeral: true,
          })
          .catch(console.error);
        reportChannel.send(interaction.user.username + " reset their vote");

        console.log("Match: " + splitButtonName[4]);
        await RemovePreviousSingleVotes(
          interaction,
          db,
          singleName,
          interaction.member.id,
          splitButtonName
        ).catch(console.error);

        return;
      } else if (splitButtonName[2] == "no") {
        await interaction.update({
          content: "Your vote has not been changed.",
          components: [],
          ephemeral: true,
        });
        return;
      }
      return;
    }
    if (!foundEntryAndVote) {
      console.log("This should only happen on first entry");
      await UpdateTotals(
        interaction,
        db,
        singleName,
        splitButtonName,
        true
      ).catch(console.error);
      await reportChannel.send(
        interaction.user.username + " voted for " + splitButtonName[1]
      );
      SendDmSubscriptionNotice(interaction);
    }

    await UpdateTournamentTable(db);
  });
}
/**
 * Called to check whether a user has already voted
 **/
async function IsSingleSecondVote(
  interaction,
  db,
  currentTournamentName,
  splitButtonName
) {
  db.read();
  let tournamentDetails = db.get("tournaments").nth(0).value();

  let singleTournament = await tournamentDetails[currentTournamentName];

  var promise = new Promise((resolve) => {
    for (const match of singleTournament.matches) {
      if (match.progress == "in-progress" || match.progress == "tie") {
        if (match.match == splitButtonName[2]) {
          if (match.entrant1.voters.includes(interaction.member.id)) {
            console.log("We found the user");
            resolve([true, "A"]);
            return promise;
          } else if (match.entrant2.voters.includes(interaction.member.id)) {
            console.log("We found the user");
            resolve([true, "B"]);
            return promise;
          }
        }
      }
    }
    resolve(false);
  });
  return promise;
}

async function UpdateTotals(
  interaction,
  db,
  currentTournamentName,
  splitButtonName,
  firstPass
) {
  db.read();
  let tournamentDetails = db.get("tournaments").nth(0).value();

  let singleTournament = await tournamentDetails[currentTournamentName];

  var matchNumber = firstPass ? splitButtonName[2] : splitButtonName[4];
  console.log("matchNumber: " + matchNumber);
  var vote = firstPass ? splitButtonName[1] : splitButtonName[3];
  console.log("vote: " + vote);

  // Find the match object based on the match number
  const matchObj = singleTournament.matches.find(
    (match) => match.match == matchNumber
  );

  console.log(matchObj);

  if (vote == "A") {
    matchObj.entrant1.voters.push(interaction.member.id);
    var matchPoints = parseInt(matchObj.entrant1.points) + 1;
    matchObj.entrant1.points = matchPoints;
    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: singleTournament,
      })
      .write();
    SendVotedDm(interaction, db, {
      match: matchNumber,
      vote: vote,
      entrant: matchObj.entrant1,
    });
    if (firstPass) {
      await interaction.reply({
        content:
          "Thank you for voting!\nYou voted `A` in Match `" +
          matchNumber +
          "`.",
        ephemeral: true,
      });
    }
  } else if (vote == "B") {
    matchObj.entrant2.voters.push(interaction.member.id);
    var matchPoints = parseInt(matchObj.entrant2.points) + 1;
    matchObj.entrant2.points = matchPoints;
    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: singleTournament,
      })
      .write();
    SendVotedDm(interaction, db, {
      match: matchNumber,
      vote: vote,
      entrant: matchObj.entrant2,
    });
    if (firstPass) {
      await interaction.reply({
        content:
          "Thank you for voting!\nYou voted `B` in Match `" +
          matchNumber +
          "`.",
        ephemeral: true,
      });
    }
  } else {
    console.error(`Match ${matchNumber} not found`);
    await interaction.reply({
      content:
        "Something went wrong. Your vote has not been counted.\nPlease try to vote again.",
      ephemeral: true,
    });
  }

  //sendDmSubscriptionNotice(interaction, populatedDb, roundNumber, vote);
}

async function UpdateTournamentTable(db) {
  return new Promise(async (resolve) => {
    db.read();
    let tournamentDetails = db.get("tournaments").nth(0).value();
    let currentTournamentName = db
      .get("tournaments[0].currentTournament")
      .value();

    let singleTournament = await tournamentDetails[currentTournamentName];

    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: singleTournament,
      })
      .write();
  });
}

async function RemovePreviousSingleVotes(
  interaction,
  db,
  currentTournamentName,
  userId,
  splitButton
) {
  return new Promise(async (resolve) => {
    db.read();
    console.log("We're removing values");
    let tournamentDetails = db.get("tournaments").nth(0).value();

    //var matchNumbert = splitButton[1] == 'resetVote' ? splitButton[4] :

    let singleTournament = await tournamentDetails[currentTournamentName];
    // Find the match object based on the match number
    console.log(
      "We're removing something here: Macth " +
        splitButton[4] +
        " Vote: " +
        splitButton[3]
    );
    const matchObj = singleTournament.matches.find(
      (match) => match.match == splitButton[4]
    );
    console.log("Match Object " + matchObj);
    if (matchObj) {
      if (splitButton[3] == "A") {
        var filteredArray = matchObj.entrant1.voters.filter(function (e) {
          return e !== userId;
        });

        matchObj.entrant1.voters = filteredArray;
        matchObj.entrant1.points = parseInt(matchObj.entrant1.points) - 1;
      } else if (splitButton[3] == "B") {
        var filteredArray = matchObj.entrant2.voters.filter(function (e) {
          return e !== userId;
        });

        matchObj.entrant2.voters = filteredArray;
        matchObj.entrant2.points = parseInt(matchObj.entrant2.points) - 1;
      }
    }
    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: singleTournament,
      })
      .write();
    SendRemovedVoteDm(interaction, db, { match: splitButton[4] });
  });
}

async function SwapVotes(
  interaction,
  db,
  currentTournamentName,
  userId,
  splitButton
) {
  return new Promise(async (resolve) => {
    console.log("Swapping Votes");
    db.read();
    let tournamentDetails = db.get("tournaments").nth(0).value();

    //var matchNumbert = splitButton[1] == 'resetVote' ? splitButton[4] :

    let singleTournament = await tournamentDetails[currentTournamentName];
    // Find the match object based on the match number
    console.log(
      "We're removing something here: Macth " +
        splitButton[4] +
        " Vote: " +
        splitButton[3]
    );
    const matchObj = singleTournament.matches.find(
      (match) => match.match == splitButton[4]
    );
    console.log("Match Object " + matchObj);
    var dmEntrant = "";
    if (matchObj) {
      if (splitButton[3] == "A") {
        var filteredArray = matchObj.entrant2.voters.filter(function (e) {
          return e !== userId;
        });

        matchObj.entrant2.voters = filteredArray;
        matchObj.entrant2.points = parseInt(matchObj.entrant2.points) - 1;
        matchObj.entrant1.voters.push(userId);
        matchObj.entrant1.points = parseInt(matchObj.entrant1.points) + 1;
        dmEntrant = matchObj.entrant1;
      } else if (splitButton[3] == "B") {
        var filteredArray = matchObj.entrant1.voters.filter(function (e) {
          return e !== userId;
        });

        matchObj.entrant1.voters = filteredArray;
        matchObj.entrant1.points = parseInt(matchObj.entrant1.points) - 1;
        matchObj.entrant2.voters.push(userId);
        matchObj.entrant2.points = parseInt(matchObj.entrant2.points) + 1;
        dmEntrant = matchObj.entrant2;
      }
    }
    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: singleTournament,
      })
      .write();
    SendChangedVoteDm(interaction, db, {
      vote: splitButton[3],
      match: splitButton[4],
      entrant: dmEntrant,
    });
  });
}
