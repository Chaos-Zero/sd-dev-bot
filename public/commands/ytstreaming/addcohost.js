const { SlashCommandBuilder } = require("discord.js");
const { joinVoiceChannel } = require("@discordjs/voice");
const fs = require("fs");
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
    .setName("gg-register-cohost")
    .setDescription("Add other members to cohost a guessing game with you")
    .addStringOption((option) =>
      option
        .setName("cohosts")
        .setDescription(
          "Tag a user (e.g. @MajorDomo-bot) to become a cohost (can add multiple by using commas)"
        )
        .setRequired(true)
    ),
  async execute(interaction) {
    var db = GetDb();
    await db.read();

    const guessingChannelName = "guessing-games";
    let gamesDetails = await db.get("guessingGame").nth(0).value();

    if (interaction.channel.name !== "listening-parties-host") {
      return await interaction.reply({
        content:
          "You can only use this command in the #listening-parties-host channel.",
        ephemeral: true,
      });
    }
    if (!gamesDetails.isGameRunning) {
      await interaction
        .reply({
          content: "There does not seem to be a guessing game taking place.",
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    }
    if (
      gamesDetails.isGameRunning &&
      !gamesDetails.currentHosts.includes(interaction.user.id)
    ) {
      return await interaction.editReply({
        content:
          "You must be the current guessing game host to run this command.",
        ephemeral: true,
      });
      return;
    }

    const cohostsString = interaction.options.getString("cohosts") || "";
    const cohostsStringNoSpaces = removeSpacesAndAdjustCommas(cohostsString);
    const splitcohosts = cohostsStringNoSpaces.split(",");
    var hosts = gamesDetails.currentHosts;

    var coshostsString = "Added as cohost: ";
    for (var cohost of splitcohosts) {
      if (cohost == "" || !cohost.includes("<@")) {
        return interaction.reply({
          content:
            "Please use a tag for the cohost you want to add.\ne.g. `/yt-host-guessing-game` `add-cohosts`**@MajorDomo-Bot**, **@OtherMember**",
          ephemeral: true,
        });
      }
      var userNumb = cohost.match(/\d/g);
      var userId = userNumb.join("").trim();
      hosts.push(userId);
      coshostsString += `${cohost} `;
    }
    gamesDetails.currentHosts = hosts;

    return interaction.reply({
      content: coshostsString,
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
