const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/ytPlayback/ytDmMessages.js") + "");

function isDomoAdmin(interaction) {
  if (!interaction.guild) {
    return false;
  }
  const db = GetDb();
  db.read();
  const tournamentRoot = db.get("tournaments").nth(0).value() || {};
  const admins = Array.isArray(tournamentRoot.admin) ? tournamentRoot.admin : [];
  const adminRoles = Array.isArray(tournamentRoot.adminRoles)
    ? tournamentRoot.adminRoles
    : [];
  const requesterId = interaction.user.id;
  const isOwner = interaction.guild.ownerId === requesterId;
  const isDbAdmin = admins.includes(requesterId);
  const memberRoles = interaction.member?.roles?.cache;
  const hasAdminRole =
    memberRoles && adminRoles.some((roleId) => memberRoles.has(roleId));
  return isOwner || isDbAdmin || hasAdminRole;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-dm-instructions")
    .setDescription("DM detailed instructions for setting up a tournament."),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      await interaction.editReply(
        "This command can only be used in a server."
      );
      return;
    }

    if (!isDomoAdmin(interaction)) {
      await interaction.editReply(
        "Only the server owner or Domo Admins can use this command."
      );
      return;
    }

    const dmResult = await SendTournamentHelpDm({ author: interaction.user });
    if (!dmResult) {
      await interaction.editReply(
        "I couldn't send you a DM. Please check your DM settings and try again."
      );
      return;
    }

    await interaction.editReply("Tournament setup instructions sent via DM.");
  },
};
