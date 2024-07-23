const { SlashCommandBuilder } = require("discord.js");
const { joinVoiceChannel } = require("@discordjs/voice");
const fs = require("fs");
const ytdl = require("ytdl-core");
const ytpl = require("ytpl");
const path = require("path");
const QueueManager = require(path.join(
  require.main.path,
  "public",
  "ytPlayback",
  "queueManager"
));

eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/ytPlayback/ytPlayback.js") + "");
eval(fs.readFileSync("./public/ytPlayback/ytQueueCommands.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yt-move-song")
    .setDescription("Move a song's position in the queue")
    .addNumberOption((option) =>
      option
        .setName("current-position")
        .setDescription(
          "The number of the song in the queue that you want to move."
        )
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName("new-position")
        .setDescription("The position you want to move the song to.")
        .setRequired(true)
    ),
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
    const currentGuildID = interaction.guild.id;

    const queue = QueueManager.getQueue(currentGuildID);
    const oldPosition =
      interaction.options.getNumber("current-position") || false;
    const newPosition = interaction.options.getNumber("new-position") || false;
    if (
      !oldPosition ||
      !newPosition ||
      parseInt(oldPosition) - 1 < 0 ||
      parseInt(oldPosition) > queue.songs.length ||
      parseInt(newPosition) - 1 < 0 ||
      parseInt(newPosition) > queue.songs.length
    ) {
      return await interaction.reply({
        content:
          "There appears to be an issue with the positions supplied.\nPlease check the position numbers provided.",
        ephemeral: true,
      });
    }

    if (!queue) {
      return await interaction.reply({
        content: "The bot is not currently playing music in this server.",
        ephemeral: true,
      });
    }

    if (!queue.songs.length && queue.player.state.status === "idle") {
      return await interaction.reply({
        content: "There are no songs in the queue to skip.",
        ephemeral: true,
      });
    }

    // Assuming the first song in the queue is currently playing and not yet removed
    // If a song is currently playing, stop it to trigger the 'idle' event
    queue.songs = moveArrayItem(
      queue.songs,
      parseInt(oldPosition) - 1,
      parseInt(newPosition) - 1
    );
    // Directly attempt to play the next song if for some reason the player is idle but songs are in the queue
    await interaction.reply({
      content: `[${queue.songs[parseInt(newPosition) - 1].title}](${
        queue.songs[parseInt(newPosition) - 1].url
      }) moved to position \`${newPosition}\`.`,
      ephemeral: gamesDetails.isGameRunning,
    });
  },
};

function moveArrayItem(array, fromIndex, toIndex) {
  // Remove the item from the array at the fromIndex position
  const [item] = array.splice(fromIndex, 1);
  // Insert the item back into the array at the toIndex position
  array.splice(toIndex, 0, item);
  return array; // Return the modified array
}
