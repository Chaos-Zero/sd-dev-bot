const { SlashCommandBuilder } = require("discord.js");

const fs = require("fs");
const sleep = require("util").promisify(setTimeout);
eval(fs.readFileSync("./public/main.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("start-match")
    .setDescription("If there is a tournament set up, we can manually start a days worth of matches using this command."),
  async execute(interaction) {
    await interaction.reply("Sending Messages");
    await startMatch(interaction);
    await sleep(15000);
    await startMatch(interaction, "", true);
    //await interaction.followup.editReply("ok!");
  },
};
