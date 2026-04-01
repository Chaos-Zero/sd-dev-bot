const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");

function ensureTournamentRoot(db) {
  const tournaments = db.get("tournaments").value() || [];
  if (tournaments.length > 0 && tournaments[0]) {
    return tournaments[0];
  }
  const base = {
    currentTournament: "N/A",
    receiptUsers: [],
    admin: [],
    adminRoles: [],
    testMode: {
      enabled: false,
      channelId: "",
      channelName: "",
    },
    tournamentPostTime: "19:00",
    tournamentIncludeWeekends: false,
  };
  db.get("tournaments").push(base).write();
  return base;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-april-fools")
    .setDescription("Manually trigger the April Fools joke messages (Admin only)."),
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    const db = GetDb();
    await db.read();
    const tournamentRoot = ensureTournamentRoot(db);
    const admins = Array.isArray(tournamentRoot.admin)
      ? tournamentRoot.admin
      : [];
    const adminRoles = Array.isArray(tournamentRoot.adminRoles)
      ? tournamentRoot.adminRoles
      : [];

    const requesterId = interaction.user.id;
    const isOwner = interaction.guild.ownerId === requesterId;
    const isDbAdmin = admins.includes(requesterId);
    const memberRoles = interaction.member?.roles?.cache;
    const hasAdminRole =
      memberRoles && adminRoles.some((roleId) => memberRoles.has(roleId));

    if (!isOwner && !isDbAdmin && !hasAdminRole) {
      return interaction.reply({
        content: "Only the server owner or existing Domo Admins can use this command.",
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: "Triggering April Fools joke messages...",
      ephemeral: true,
    });

    try {
      await CreateAprilFools();
      await interaction.editReply({
        content: "April Fools joke messages sent successfully!",
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error triggering April Fools:", error);
      await interaction.editReply({
        content: "An error occurred while sending April Fools messages.",
        ephemeral: true,
      });
    }
  },
};
