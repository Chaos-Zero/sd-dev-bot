const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");

const { BuildFinalsSummary } = require("../../tournament/tournamentResults.js");
const {
  BuildTournamentChoices,
  ResolveTournament,
  BuildTournamentOptions,
} = require("../../tournament/resultsPicker.js");

const ASSET_BASE =
  process.env.ASSET_BASE_URL || "http://91.99.239.6/files/assets";
const FOOTER = {
  text: "Supradarky's VGM Club",
  iconURL: `${ASSET_BASE}/sd-img.png`,
};
const FALLBACK_THUMB = `${ASSET_BASE}/album_art.png`;
const SELECT_ID = "tournament-results-pick";
const PLACES = [
  ["winner", "🥇 Winner"],
  ["runnerUp", "🥈 Runner-up"],
  ["third", "🥉 Third"],
  ["fourth", "Fourth"],
];

function getTournamentRoot() {
  const db = GetDb();
  db.read();
  return db.get("tournaments").nth(0).value() || {};
}

function trackLine(entrant) {
  if (!entrant) return null;
  const name = entrant.link
    ? `[${entrant.name}](${entrant.link})`
    : entrant.name;
  return entrant.title ? `${name}\n_${entrant.title}_` : name;
}

/** One stage as a compact scoreline block. */
function stageLines(round) {
  return round.matches
    .map((match) => {
      const [first, second] = match.entrants;
      if (!second) return `${first.name} — ${first.points}`;
      return `**${first.name}** ${first.points} – ${second.points} ${second.name}`;
    })
    .join("\n");
}

function render(root, tournamentName) {
  const tournament = root[tournamentName];
  const summary = BuildFinalsSummary(tournament);
  if (!summary) {
    return { content: `No completed matches recorded for **${tournamentName}**.` };
  }

  const winner = summary.podium.winner;
  const embed = new EmbedBuilder()
    .setTitle(tournamentName)
    .setColor(0xfaa61a)
    .setThumbnail(
      winner && winner.videoId
        ? `https://i1.ytimg.com/vi/${winner.videoId}/mqdefault.jpg`
        : FALLBACK_THUMB
    )
    .setFooter(FOOTER);

  const facts = [`${summary.entrants} entrants`, `${summary.matches} matches`];
  if (summary.votes) facts.push(`${summary.votes} votes`);
  if (summary.lastMatchAt) facts.push(`ran to ${summary.lastMatchAt.slice(0, 10)}`);
  embed.setDescription(`_${facts.join(" · ")}_`);

  // The podium first, in full, with links -- this command exists to be read
  // rather than looked at, so nothing here is truncated.
  for (const [key, label] of PLACES) {
    const line = trackLine(summary.podium[key]);
    if (line) embed.addFields({ name: label, value: line, inline: true });
  }
  if (!winner) {
    embed.addFields({
      name: "No outright winner",
      value: "The final ended level.",
    });
  }

  // then how it got there, most recent stage first
  for (const round of [...summary.rounds].reverse()) {
    if (round.stage === "Final") continue;
    embed.addFields({ name: round.stage, value: stageLines(round) });
  }
  const final = summary.rounds.find((r) => r.stage === "Final");
  if (final) {
    embed.addFields({ name: "Final", value: stageLines(final) });
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

  return { embeds: [embed], components };
}

function tournamentChoices() {
  try {
    return BuildTournamentChoices(getTournamentRoot());
  } catch (error) {
    console.error("Could not build tournament choices:", error);
    return [];
  }
}

const command = new SlashCommandBuilder()
  .setName("tournament-results")
  .setDescription("Show the final standings of a finished tournament.")
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

module.exports.handleResultsPick = async (interaction) => {
  const root = getTournamentRoot();
  const chosen = ResolveTournament(root, interaction.values?.[0]);
  if (!chosen) {
    return interaction.reply({
      content: "That tournament is no longer available.",
      ephemeral: true,
    });
  }
  await interaction.deferUpdate();
  return interaction.editReply(render(root, chosen.name));
};
