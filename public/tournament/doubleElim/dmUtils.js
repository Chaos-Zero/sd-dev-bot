const {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
} = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/database/write.js") + "");

async function sendReceipt(interaction, splitButtonName) {
  var db = GetDb();
  db.read();
  var receiptUsers = await db.get("tournaments[0].receiptUsers").value();
  const user = interaction.member.id;
  for (const receipt of receiptUsers) {
    if (receipt.user == user && receipt.status) {
      await user.send((vote) => vote.memberId !== memberId);
      break;
    }
  }
}

async function RegisterUserReceipts(interaction, wantsRegistered) {
  var db = GetDb();
  db.read();
  let tournamentDetails = await db.get("tournaments").nth(0).value();
  var receiptUsers = tournamentDetails.receiptUsers;

  const passedUser = interaction.member.id;

  const index = receiptUsers.findIndex((user) => user.id === passedUser);
  if (index !== -1) {
    receiptUsers[index].status = wantsRegistered;
  } else {
    // If the user is not found, add a new entry with the given ID and status
    receiptUsers.push({ id: passedUser, status: wantsRegistered });
  }

  tournamentDetails.receiptUsers = receiptUsers;

  await db.get("tournaments").nth(0).assign(tournamentDetails).write();
}

async function SendDmSubscriptionNotice(interaction) {
  var db = GetDb();
  await db.read();
  let tournamentDetails = await db.get("tournaments").nth(0).value();
  var receiptUsers = tournamentDetails.receiptUsers;

  console.log("We are in the notice function");
  const user = receiptUsers.find((u) => u.id == interaction.member.id);

  if (user) {
    // Match on an id and check if it is true or false
    if (user.status) {
      console.log("User with id 001 is active");
    } else {
      console.log("User with id 001 is inactive");
    }
  } else {
    var registerReceiptButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`doubleElim-registerReceipt-yes`)
          .setLabel("Yes")
          .setStyle("1")
      )
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`doubleElim-registerReceipt-no`)
          .setLabel("No")
          .setStyle("4")
      );

    console.log("Trying to send");
    await interaction
      .followUp({
        content:
          "Would you like to receive a DM copy of your entry whenever you vote in a tournament?",
        components: [registerReceiptButtons],
        ephemeral: true,
      })
      .then(() => console.log("Reply sent."))
      .catch((_) => null);
  }
}

async function SendVotedDm(interaction, db, voteData) {
  var db = GetDb();
  await db.read();
  let tournamentName = await db.get("tournaments[0].currentTournament").value()
  let receiptUsers = await db.get("tournaments[0].receiptUsers").value();

  const user = receiptUsers.find((u) => u.id == interaction.member.id);
  var message =
    "You voted **" + voteData.vote + ": " + voteData.entrant.title + " - " + voteData.entrant.name + "** in match **" + voteData.match + "** of the **" + tournamentName +"** tournament.";
  if (user && user.status == true) {
    const discordUser = interaction.user;
    discordUser.send(message).catch(console.error); // Handle any errors with sending the DM
  }
}

async function SendRemovedVoteDm(interaction, db, voteData) {
  var db = GetDb();
  await db.read();
  let tournamentName = await db.get("tournaments[0].currentTournament").value()
  let receiptUsers = await db.get("tournaments[0].receiptUsers").value();

  const user = receiptUsers.find((u) => u.id == interaction.member.id);

  var message =
    "You have removed you vote from match **" + voteData.match + "** of the **" + tournamentName +"** tournament.";
  if (user && user.status == true) {
    const discordUser = interaction.user;
    discordUser.send(message).catch(console.error); // Handle any errors with sending the DM
  }
}

async function SendChangedVoteDm(interaction, db, voteData) {
  var db = GetDb();
  await db.read();
  let tournamentName = await db.get("tournaments[0].currentTournament").value()
  let receiptUsers = await db.get("tournaments[0].receiptUsers").value();

  const user = receiptUsers.find((u) => u.id == interaction.member.id);
  var message =
    "You have changed your vote to **" +
    voteData.vote + ": " + voteData.entrant.title + " - " + voteData.entrant.name +
    "** in match **" +
    voteData.match +
    "** of the **" + tournamentName +"** tournament.";
  if (user && user.status == true) {
    const discordUser = interaction.user;
    discordUser.send(message).catch(console.error); // Handle any errors with sending the DM
  }
}
