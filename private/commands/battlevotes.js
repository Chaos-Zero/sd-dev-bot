const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const fs = require("fs");
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/tournament/tournamentutils.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("battle-results")
    .setDescription(
      "See what people have voted on in past rounds. Defaults to yesterday."
    )
    .addStringOption((option) =>
      option
        .setName("round")
        .setDescription("The round where the battle took place.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("battle")
        .setDescription("The battle you want the votes for.")
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("make-public")
        .setDescription("Make the response viewable to the server.")
        .setRequired(false)
    ),
  async execute(interaction) {
    var battleNumber = interaction.options.getString("battle");
    var roundNumber = interaction.options.getString("round");
    const isPublic = interaction.options.getBoolean("make-public") || false;
    
    CreateAndSendBattleVotesEmbed(roundNumber, battleNumber, isPublic, interaction)
  },
};
