const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/ytPlayback/ytDmMessages.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show MajorDomo command categories and details.")
    .addStringOption((option) =>
      option
        .setName("topic")
        .setDescription("Category or command (e.g. tournament setup, /register-tournament).")
        .setRequired(false)
    ),
  async execute(interaction) {
    const topic = interaction.options.getString("topic");
    let embed;

    if (!topic) {
      embed = buildHelpIntroEmbed();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const category = findHelpCategory(topic);
    if (category) {
      embed = buildHelpCategoryEmbed(category);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const commandMatch = findHelpCommand(topic);
    if (commandMatch) {
      embed = buildHelpCommandEmbed(
        commandMatch.command,
        commandMatch.category
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const fallbackEmbed = new EmbedBuilder()
      .setTitle("Help Topic Not Found")
      .setColor(0xffc107)
      .setThumbnail(DOMO_HELP_THUMBNAIL)
      .setDescription(
        "I couldn't find that category or command. Try `/help` to see the available categories."
      )
      .setFooter(DOMO_HELP_FOOTER);

    return interaction.reply({ embeds: [fallbackEmbed], ephemeral: true });
  },
};
