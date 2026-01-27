const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove-tournament")
    .setDescription("Remove a tournament from the DB (with confirmation).")
    .addStringOption((option) =>
      option
        .setName("tournament-name")
        .setDescription("Exact tournament name to remove.")
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const tournamentName = interaction.options.getString("tournament-name");
    const db = GetDb();
    await db.read();

    const tournamentDetails = db.get("tournaments").nth(0).value();
    if (!tournamentDetails?.[tournamentName]) {
      await interaction.editReply(
        `No tournament named "${tournamentName}" was found.`
      );
      return;
    }

    const confirmButton = new ButtonBuilder()
      .setCustomId("remove-tournament-confirm")
      .setLabel("Yes, remove it")
      .setStyle(ButtonStyle.Danger);
    const cancelButton = new ButtonBuilder()
      .setCustomId("remove-tournament-cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(
      confirmButton,
      cancelButton
    );

    const message = await interaction.editReply({
      content:
        `Are you sure you want to remove "${tournamentName}" from the DB? ` +
        "This cannot be undone.",
      components: [row],
    });

    const collector = message.createMessageComponentCollector({
      time: 30000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (i) => {
      await i.deferUpdate();
      if (i.customId === "remove-tournament-confirm") {
        const currentTournament = db
          .get("tournaments[0].currentTournament")
          .value();
        if (currentTournament === tournamentName) {
          db.get("tournaments")
            .nth(0)
            .assign({ currentTournament: "N/A" })
            .write();
        }
        db.get("tournaments")
          .nth(0)
          .unset(tournamentName)
          .write();
        await interaction.editReply({
          content: `Tournament "${tournamentName}" removed.`,
          components: [],
        });
      } else {
        await interaction.editReply({
          content: "Removal cancelled.",
          components: [],
        });
      }
      collector.stop();
    });

    collector.on("end", async (_collected, reason) => {
      if (reason === "time") {
        await interaction.editReply({
          content: "Removal timed out.",
          components: [],
        });
      }
    });
  },
};
