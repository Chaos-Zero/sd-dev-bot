/**
 * Who is allowed to administer tournaments.
 *
 * The Discord server gates these commands through its integration permissions
 * as well, but that configuration lives outside the repository and cannot be
 * reviewed or version-controlled here, so the same check is enforced in code.
 *
 * Reads the database's own admin fields rather than Discord's permission flags:
 *   admin       ids of individual Domo Admins, managed by /tournament-manage-admin
 *   adminRoles  role ids whose holders are Domo Admins
 *
 * adminRoles is only created once a role is actually added, so it is absent on
 * a database that has never had one -- that half of the test is then simply
 * inert, and the server owner plus the admin list still get through.
 */
function IsDomoAdmin(interaction, tournamentRoot) {
  if (!interaction || !interaction.guild) {
    return false;
  }

  let root = tournamentRoot;
  if (!root) {
    // GetDb comes from main.js, eval'd by every command that uses this.
    const db = GetDb();
    db.read();
    root = db.get("tournaments").nth(0).value() || {};
  }

  const requesterId = interaction.user.id;
  const admins = Array.isArray(root.admin) ? root.admin : [];
  const adminRoles = Array.isArray(root.adminRoles) ? root.adminRoles : [];
  const memberRoles = interaction.member?.roles?.cache;

  return (
    interaction.guild.ownerId === requesterId ||
    admins.includes(requesterId) ||
    Boolean(memberRoles && adminRoles.some((roleId) => memberRoles.has(roleId)))
  );
}

/**
 * Guard for the top of an admin command's execute(). Answers the interaction
 * itself when the caller is not an admin, so the command body can just stop:
 *
 *   if (!(await RequireDomoAdmin(interaction))) return;
 */
async function RequireDomoAdmin(interaction, tournamentRoot) {
  if (IsDomoAdmin(interaction, tournamentRoot)) {
    return true;
  }

  const message = !interaction?.guild
    ? "This command can only be used in a server."
    : "Only the server owner or Domo Admins can use this command.";

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  } catch (error) {
    console.error("Failed to turn away a non-admin caller:", error);
  }
  return false;
}

if (typeof module !== "undefined") {
  module.exports = {
    IsDomoAdmin,
    RequireDomoAdmin,
  };
}
