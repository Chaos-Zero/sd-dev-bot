const { SlashCommandBuilder } = require("discord.js");
const { joinVoiceChannel } = require("@discordjs/voice");
const fs = require("fs");
const ytdl = require("ytdl-core");
const ytpl = require("ytpl");
const path = require("path");
const sleep = require("util").promisify(setTimeout);
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
    .setName("yt-play")
    .setDescription("Add song to voice channel playlist")
    .addStringOption((option) =>
      option
        .setName("song-url")
        .setDescription("Youtube link to song or playlist, or the tag of a user with a theme set.")
        .setRequired(true)
    ),
  async execute(interaction) {
    var db = GetDb();
    await db.read();
    let gamesDetails = await db.get("guessingGame").nth(0).value();
    let userThemes = await db.get("userThemes");
    // Immediately defer the reply to prevent interaction timeout
    await interaction.deferReply({ ephemeral: gamesDetails.isGameRunning });
    var songUrl = interaction.options.getString("song-url");
    if (interaction.channel.name !== "listening-parties-host") {
      return await interaction.editReply({
        content:
          "You can only use this command in the #listening-parties-host channel.",
        ephemeral: true,
      });
    }

    if (
      gamesDetails.isGameRunning &&
      !gamesDetails.currentHosts.includes(interaction.user.id)
    ) {
      return await interaction.editReply({
        content: "This command cannot be used during a guessing game.",
        ephemeral: true,
      });
      return;
    }

    // Find the "VGM Station" voice channel
    const voiceChannel = interaction.guild.channels.cache.find(
      (channel) => channel.name == "VGM Station"
    );
    const currentGuildID = interaction.guild.id;
    if (!voiceChannel) {
      return await interaction.editReply({
        content: "The voice channel 'VGM Station' was not found.",
        ephemeral: true,
      });
    }

    // Check if there's at least one user in the voice channel
    /*if (!voiceChannel.members.size) {
      return await interaction.editReply({
        content:
          "There needs to be at least one user in the 'VGM Station' voice channel before starting any songs.",
        ephemeral: true,
      });
    }*/

    var urlIsUserTheme = songUrl.includes("<@");

    if (urlIsUserTheme) {
      var sanitisedUser = songUrl.replace(/[^0-9]/g, "");
      songUrl = "";
      for (let dbUser of userThemes) {
        if (dbUser.userId == sanitisedUser) {
          songUrl = dbUser.url.toString();
          await sleep(500);
          break;
        }
      }

      if (songUrl == "") {
        return await interaction.editReply({
          content: "It appears this user has not set up a theme to be played.",
          ephemeral: true,
        });
      }
    }

    if (!ytdl.validateURL(songUrl) && !ytpl.validateID(songUrl)) {
      await interaction.editReply({
        content:
          "The provided URL is not a link I can process. Please check the link and try again.",
        ephemeral: true,
      });
      return; // Stop execution if the URL is invalid
    }
    const queue = QueueManager.getQueue(interaction.guild.id);
    queue.textChannel = interaction.channel;
    // Prepare the song object
    var song = {
      url: songUrl,
      hidden: interaction.options.getBoolean("hidden") || false,
    };

    var returnMessage = !gamesDetails.isGameRunning
      ? "\nNow playing: " + song.url
      : "\nNow playing: Guessing Game Track";
    if (ytpl.validateID(songUrl)) {
      try {
        const playlistId = extractPlaylistId(songUrl);
        const playlist = await ytpl(playlistId);
        const songs = playlist.items.map((item) => ({
          url: item.shortUrl,
          title: item.title, // Storing title for display purposes, optional
          user: interaction.user.id,
          duration: convertToSeconds(item.duration),
          hidden: interaction.options.getBoolean("hidden") || false,
        }));

        var songsLengthBeforeEntry = songs.length;
        // Bulk add songs to the queue
        if (!QueueManager.getQueue(currentGuildID).player) {
          AddSongsToQueue(queue, songs);
        } else {
          await QueueManager.addSongsToQueue(currentGuildID, songs);
        }
        returnMessage = !gamesDetails.isGameRunning
          ? `"[${playlist.title}](${playlist.url})" registered: ${songsLengthBeforeEntry} songs have been added to the queue.`
          : `Guessing Game Tracks registered: ${songsLengthBeforeEntry} songs have been added to the queue.`;
        await interaction.editReply({
          content: returnMessage,
          ephemeral: gamesDetails.isGameRunning,
        });
      } catch (error) {
        console.error(`Error processing playlist: ${error}`);
        return await interaction.editReply({
          content: "There was an error processing your playlist.",
          ephemeral: true,
        });
      }
    } else if (ytdl.validateURL(songUrl)) {
      const videoInfo = await ytdl.getInfo(songUrl);
      song = {
        url: songUrl,
        title: videoInfo.videoDetails.title,
        user: interaction.user.id,
        duration: videoInfo.videoDetails.lengthSeconds,
        hidden: interaction.options.getBoolean("hidden") || false,
      };

      if (!QueueManager.getQueue(currentGuildID).player) {
        AddSongsToQueue(queue, song);
      } else {
        await QueueManager.addSongsToQueue(currentGuildID, song);
      }
    } else {
      return await interaction.editReply(
        "The provided URL is not a link I can process. Please check the link and try again."
      );
    }
    // Check if the bot is not already connected or playing, then start playback

    if (!queue.connection) {
      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: currentGuildID,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        queue.connection = connection;
        // Wait for the connection to be ready before playing
        await playSongWithRetry(currentGuildID, queue, queue.songs.shift());
        //returnMessage += "\nNow playing: " + song.url;
        await interaction.editReply({
          content: returnMessage,
          ephemeral: gamesDetails.isGameRunning,
        });
      } catch (error) {
        console.error(`Could not join the voice channel: ${error}`);
        queue.deleteQueue(currentGuildID);
        await interaction.editReply("Failed to join the voice channel.");
      }
    } else if (!ytpl.validateID(songUrl)) {
      var contentString = !gamesDetails.isGameRunning
        ? `Added "[${song.title}](${song.url})" to the queue.`
        : `Added a song to the queue`;
      await interaction.editReply({
        content: contentString,
        ephemeral: gamesDetails.isGameRunning,
      });
    }
  },
};

function convertToSeconds(hms) {
  var parts = hms.split(":");
  var seconds = 0,
    multiplier = 1;
  while (parts.length > 0) {
    seconds += multiplier * parseInt(parts.pop(), 10);
    multiplier *= 60;
  }
  return seconds;
}
