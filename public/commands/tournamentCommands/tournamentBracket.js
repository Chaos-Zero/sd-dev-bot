const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");

const { BuildFinalsSummary } = require("../../tournament/tournamentResults.js");
const {
  BuildTournamentChoices,
  ResolveTournament,
  BuildTournamentOptions,
} = require("../../tournament/resultsPicker.js");
const {
  RenderFinalsBracket,
} = require("../../imageprocessing/finalsBracketBuilder.js");

const ASSET_BASE =
  process.env.ASSET_BASE_URL || "http://91.99.239.6/files/assets";
const FOOTER = {
  text: "Supradarky's VGM Club",
  iconURL: `${ASSET_BASE}/sd-img.png`,
};
const FALLBACK_THUMB = `${ASSET_BASE}/album_art.png`;
const SELECT_ID = "tournament-bracket-pick";

function getTournamentRoot() {
  const db = GetDb();
  db.read();
  return db.get("tournaments").nth(0).value() || {};
}

function winnerThumb(summary) {
  const winner = summary?.podium?.winner;
  return winner && winner.videoId
    ? `https://i1.ytimg.com/vi/${winner.videoId}/mqdefault.jpg`
    : FALLBACK_THUMB;
}

function render(root, tournamentName) {
  const tournament = root[tournamentName];
  const summary = BuildFinalsSummary(tournament);
  if (!summary) {
    return { content: `No completed matches recorded for **${tournamentName}**.` };
  }

  const embed = new EmbedBuilder()
    .setTitle(tournamentName)
    .setColor(0xfaa61a)
    .setThumbnail(winnerThumb(summary))
    .setFooter(FOOTER);

  const winner = summary.podium.winner;
  embed.setDescription(
    winner
      ? `Won by **[${winner.name}](${winner.link || "https://youtube.com"})**${
          winner.title ? ` — _${winner.title}_` : ""
        }`
      : "_The final ended level, so the contest has no outright winner._"
  );

  const files = [];
  const png = RenderFinalsBracket({ tournamentName, summary });
  if (png) {
    const fileName = `finals-${Date.now()}.png`;
    files.push(new AttachmentBuilder(png, { name: fileName }));
    embed.setImage(`attachment://${fileName}`);
  }

  const components = [];
  const options = BuildTournamentOptions(root, tournamentName);
  if (options.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(SELECT_ID)
          .setPlaceholder("Showing: " + tournamentName)
          .addOptions(options)
      )
    );
  }

  return { embeds: [embed], files, components };
}

// Choices are fixed when the module loads; see resultsPicker.js for why.
function tournamentChoices() {
  try {
    return BuildTournamentChoices(getTournamentRoot());
  } catch (error) {
    console.error("Could not build tournament choices:", error);
    return [];
  }
}

const command = new SlashCommandBuilder()
  .setName("tournament-bracket")
  .setDescription(
    "Show the closing rounds of a finished tournament as a bracket."
  )
  .addStringOption((option) => {
    option
      .setName("tournament")
      .setDescription("Which tournament. Defaults to the most recent finished one.")
      .setRequired(false);
    const choices = tournamentChoices();
    if (choices.length) option.addChoices(...choices);
    return option;
  })
  .addBooleanOption((option) =>
    option
      .setName("make-public")
      .setDescription("Make the response viewable to the server.")
      .setRequired(false)
  );

module.exports = {
  data: command,

  async execute(interaction) {
    const isPublic = interaction.options.getBoolean("make-public") || false;
    await interaction.deferReply({ ephemeral: !isPublic });

    const root = getTournamentRoot();
    const chosen = ResolveTournament(
      root,
      interaction.options.getString("tournament")
    );
    if (!chosen) {
      return interaction.editReply({
        content: "There are no finished tournaments to show yet.",
      });
    }
    return interaction.editReply(render(root, chosen.name));
  },
};

module.exports.handleBracketPick = async (interaction) => {
  const root = getTournamentRoot();
  const chosen = ResolveTournament(root, interaction.values?.[0]);
  if (!chosen) {
    return interaction.reply({
      content: "That tournament is no longer available.",
      ephemeral: true,
    });
  }
  await interaction.deferUpdate();
  // attachments must be cleared or the previous bracket lingers
  return interaction.editReply({ ...render(root, chosen.name), attachments: [] });
};
