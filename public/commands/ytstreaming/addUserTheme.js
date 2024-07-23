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
eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/database/write.js") + "");
eval(fs.readFileSync("./public/ytPlayback/ytPlayback.js") + "");
eval(fs.readFileSync("./public/ytPlayback/ytQueueCommands.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yt-register-user-theme")
    .setDescription(
      "Add a song which plays when someone uses your tag during listening parties!"
    )
    .addStringOption((option) =>
      option
        .setName("youtube-url")
        .setDescription("The url of the song you want to share.")
        .setRequired(true)
    ),
  async execute(interaction) {
    const ytUrl = interaction.options.getString("youtube-url") || "";

    if (ytUrl == "" || !ytdl.validateURL(ytUrl)) {
      return interaction.reply({
        content:
          "The provided URL is not a link I can process. Please check the link and try again.",
        ephemeral: true,
      });
    }
    var urlId = extractYouTubeID(ytUrl);
    if (
      urlId == "dQw4w9WgXcQ" ||
      urlId == "iik25wqIuFo" ||
      urlId == "oHg5SJYRHA0"
    ) {
      return interaction.reply({
        content:
          "I think I'll give this one up, let you down, ran around and desert **U**..rl",
        files: [
          "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/icegif-162.gif?v=1708620662863",
        ],
        ephemeral: true,
      });
      return;
    }

    if (
      urlId == "sC0cvwnG0Ik" ||
      urlId == "xz44n6vOgJM" ||
      urlId == "vVvMdshEYhQ" ||
      urlId == "PTS0IpBoO78"
    ) {
      return interaction.reply({
        content:
          "You're the only one on the bus, and it already left the station. Plz, no.",
        files: [
          "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/mOoj9J.gif?v=1708621520820",
        ],
        ephemeral: true,
      });
      return;
    }
    var db = GetDb();
    await db.read();

    let user = {
      username: interaction.member.displayName,
      url: ytUrl,
      userId: interaction.user.id,
    };

    await db
      .get("userThemes")
      .remove({ userId: interaction.user.id }) 
      .write(); 

    await db
      .get("userThemes")
      .push({
        username: interaction.member.displayName,
        url: ytUrl,
        userId: interaction.user.id,
      })
      .write();

    return interaction.reply({
      content: `You have set your theme to ${ytUrl}.\nThe is can be listened to at any time by tagging yourself in the url submission of \`yt-play\``,
      ephemeral: true,
    });
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

function removeSpacesAndAdjustCommas(str) {
  // First, remove all spaces from the string
  str = str.replace(/ /g, "");
  // Then, remove trailing commas or replace double commas with a single comma
  str = str.replace(/,,/g, ",").replace(/,+$/, "");
  return str;
}

function extractYouTubeID(url) {
  const regExp =
    /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);

  if (match && match[2].length == 11) {
    // The video ID is always 11 characters
    return match[2];
  } else {
    return null; // Return null if no valid ID found
  }
}
