const { SlashCommandBuilder } = require("discord.js");

const fs = require("fs");
eval(fs.readFileSync("./public/utils/messageutils.js") + "");
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/tournament/triple/getallpreviousvotesfromrections.js") + "");


module.exports = {
  data: new SlashCommandBuilder()
    .setName("get-all-votes-via-reactions")
    .setDescription("Gets previous votes."),
  async execute(interaction) {
    // interaction.guild is the object representing the Guild in which the command was run
    var channel = await GetChannelByName(interaction.member.guild, "best-vgm-2022-awards")
    GetVotesFromPreviousMessages(GetBot(), GetDb(), GetLocalDb(), channel)
    await interaction.reply(
      `Trying to populate DB`
    );
  },
};