const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear-test-mode")
    .setDescription("Disable test mode routing for tournament messages."),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const db = GetDb();
    await db.read();
    db.get("tournaments")
      .nth(0)
      .assign({
        testMode: {
          enabled: false,
          channelId: "",
          channelName: "",
        },
      })
      .write();

    await interaction.editReply("Test mode disabled.");
  },
};
