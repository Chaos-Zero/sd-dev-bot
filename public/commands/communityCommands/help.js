const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/ytPlayback/ytDmMessages.js") + "");

const domoHelpThumb = "http://91.99.239.6/files/assets/bowtie.png";
const domoHelpFoot = {
  text: "Supradarky's VGM Club",
  iconURL: "http://91.99.239.6/files/assets/sd-img.png",
};

function buildHelpTopicSelectMenuFromCategories(categories) {
  const options = categories.map((category) => ({
    label: category.title,
    description: category.summary.slice(0, 100),
    value: category.id,
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("domo-help-topic")
      .setPlaceholder("Select a help topic")
      .addOptions(options)
  );
}

function buildHelpIntroEmbedForCategories(categories) {
  const descriptionLines = [
    "Hi! Here are the command categories available:",
    "",
    ...categories.map(
      (category) => `• **${category.title}** — ${category.summary}`
    ),
    "",
  ];

  return new EmbedBuilder()
    .setTitle("MajorDomo Help")
    .setColor(0x5865f2)
    .setThumbnail(domoHelpThumb)
    .setDescription(descriptionLines.join("\n"))
    .setFooter(domoHelpFoot);
}

function getDomoAdminStatus(interaction) {
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
  const isOwner = interaction.guild.ownerId === interaction.user.id;
  const isDbAdmin = admins.includes(interaction.user.id);
  const memberRoles = interaction.member?.roles?.cache;
  const hasAdminRole =
    memberRoles && adminRoles.some((roleId) => memberRoles.has(roleId));
  return isOwner || isDbAdmin || hasAdminRole;
}

function filterHelpCategoriesForUser(categories, isAdmin) {
  return categories
    .filter((category) =>
      isAdmin ? true : category.id !== "tournament-admin"
    )
    .map((category) => {
      if (isAdmin || category.id !== "youtube") {
        return category;
      }
      const filteredCommands = category.commands.filter(
        (command) =>
          command.name !== "/toggle-playlist-channel" &&
          command.name !== "/list-yt-channels"
      );
      return { ...category, commands: filteredCommands };
    });
}

function isRestrictedHelpTopic(topic, isAdmin) {
  if (isAdmin) {
    return false;
  }
  const normalized = topic?.toLowerCase() || "";
  return (
    normalized === "tournament-admin" ||
    normalized === "tournament setup" ||
    normalized === "tournament admin" ||
    normalized === "/toggle-playlist-channel" ||
    normalized === "toggle-playlist-channel" ||
    normalized === "/list-yt-channels" ||
    normalized === "list-yt-channels"
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show MajorDomo command categories and details."),
  async execute(interaction) {
    const isAdmin = getDomoAdminStatus(interaction);
    const categories = filterHelpCategoriesForUser(
      getDomoHelpCategories(),
      isAdmin
    );
    const embed = buildHelpIntroEmbedForCategories(categories);
    const row = buildHelpTopicSelectMenuFromCategories(categories);
    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },
};
