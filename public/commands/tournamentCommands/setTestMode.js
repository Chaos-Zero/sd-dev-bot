const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/utils/adminUtils.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-set-test-mode")
    .setDescription("Route all tournament messages/logs to a test channel.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to receive all tournament messages/logs.")
        .setRequired(true)
    ),
  async execute(interaction) {
    // Gated in the Discord server too, but that configuration lives outside
    // the repo, so the check is enforced here as well.
    if (!(await RequireDomoAdmin(interaction))) {
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const channel = interaction.options.getChannel("channel");
    if (!channel) {
      await interaction.editReply("Please provide a valid channel.");
      return;
    }

    const db = GetDb();
    await db.read();
    db.get("tournaments")
      .nth(0)
      .assign({
        testMode: {
          enabled: true,
          channelId: channel.id,
          channelName: channel.name,
        },
      })
      .write();

    await interaction.editReply(
      `Test mode enabled. All tournament messages/logs will be sent to #${channel.name}.`
    );
  },
};
