const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
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
    testMode: {
      enabled: false,
      channelId: "",
      channelName: "",
    },
  };
  db.get("tournaments").push(base).write();
  return base;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("manage-admin")
    .setDescription("Add or remove Domo Admins (owner/admin only).")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Choose whether to add or remove an admin.")
        .setRequired(true)
        .addChoices(
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" }
        )
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to add as a Domo Admin.")
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.guild) {
      return interaction.editReply("This command can only be used in a server.");
    }

    const db = GetDb();
    await db.read();
    const tournamentRoot = ensureTournamentRoot(db);
    const admins = Array.isArray(tournamentRoot.admin)
      ? tournamentRoot.admin
      : [];

    const requesterId = interaction.user.id;
    const isOwner = interaction.guild.ownerId === requesterId;
    const isDbAdmin = admins.includes(requesterId);

    if (!isOwner && !isDbAdmin) {
      return interaction.editReply(
        "Only the server owner or existing Domo Admins can use this command."
      );
    }

    const action = interaction.options.getString("action");

    if (action === "add") {
      const user = interaction.options.getUser("user");
      if (!user) {
        return interaction.editReply(
          "Please provide a user to add as a Domo Admin."
        );
      }

      const alreadyAdmin = admins.includes(user.id);
      if (!alreadyAdmin) {
        admins.push(user.id);
      }

      await db
        .get("tournaments")
        .nth(0)
        .assign({ admin: admins })
        .write();

      return interaction.editReply(
        alreadyAdmin
          ? `${user.tag} is already a Domo Admin.`
          : `Added ${user.tag} as a Domo Admin.`
      );
    }

    const ownerId = interaction.guild.ownerId;
    const removableAdmins = admins.filter((id) => id !== ownerId);
    if (removableAdmins.length === 0) {
      return interaction.editReply(
        "There are no Domo Admins to remove (owner cannot be removed)."
      );
    }

    const members = await interaction.guild.members.fetch({
      user: removableAdmins,
    });
    const options = removableAdmins.map((adminId) => {
      const member = members.get(adminId);
      const label = member?.displayName || `User ${adminId}`;
      return {
        label: label.slice(0, 100),
        description: `ID: ${adminId}`.slice(0, 100),
        value: adminId,
      };
    });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("manage-admin-remove")
        .setPlaceholder("Select an admin to remove")
        .addOptions(options)
    );

    const message = await interaction.editReply({
      content: "Select a Domo Admin to remove:",
      components: [row],
    });

    const collector = message.createMessageComponentCollector({
      time: 30000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (i) => {
      if (i.customId !== "manage-admin-remove") {
        return;
      }
      const selectedId = i.values?.[0];
      if (!selectedId) {
        await i.update({
          content: "No admin selected.",
          components: [],
        });
        collector.stop();
        return;
      }
      if (selectedId === ownerId) {
        await i.update({
          content: "You cannot remove the server owner from admins.",
          components: [],
        });
        collector.stop();
        return;
      }
      const updatedAdmins = admins.filter((id) => id !== selectedId);
      await db
        .get("tournaments")
        .nth(0)
        .assign({ admin: updatedAdmins })
        .write();

      const removedMember = members.get(selectedId);
      const removedLabel = removedMember?.user?.tag || selectedId;

      await i.update({
        content: `Removed ${removedLabel} from Domo Admins.`,
        components: [],
      });
      collector.stop();
    });

    collector.on("end", async (_collected, reason) => {
      if (reason === "time") {
        await interaction.editReply({
          content: "Admin removal timed out.",
          components: [],
        });
      }
    });
  },
};
