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
eval(fs.readFileSync("./public/tournament/dmUtils.js") + "");
eval(fs.readFileSync("./public/collections/roles.js") + "");
eval(fs.readFileSync("./public/ytPlayback/ytDmMessages.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gg-host-guessing-game")
    .setDescription(
      "Hide songs and start a guessing game. Only you can use commands during this period."
    )
    .addStringOption((option) =>
      option
        .setName("add-cohosts")
        .setDescription(
          "Tag a user (e.g. @MajorDomo-bot) to become a cohost (can add multiple by using commas)"
        )
        .setRequired(false)
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

    const guessingChannelName = "guessing-games";

    let gamesDetails = await db.get("guessingGame").nth(0).value();

    var host = interaction.user.id;
    const cohostsString = interaction.options.getString("add-cohosts") || "";
    const cohostsStringNoSpaces = removeSpacesAndAdjustCommas(cohostsString);
    const splitcohosts = cohostsStringNoSpaces.split(",");

    var hosts = [];
    hosts.push(host);

    if (!cohostsString == "") {
      for (var cohost of splitcohosts) {
        if (!cohost.includes("<@")) {
          return interaction.reply({
            content:
              "Please use a tag for the cohost you want to add.\ne.g. `/yt-host-guessing-game` `add-cohosts`**@MajorDomo-Bot**, **@OtherMember**",
            ephemeral: true,
          });
        }
        var userNumb = cohost.match(/\d/g);
        var userId = userNumb.join("").trim();
        hosts.push(userId);
      }
    }

    if (gamesDetails.isGameRunning) {
      await interaction
        .reply({
          content:
            "There is already a guessing game taking place.\nPlease wait until the current game has concluded.",
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    }

    await interaction.reply({
      content: "Entering guessing game mode.",
      ephemeral: true,
    });

    gamesDetails.isGameRunning = true;
    gamesDetails.currentHosts = hosts;
    gamesDetails.currentGamePoints = [];

    const guildId = interaction.guildId;
    const queue = QueueManager.getQueue(guildId);
    queue.isCurrentlyGuessingGame = true;

    if (queue && queue.connection) {
      queue.connection.destroy(); // Use destroy() to ensure cleanup of resources
    }
    // Reset or delete the queue if needed
    QueueManager.deleteQueue(guildId);

    const targetChannel = interaction.guild.channels.cache.find(
      (channel) => channel.name == guessingChannelName
    );

    if (targetChannel) {
      await SendGuessingGameHelpDmMessage(interaction.user);

      await targetChannel
        .send(
          `Hello <@&${discordRoles["quizParticipant"]}>, <@${interaction.user.id}> is getting ready to host a guessing game!\nPrepare for more information incoming!`
        )
        .then(() => console.log(`Message sent to ${guessingChannelName}`))
        .catch(console.error); // Always good practice to catch potential errors
    } else {
      console.log("Channel not found.");
      // Optionally, inform the user that the channel was not found. Adjust based on your command handling logic.
      // interaction.reply({ content: 'The specified channel was not found.', ephemeral: true });
    }
    await db.get("guessingGame").nth(0).assign(gamesDetails).write();
  },
};

function removeSpacesAndAdjustCommas(str) {
  // First, remove all spaces from the string
  str = str.replace(/ /g, "");
  // Then, remove trailing commas or replace double commas with a single comma
  str = str.replace(/,,/g, ",").replace(/,+$/, "");
  return str;
}
