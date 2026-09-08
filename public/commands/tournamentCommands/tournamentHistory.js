const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");

const {
  BuildFinalsSummary,
  BuildBracketTree,
} = require("../../tournament/tournamentResults.js");
const {
  BuildTournamentChoices,
  ResolveTournament,
  BuildTournamentOptions,
} = require("../../tournament/resultsPicker.js");
const {
  RenderFinalsBracket,
} = require("../../imageprocessing/finalsBracketBuilder.js");
const {
  SafeThumbnail,
  SafeLink,
} = require("../../utils/embedSafety.js");

const ASSET_BASE =
  process.env.ASSET_BASE_URL || "http://91.99.239.6/files/assets";
const FOOTER = {
  text: "Supradarky's VGM Club",
  iconURL: `${ASSET_BASE}/sd-img.png`,
};
const FALLBACK_THUMB = `${ASSET_BASE}/album_art.png`;
const SELECT_ID = "tournament-history-pick";

// How far back the default view walks: the final, semis and quarters.
const FINALS_DEPTH = 2;

/** Who ran this, by id and by the name they show under in this server. */
function callerOf(interaction) {
  return {
    id: interaction.user.id,
    name: interaction.member?.displayName || interaction.user.username,
  };
}

function getTournamentRoot() {
  const db = GetDb();
  db.read();
  return db.get("tournaments").nth(0).value() || {};
}

function winnerThumb(summary) {
  return SafeThumbnail(summary?.podium?.winner?.videoId, FALLBACK_THUMB);
}

function render(root, tournamentName, full, viewerId, owner) {
  const tournament = root[tournamentName];
  const summary = BuildFinalsSummary(tournament, viewerId);
  if (!summary) {
    return { content: `No completed matches recorded for **${tournamentName}**.` };
  }
  const tree = BuildBracketTree(
    tournament,
    full ? undefined : FINALS_DEPTH,
    undefined,
    viewerId
  );

  const embed = new EmbedBuilder()
    .setTitle(tournamentName)
    .setColor(0xfaa61a)
    .setThumbnail(winnerThumb(summary))
    .setFooter(FOOTER);

  const winner = summary.podium.winner;
  // a broken link degrades to plain text rather than pointing at youtube.com
  embed.setDescription(
    winner
      ? `Won by **${SafeLink(winner.name, winner.link)}**${
          winner.title ? ` - _${winner.title}_` : ""
        }`
      : "_The final ended level, so the contest has no outright winner._"
  );

  const files = [];
  // a failed drawing should cost the picture, not the whole reply
  let png = null;
  try {
    png = RenderFinalsBracket({
      tournamentName,
      summary,
      tree,
      voterLabel: viewerId && owner ? owner.name : null,
      // the whole contest is drawn small: 64 first-round matches at readable
      // box sizes would run to thousands of pixels
      compact: Boolean(full),
      showVotes: Boolean(viewerId),
    });
  } catch (error) {
    console.error(`Could not draw the bracket for ${tournamentName}:`, error);
  }
  if (png) {
    const fileName = `bracket-${Date.now()}.png`;
    files.push(new AttachmentBuilder(png, { name: fileName }));
    embed.setImage(`attachment://${fileName}`);
  }

  const components = [];
  const options = BuildTournamentOptions(root, tournamentName);
  if (options.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            SELECT_ID +
              (full ? ":full" : ":finals") +
              (viewerId ? ":votes" : ":novotes") +
              ":" +
              (owner ? owner.id : "")
          )
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
  .setName("tournament-history")
  .setDescription("Show a finished tournament's bracket and how it was won.")
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
      .setName("full-bracket")
      .setDescription(
        "Draw the whole tournament rather than just the closing rounds."
      )
      .setRequired(false)
  )
  .addBooleanOption((option) =>
    option
      .setName("show-your-votes")
      .setDescription("Mark the tracks you voted for in blue.")
      .setRequired(false)
  )
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
    return interaction.editReply(
      render(
        root,
        chosen.name,
        interaction.options.getBoolean("full-bracket"),
        interaction.options.getBoolean("show-your-votes")
          ? interaction.user.id
          : null,
        callerOf(interaction)
      )
    );
  },
};

module.exports.handleHistoryPick = async (interaction) => {
  // the dropdown carries which view it was spawned from, so switching
  // tournament keeps you in the full bracket if that is what you were looking at
  const parts = interaction.customId.split(":");
  const full = parts.includes("full");
  // only a snowflake counts as an owner, so a message posted before this
  // segment existed stays usable instead of refusing everyone
  const last = parts[parts.length - 1] || "";
  const ownerId = /^\d{5,}$/.test(last) ? last : "";

  // A public reply is visible to everyone, but its controls are not theirs to
  // drive: one person's picks would otherwise rewrite the message under
  // everyone else. Point them at their own copy instead.
  if (ownerId && ownerId !== interaction.user.id) {
    return interaction.reply({
      content:
        "These controls belong to whoever ran the command. " +
        "Run your own copy with:\n```\n/tournament-history\n```",
      ephemeral: true,
    });
  }

  const viewerId = parts.includes("votes") ? interaction.user.id : null;
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
  return interaction.editReply({
    ...render(root, chosen.name, full, viewerId, callerOf(interaction)),
    attachments: [],
  });
};
