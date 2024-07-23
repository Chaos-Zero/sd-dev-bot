const { SlashCommandBuilder } = require("discord.js");
const path = require("path");
const QueueManager = require(path.join(
  require.main.path,
  "public",
  "ytPlayback",
  "queueManager"
));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yt-now-playing")
    .setDescription("Sends an embed with the current track info."),
  async execute(interaction) {
    if (
      interaction.channel.name == "listening-parties-host" ||
      interaction.channel.name == "listening-parties" ||
      interaction.channel.name == "guessing-games"
    ) {
      const guildId = interaction.guildId;
      const queue = QueueManager.getQueue(guildId);

      if (queue && queue.connection && queue.currentlyPlaying) {
        const embed = await QueueManager.createPlayingEmbed(
          guildId,
          queue.currentlyPlaying
        );
        console.log(embed);

        // Reply with the embed as the initial response to the interaction
        await interaction.reply({ embeds: [embed] }).then(async () => {
          // Fetch the message that was just sent as the reply to save its reference
          const message = await interaction.fetchReply();
          queue.currentlyPlayingEmbed = message;
        });
        await QueueManager.startProgressUpdate(guildId);
      } else {
        // If there's no song currently playing, inform the user
        await interaction.reply({
          content: "There's no track currently playing.",
          ephemeral: true,
        });
      }
    } else {
      return await interaction.reply({
        content:
          "You can only use this command in #listening-parties, #listening-parties-host, and #guessing-games channels.",
        ephemeral: true,
      });
    }
  },
};
