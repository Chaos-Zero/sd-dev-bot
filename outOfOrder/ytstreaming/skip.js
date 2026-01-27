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
//eval(fs.readFileSync("./public/ytPlayback/ytPlayback.js") + "");
eval(fs.readFileSync("./public/ytPlayback/ytQueueCommands.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yt-skip-song")
    .setDescription("Skips the song currently playing")
    .addNumberOption((option) =>
      option
        .setName("skip-to")
        .setDescription(
          "Skip tracks in queue to a specific song (tracks before song are removed)"
        )
        .setRequired(false)
    ),
  async execute(interaction) {
    const queue = QueueManager.getQueue(interaction.guild.id);
    const songIndex = interaction.options.getNumber("skip-to") || false;
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
    if (queue.songs.length < 1) {
      return await interaction.reply({
        content:
          "You cannot skip the last song. \nUse `/yt-stop` to disconnect Domo instead.",
        ephemeral: true,
      });
    }

    if (songIndex) {
      if (
        songIndex > queue.songs.length ||
        parseInt(songIndex) == "NaN" ||
        songIndex == 0 ||
        songIndex < 0
      ) {
        return interaction.reply({
          content: "Please enter the number corresponding to a song in queue.",
          ephemeral: true,
        });
      }
    }

    // Assuming the first song in the queue is currently playing and not yet removed
    // If a song is currently playing, stop it to trigger the 'idle' event
    var skippedMessage = "Skipped the current song.";
    if (songIndex && songIndex !== 1) {
      for (var i = 0; i < songIndex - 1; i++) {
        var removedSong = queue.songs.shift();
        console.log(removedSong.title + " skipped");
      }

      skippedMessage = !gamesDetails.isGameRunning
        ? `Skipped to song ` +
          songIndex +
          `. [${queue.songs[0].title}](${queue.songs[0].url})`
        : `Skipped to song ` + songIndex;
    } else {
      skippedMessage = !gamesDetails.isGameRunning
        ? `Now playing [${queue.songs[0].title}](${queue.songs[0].url})`
        : `Now playing Guessing Game Track`;
    }
    if (queue.player && queue.player.state.status !== "idle") {
      queue.player.stop(); // This should automatically trigger moving to the next song
      await interaction.reply({
        content: skippedMessage,
        ephemeral: gamesDetails.isGameRunning,
      });
    } else {
      // Directly attempt to play the next song if for some reason the player is idle but songs are in the queue
      await playNextSong(currentGuildID);
      await interaction.reply({
        content: "Moving to the next song in the queue.",
        ephemeral: gamesDetails.isGameRunning,
      });
    }
  },
};
