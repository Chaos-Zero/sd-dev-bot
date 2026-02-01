const { SlashCommandBuilder, ChannelType } = require("discord.js");
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
    .setName("tournament-set-channel")
    .setDescription("Set or change the channel for tournament matches/results.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel where matches/results will be posted.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.guild) {
      return interaction.editReply("This command can only be used in a server.");
    }

    const channel = interaction.options.getChannel("channel");
    if (!channel) {
      return interaction.editReply("Please provide a valid channel.");
    }

    const db = GetDb();
    await db.read();
    const tournamentRoot = ensureTournamentRoot(db);

    if (!isDomoAdmin(interaction, tournamentRoot)) {
      return interaction.editReply(
        "Only the server owner or Domo Admins can use this command."
      );
    }

    const currentTournamentName = tournamentRoot.currentTournament || "N/A";
    if (currentTournamentName === "N/A") {
      return interaction.editReply(
        "There doesn't appear to be a tournament running at this time."
      );
    }

    const tournament = tournamentRoot[currentTournamentName];
    if (!tournament) {
      return interaction.editReply(
        "I couldn't find the current tournament to update."
      );
    }

    tournament.channelId = channel.id;
    tournament.channelName = channel.name;

    await db
      .get("tournaments")
      .nth(0)
      .assign({ [currentTournamentName]: tournament })
      .write();

    return interaction.editReply(
      `Tournament match channel set to <#${channel.id}>.`
    );
  },
};
