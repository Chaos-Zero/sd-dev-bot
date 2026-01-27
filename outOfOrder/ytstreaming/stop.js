const { SlashCommandBuilder } = require("discord.js");
const path = require("path");
const QueueManager = require(path.join(
  require.main.path,
  "public",
  "ytPlayback",
  "queueManager"
));

const fs = require("fs");
eval(fs.readFileSync("./public/main.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yt-stop")
    .setDescription("Disconnects Domo and clears the queue."),
  async execute(interaction) {
    if (interaction.channel.name !== "listening-parties-host") {
      return await interaction.reply({
        content:
          "You can only use this command in the #listening-parties-host channel.",
        ephemeral: true,
      });
    }

    var db = GetDb();
    await db.read();
    let gamesDetails = await db.get("guessingGame").nth(0).value();

    if (
      gamesDetails.isGameRunning &&
      !gamesDetails.currentHosts.includes(interaction.user.id)
    ) {
      return await interaction.reply({
        content: "This command cannot be used during a guessing game.",
        ephemeral: true,
      });
    }

    const guildId = interaction.guildId;
    const queue = QueueManager.getQueue(guildId);

    if (queue && queue.connection) {
      queue.connection.destroy(); // Use destroy() to ensure cleanup of resources
    }
    // Reset or delete the queue if needed
    QueueManager.deleteQueue(guildId);

    await interaction.reply({
      content: `Domo has disconnected and the queue has been reset`,
      ephemeral: false,
    });
  },
};
