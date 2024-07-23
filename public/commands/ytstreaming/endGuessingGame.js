const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const fs = require("fs");
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/tournament/dmUtils.js") + "");
eval(fs.readFileSync("./public/collections/roles.js") + "");
const path = require("path");
const QueueManager = require(path.join(
  require.main.path,
  "public",
  "ytPlayback",
  "queueManager"
));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gg-end-guessing-game")
    .setDescription(
      "Ends the current guessing game and opens the bot back up to the server."
    ),
  async execute(interaction) {
    if (
      interaction.channel.name == "listening-parties-host" ||
      interaction.channel.name == "listening-parties" ||
      interaction.channel.name == "guessing-games"
    ) {
      var db = GetDb();
      await db.read();
      const members = await interaction.guild.members.fetch();
      const guildId = interaction.guildId;
      const queue = QueueManager.getQueue(guildId);
      queue.isCurrentlyGuessingGame = false;
      const guessingChannelName = "guessing-games";

      let gamesDetails = await db.get("guessingGame").nth(0).value();

      var host = interaction.user.id;

      if (!gamesDetails.isGameRunning) {
        return await interaction
          .reply({
            content:
              "There does not appear to be a guessing game taking place.",
            components: [],
            ephemeral: true,
          })
          .catch(console.error);
      }

      if (
        gamesDetails.isGameRunning &&
        !gamesDetails.currentHosts.includes(interaction.user.id)
      ) {
        return await interaction.reply({
          content: "This command can only be run by the host and admins.",
          ephemeral: true,
        });
      }

      await interaction.reply({
        content: `Thank you for hosting a guessing game!\nThe Bot has been reset back to normal usage.`,
        ephemeral: true,
      });

      let guessingGameScores = gamesDetails.currentGamePoints;
      guessingGameScores.sort((a, b) => b.count - a.count);

      var scoreEmbed = new EmbedBuilder();

      var scoresText = "Other players: ";
      if (guessingGameScores.length > 3) {
        for (var i = 3; i < guessingGameScores.length; i++) {
          if (guessingGameScores[i].count > 0) {
            scoresText += `${i + 1}. ${GetUserNameFromId(
              guessingGameScores[i].id,
              members
            )} - ${guessingGameScores[i].count} points\n`;
          }
        }
      }
      if (guessingGameScores.length > 0) {
        scoreEmbed
          .setTitle(
            `1st place: ${GetUserNameFromId(guessingGameScores[0].id, members)}`
          )
          .setAuthor({
            name: `${interaction.member.displayName} Guessing Game Results`,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setColor(0xffffff)

          .setDescription(`**Points: ${guessingGameScores[0].count}**`);
        //.setImage(previousWinnerPath);

        if (guessingGameScores[1]) {
          scoreEmbed.addFields({
            name: `2nd place: ${GetUserNameFromId(
              guessingGameScores[1].id,
              members
            )}`,
            value: "Points: " + guessingGameScores[1].count,
            inline: true,
          });
        }
        if (guessingGameScores[2]) {
          scoreEmbed.addFields({
            name: `3rd place: ${GetUserNameFromId(
              guessingGameScores[2].id,
              members
            )}`,
            value: "Points: " + guessingGameScores[2].count,
            inline: true,
          });
        }
        if (guessingGameScores.length > 3) {
          scoreEmbed.addFields({
            name: "---------------------------",
            value: scoresText,
            inline: false,
          });
        }
      }
      gamesDetails.isGameRunning = false;
      gamesDetails.currentHosts = [];
      gamesDetails.currentGamePoints = [];

      const targetChannel = interaction.guild.channels.cache.find(
        (channel) => channel.name == guessingChannelName
      );
      if (targetChannel) {
        if (guessingGameScores.length > 0) {
          await targetChannel
            .send({
              content: `<@${interaction.user.id}> has ended the guessing game! Thank you all for coming!`,
              embeds: [scoreEmbed],
            })
            .then(() => console.log(`Message sent to ${guessingChannelName}`))
            .catch(console.error); // Always good practice to catch potential errors
        } else {
          await targetChannel
            .send({
              content: `<@${interaction.user.id}> has ended the guessing game! Thank you all for coming!`,
            })
            .then(() => console.log(`Message sent to ${guessingChannelName}`))
            .catch(console.error); // Always good practice to catch potential errors}
        }
      } else {
        console.log("Channel not found.");
        // Optionally, inform the user that the channel was not found. Adjust based on your command handling logic.
        // interaction.reply({ content: 'The specified channel was not found.', ephemeral: true });
      }
      await db.get("guessingGame").nth(0).assign(gamesDetails).write();
    } else {
      return await interaction.reply({
        content:
          "You can only use this command in #listening-parties, #listening-parties-host, and #guessing-games channels.",
        ephemeral: true,
      });
    }
  },
};

function GetUserNameFromId(user, members) {
  var outputMessage = "";
  var discordMember = members.find((member) => member.id == user);
  var outputName =
    discordMember == undefined
      ? "*ID:" + user + "*"
      : "**" + discordMember.displayName + "**";
  return outputName;
}
