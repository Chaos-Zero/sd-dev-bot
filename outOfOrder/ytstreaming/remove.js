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
    .setName("yt-remove-song")
    .setDescription("Remove songs from the queue by position number.")
    .addStringOption((option) =>
      option
        .setName("remove-songs")
        .setDescription(
          "Number of track to be removed (you can remove multiple by using commas e.g. 1,5,7)"
        )
        .setRequired(true)
    ),
  async execute(interaction) {
    const queue = QueueManager.getQueue(interaction.guild.id);

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
        content: "There are no songs in the queue to remove.",
        ephemeral: true,
      });
    }

    const songNum = interaction.options.getString("remove-songs");
    const songNumNoSpaces = removeSpacesAndAdjustCommas(songNum);
    const splitSongNum = songNumNoSpaces.split(",");
    for (var songNumber of splitSongNum) {
      if (
        parseInt(songNumber) == "NaN" ||
        parseInt(songNumber) - 1 < 0 ||
        parseInt(songNumber) > queue.songs.length
      ) {
        return interaction.reply({
          content:
            "There appears to be an issue with the number(s) provided.\nPlease enter the number corresponding to a song in the current queue.",
          ephemeral: true,
        });
      }
    }

    const sortedSongNumbers = convertAndSort(splitSongNum);
    console.log("sortedSongNumbers: " + sortedSongNumbers);

    // Assuming the first song in the queue is currently playing and not yet removed
    // If a song is currently playing, stop it to trigger the 'idle' event
    var removeddMessage = `The following songs have been removed from the queue:`;
    var removedMessageContent = "";

    for (var orderedSongNum of sortedSongNumbers) {
      var tempRemovedMessageContent = `\n > \`${orderedSongNum}. ${
        queue.songs[orderedSongNum - 1].title
      }\``;
      removedMessageContent = tempRemovedMessageContent.concat(
        removedMessageContent
      );

      removeEntryAtIndex(queue.songs, orderedSongNum - 1);
    }

    if (sortedSongNumbers.includes(0)) {
      queue.player.stop(); // This should automatically trigger moving to the next song
    }

    var messageToSend = removeddMessage.concat(removedMessageContent);
    await interaction.reply({
      content: messageToSend,
      ephemeral: gamesDetails.isGameRunning,
    });
  },
};

function removeSpacesAndAdjustCommas(str) {
  // First, remove all spaces from the string
  str = str.replace(/ /g, "");
  // Then, remove trailing commas or replace double commas with a single comma
  str = str.replace(/,,/g, ",").replace(/,+$/, "");
  return str;
}

function convertAndSort(arr) {
  return arr.map(Number).sort((a, b) => b - a);
}

function removeEntryAtIndex(array, index) {
  // Check if index is within the array bounds
  if (index >= 0 && index < array.length) {
    array.splice(index, 1);
  } else {
    console.log("Index out of bounds");
  }
  return array;
}
