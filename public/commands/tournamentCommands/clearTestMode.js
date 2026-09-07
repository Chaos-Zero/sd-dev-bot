const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/utils/adminUtils.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-clear-test-mode")
    .setDescription("Disable test mode routing for tournament messages."),
  async execute(interaction) {
    // Gated in the Discord server too, but that configuration lives outside
    // the repo, so the check is enforced here as well.
    if (!(await RequireDomoAdmin(interaction))) {
      return;
    }
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
