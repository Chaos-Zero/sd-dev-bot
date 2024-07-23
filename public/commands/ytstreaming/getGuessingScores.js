const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
} = require("discord.js");

const path = require("path");

const fs = require("fs");
eval(fs.readFileSync("./public/main.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gg-show-guessing-game-scores")
    .setDescription("Shows the scores of the current guessing game."),
  async execute(interaction) {
    if (
      interaction.channel.name == "listening-parties-host" ||
      interaction.channel.name == "listening-parties" ||
      interaction.channel.name == "guessing-games"
    ) {
      var db = GetDb();
      await db.read();
      let gamesDetails = await db.get("guessingGame").nth(0).value();

      if (
        gamesDetails.isGameRunning &&
        !gamesDetails.currentHosts.includes(interaction.user.id)
      ) {
        return await interaction.reply({
          content:
            "This command can only be used by a guessing game host while  game is running.",
          ephemeral: true,
        });
      }

      if (gamesDetails.currentGamePoints.length < 1) {
        return await interaction.reply({
          content:
            "There does not appear to be any points scroed yet in this guessing game.",
          ephemeral: true,
        });
      }

      const guildId = interaction.guildId;

      let guessingGameScores = gamesDetails.currentGamePoints;
      guessingGameScores.sort((a, b) => b.count - a.count);

      var contentString = `Scores for the current game:\n`;

      for (var i = 0; i < guessingGameScores.length; i++) {
        if (guessingGameScores[i].count > 0) {
          contentString += `${i + 1}. <@${guessingGameScores[i].id}> - ${
            guessingGameScores[i].count
          } points\n`;
        }
      }
      return await interaction.reply({
        content: contentString,
        ephemeral: true,
      });
    } else {
      return await interaction.reply({
        content:
          "You can only use this command in #listening-parties, #listening-parties-host, and #guessing-games channels.",
        ephemeral: true,
      });
    }
  },
};
