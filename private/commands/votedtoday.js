const { SlashCommandBuilder } = require("discord.js");

const fs = require("fs");
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/tournament/tournamentutils.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("who-voted-for-what-today")
    .setDescription("Outputs who has voted for what today."),
  async execute(interaction) {
    let rawDb = GetDb();
    let populatedDb = GetLocalDb();

    rawDb.read();
    var votedTodayCollection = "";

    let currentRound = await rawDb
      .get("bestvgm2022awards")
      .find({ isCurrentRound: true })
      .value();

    if (currentRound) {
      votedTodayCollection = currentRound.votedToday;
    }

    var votedTodayCollection = await GetCurrentBattlesVotes(rawDb);
    console.log(votedTodayCollection);

    if (votedTodayCollection == "") {
      await interaction.reply(
        `There doesn't appear to be a battle running at this current time.`
      );
    } else {
      var outputMessage = "Here is todays list of Voters and Votes cast:\n\n| ";
      const guild = interaction.guild;
      const members = await guild.members.fetch();
      for (var user of votedTodayCollection) {
        var discordMember = members.find(
          (member) => member.id == user.memberId
        );
        
        var username =
          discordMember == undefined ? "" : discordMember.displayName;
        outputMessage += "**" + username + "**: `" + user.vote + "` | ";
      }
      console.log(outputMessage)
      interaction.reply(outputMessage);
    }
  },
};
