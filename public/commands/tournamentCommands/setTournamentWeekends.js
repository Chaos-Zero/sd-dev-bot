const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");

function isDomoAdmin(interaction, tournamentRoot) {
  const requesterId = interaction.user.id;
  const isOwner = interaction.guild.ownerId === requesterId;
  const admins = Array.isArray(tournamentRoot.admin)
    ? tournamentRoot.admin
    : [];
  const adminRoles = Array.isArray(tournamentRoot.adminRoles)
    ? tournamentRoot.adminRoles
    : [];
  const isDbAdmin = admins.includes(requesterId);
  const memberRoles = interaction.member?.roles?.cache;
  const hasAdminRole =
    memberRoles && adminRoles.some((roleId) => memberRoles.has(roleId));
  return isOwner || isDbAdmin || hasAdminRole;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-set-weekends")
    .setDescription("Enable or disable weekend tournament posting.")
    .addBooleanOption((option) =>
      option
        .setName("include-weekends")
        .setDescription("Post matches on Saturday and Sunday")
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.guild) {
      return interaction.editReply("This command can only be used in a server.");
    }

    const includeWeekends = interaction.options.getBoolean("include-weekends");

    const db = GetDb();
    await db.read();
    const tournamentRoot = ensureTournamentRoot(db);

    if (!isDomoAdmin(interaction, tournamentRoot)) {
      return interaction.editReply(
        "Only the server owner or Domo Admins can use this command."
      );
    }

    await db
      .get("tournaments")
      .nth(0)
      .assign({ tournamentIncludeWeekends: includeWeekends })
      .write();

    const schedule = ResetTournamentSchedule();
    const nextEpoch = GetNextTournamentScheduleEpoch();

    return interaction.editReply(
      `Weekend posting is now ${
        includeWeekends ? "enabled" : "disabled"
      }. Next scheduled run: <t:${nextEpoch}:F> (<t:${nextEpoch}:R>).`
    );
  },
};
