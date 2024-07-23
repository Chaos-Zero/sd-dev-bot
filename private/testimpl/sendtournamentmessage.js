const { SlashCommandBuilder } = require("discord.js");
const { setTimeout } = require("timers/promises");

const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("send-daily-battle")
    .setDescription("Sends the next round to the tournament channel"),
  async execute(interaction) {
    var channelMessage = await interaction.reply("Constructing Embed");
    // Future proofing the method but just hard coding the value for now
    CreateAndSendDailyBattleMessages(GetBot(), GetDb(), GetLocalDb())
  },
};


/*async function SendMessageForDuplicateVotes(bot, db) {
  var guild = await bot.guilds.cache.get(process.env.GUILD_ID);
  console.log(guild);
  var tournamentChannel = await GetChannelByName(
    guild,
    process.env.TOURNAMENT_CHANNEL
  );
  var tournamentChatChannel = await GetChannelByName(
    guild,
    process.env.TOURNAMENT_CHAT_CHANNEL
  );

  console.log(
    "Tourn Channel: " +
      tournamentChannel +
      "\nChat Channel : " +
      tournamentChatChannel
  );
  await sleep(600);
  let battleMessage = await GetLastMessageInChannel(tournamentChannel);
  let currentRound = await GetCurrentRound(db, process.env.TOURNAMENT_NAME);
  await sleep(600);
  let duplicateVotesUserIds = await CheckForReactionDuplicates(battleMessage);
  let alertedUsers = await GetAlertedUsers(
    db,
    process.env.TOURNAMENT_NAME,
    currentRound
  );
  await sleep(10000);
  console.log("Users from DB: " + alertedUsers);
  duplicateVotesUserIds = duplicateVotesUserIds.filter(
    (item) => item !== process.env.BOT_ID
  );

  for (const user of alertedUsers) {
    duplicateVotesUserIds = duplicateVotesUserIds.filter(
      (item) => item !== user
    );
  }
  alertedUsers.push.apply(alertedUsers, duplicateVotesUserIds);

  UpdateAlertedUsers(
    db,
    process.env.TOURNAMENT_NAME,
    currentRound,
    alertedUsers
  );

  console.log("duplicateVotesUserIds: " + duplicateVotesUserIds);
  if (duplicateVotesUserIds.length > 0) {
    var message =
      "The following members currently have more than one option selected on the current battle:\n ";
    var messageEnd =
      "\nPlease reduce your selection to one vote before voting ends on this battle.\nThank You! - SupraDarky Team";

    var midMessageString = "";

    for (const userId of duplicateVotesUserIds) {
      midMessageString += "> <@" + userId + ">\n";
    }

    const finalMessage = message + midMessageString + messageEnd;

    tournamentChatChannel.send(finalMessage);
  }
}*/
