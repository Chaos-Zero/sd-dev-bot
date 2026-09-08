const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require("discord.js");
const fs = require("fs");
const Fuse = require("fuse.js");

eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/utils/adminUtils.js") + "");

const {
  BuildTrackIndex,
  SummariseTrackRun,
  CountUserVotesForTrack,
  IsSameTrack,
  IsTournamentRunning,
  normaliseTitle,
  trackKey,
} = require("../../tournament/trackHistory.js");
const {
  RenderTrackProgression,
} = require("../../imageprocessing/bracketBuilder.js");
const {
  RenderFinalsBracket,
} = require("../../imageprocessing/finalsBracketBuilder.js");
const {
  BuildTrackBracketTree,
} = require("../../tournament/tournamentResults.js");
const {
  SafeUrl,
  SafeThumbnail,
  ExtractYoutubeId,
} = require("../../utils/embedSafety.js");
const {
  GetTournamentEntries,
  matchEntrantList,
} = require("../../utils/compatibilityStore.js");

// Asset host is configurable rather than baked in, so a dev instance can point
// somewhere else without editing source.
const ASSET_BASE =
  process.env.ASSET_BASE_URL || "http://91.99.239.6/files/assets";
const FALLBACK_THUMB = `${ASSET_BASE}/album_art.png`;
const FOOTER = {
  text: "Supradarky's VGM Club",
  iconURL: `${ASSET_BASE}/sd-img.png`,
};

const MAX_RESULTS = 25; // a select menu holds 25 options, and nobody pages past this
const SESSION_TTL_MS = 15 * 60 * 1000;

// Browsing state lives here rather than in the customId: Discord caps a
// customId at 100 characters, which a track title and a game name blow through
// on their own. Keyed by a short id, swept on a timer.
const sessions = new Map();

function newSession(userId, results, asBracket, canRepair) {
  const id = Math.random().toString(36).slice(2, 10);
  sessions.set(id, {
    userId,
    results,
    page: 0,
    // which way the run is drawn; kept on the session so paging to another
    // track or switching tournament stays in the view you chose
    asBracket: Boolean(asBracket),
    // whether to offer the repair button; re-checked on use, never trusted
    canRepair: Boolean(canRepair),
    // which tournament each track is currently showing, keyed by track
    chosen: new Map(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  sweepSessions();
  return id;
}

function sweepSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

// ---------------------------------------------------------------------------
// Index, cached between invocations
// ---------------------------------------------------------------------------

let indexCache = { signature: "", tracks: [], fuse: null };

function tournamentSignature(root) {
  return Object.keys(root || {})
    .map((key) => {
      const value = root[key];
      return Array.isArray(value?.matches) ? `${key}:${value.matches.length}` : "";
    })
    .filter(Boolean)
    .join("|");
}

function getTrackIndex(root) {
  const signature = tournamentSignature(root);
  if (indexCache.signature !== signature) {
    const tracks = BuildTrackIndex(root);
    indexCache = {
      signature,
      tracks,
      // threshold matches the other search commands in the bot
      fuse: new Fuse(tracks, {
        keys: [
          { name: "name", weight: 0.65 },
          { name: "title", weight: 0.35 },
        ],
        threshold: 0.3,
        ignoreLocation: true,
      }),
    };
  }
  return indexCache;
}

/**
 * Three tiers, best first: an exact title, then anything containing the query,
 * then the fuzzy net for typos. The middle tier matters -- searching "Hollow
 * Knight" should lead with the four tracks actually from it, not with whatever
 * the fuzzy scorer thinks is close ("Shovel Knight Dig" scores well against it).
 *
 * A query naming a game returns every track from it, which is the point of
 * being able to search by series.
 */
function searchTracks(root, query) {
  const { tracks, fuse } = getTrackIndex(root);
  const wanted = normaliseTitle(query);
  if (!wanted) return [];

  const exact = [];
  const contains = [];
  const seen = new Set();

  for (const track of tracks) {
    const name = normaliseTitle(track.name);
    const title = normaliseTitle(track.title);
    const key = trackKey(track);

    if (name === wanted || title === wanted) {
      exact.push(track);
      seen.add(key);
    } else if (name.includes(wanted) || title.includes(wanted)) {
      contains.push(track);
      seen.add(key);
    }
  }

  // a track named for its game reads better above one merely from it
  contains.sort((a, b) => {
    const an = normaliseTitle(a.name).includes(wanted) ? 0 : 1;
    const bn = normaliseTitle(b.name).includes(wanted) ? 0 : 1;
    return an - bn || a.name.localeCompare(b.name);
  });

  const fuzzy = [];
  for (const hit of fuse.search(query)) {
    const key = trackKey(hit.item);
    if (seen.has(key)) continue;
    seen.add(key);
    fuzzy.push(hit.item);
  }

  return exact.concat(contains, fuzzy).slice(0, MAX_RESULTS);
}

// ---------------------------------------------------------------------------
// Rendering one page
// ---------------------------------------------------------------------------

/** A track whose stored link cannot be opened. */
function hasBrokenLink(track) {
  return Boolean(track) && !SafeUrl(track.link);
}

/**
 * Point a track at a new URL everywhere it appears.
 *
 * The same song is stored separately in every match it played, across every
 * tournament, so a link fixed in one place would still be broken in the next
 * view. Rewrites the link and the derived videoId on each of them and reports
 * how many entries moved.
 */
function repairTrackLink(root, track, url) {
  const videoId = ExtractYoutubeId(url);
  let updated = 0;
  for (const { data } of GetTournamentEntries(root)) {
    for (const match of data.matches || []) {
      if (!match || typeof match !== "object") continue;
      for (const entrant of matchEntrantList(match)) {
        if (!IsSameTrack(entrant, track)) continue;
        entrant.link = url;
        // only overwrite the id when the new link actually carries one, so a
        // non-YouTube URL does not blank a working thumbnail
        if (videoId) entrant.videoId = videoId;
        updated += 1;
      }
    }
  }
  return { updated, videoId };
}

function youtubeThumb(track) {
  return SafeThumbnail(track.videoId, FALLBACK_THUMB);
}

function placementColour(summary) {
  if (!summary) return 0x4e5058;
  // A live contest gets its own colours before anything else is considered:
  // green while the track is still in it, grey once it is out, so the embed
  // never wears the gold of a result that has not happened.
  if (summary.isRunning) return summary.stillIn ? 0x3ba55d : 0x4e5058;
  if (summary.isChampion) return 0xfaa61a;
  if (summary.placement === "Runner-up") return 0xb5bac1;
  if (summary.placement === "3rd place") return 0xcd7f32;
  return 0x5865f2;
}

/**
 * The line under the embed: what is left of a contest that is still being
 * played. Says how many rounds a track still has in front of it when it is
 * still in, and otherwise only that the contest is not over -- a track that is
 * out has no rounds of its own left to count.
 */
function liveFooter(summary) {
  if (!summary || !summary.isRunning) return FOOTER;

  let note = "Tournament still running";
  if (summary.stillIn && summary.roundsRemaining) {
    const rounds =
      summary.roundsRemaining === 1
        ? "1 round left to play"
        : `${summary.roundsRemaining} rounds left to play`;
    note = `Still in · ${rounds} · ${summary.tracksRemaining} tracks left`;
  } else if (summary.stillIn) {
    note = "Tournament still running · this track is still in it";
  }

  return { text: `${note} · ${FOOTER.text}`, iconURL: FOOTER.iconURL };
}

/**
 * The same run drawn as a bracket rather than a list: one box per match, the
 * song along the top of each with the opponent beneath, and the same closing
 * sentence the list view uses.
 */
function renderAsBracket(tournament, tournamentName, track, summary) {
  const tree = BuildTrackBracketTree(tournament, summary.progression);
  if (!tree) return null;
  const facts = [
    tournamentName,
    summary.placement,
    `${summary.wins}W-${summary.losses}L`,
    `${summary.totalVotes} votes`,
  ].join("   ·   ");
  return RenderFinalsBracket({
    summary,
    tree,
    // a long run would otherwise run off the side of the image
    compact: summary.progression.length > 6,
    heading: { title: track.name, subtitle: track.title, facts },
    footer: summary.exit,
    highlight: (entrant) => IsSameTrack(entrant, track),
  });
}

function buildPage(root, session) {
  const track = session.results[session.page];
  const key = trackKey(track);
  const tournamentName =
    session.chosen.get(key) || track.tournaments[0];
  const tournament = root[tournamentName];
  const isRunning = IsTournamentRunning(
    tournament,
    tournamentName,
    root.currentTournament
  );
  const summary = SummariseTrackRun(tournament, track, { isRunning });

  const embed = new EmbedBuilder()
    .setTitle(track.name)
    // archived entrants sometimes carry a page title where the link should be,
    // and setURL throws on anything that is not a real URL
    .setURL(SafeUrl(track.link))
    .setColor(placementColour(summary))
    .setThumbnail(youtubeThumb(track))
    .setDescription(
      isRunning
        ? `_${tournamentName}_\n**This tournament is still running**.`
        : `_${tournamentName}_`
    )
    .setFooter(liveFooter(summary));

  if (track.title) {
    embed.setAuthor({ name: track.title.slice(0, 256) });
  }

  if (hasBrokenLink(track)) {
    embed.addFields({
      name: "Link unavailable",
      value: session.canRepair
        ? "The stored link for this track is not a working URL. Use the button below to replace it."
        : "The stored link for this track is not a working URL.",
    });
  }

  const files = [];
  if (summary) {
    embed.addFields(
      {
        name: summary.isRunning ? "Status" : "Finished",
        value: summary.placement,
        inline: true,
      },
      {
        name: "Record",
        value: `${summary.wins}W – ${summary.losses}L`,
        inline: true,
      },
      {
        name: "Votes",
        value: `${summary.totalVotes} (${summary.matches} matches)`,
        inline: true,
      }
    );

    // Second row: both of these can legitimately be missing -- a track that
    // never won has no best margin, and the caller may not have voted for it.
    const yourVotes = CountUserVotesForTrack(tournament, track, session.userId);
    if (summary.bestMargin > 0) {
      embed.addFields({
        name: "Biggest win",
        value: `by ${summary.bestMargin} votes`,
        inline: true,
      });
    }
    if (yourVotes > 0) {
      embed.addFields({
        name: "You voted for it",
        value: `${yourVotes} of ${summary.matches} matches`,
        inline: true,
      });
    }
    // Spelled out in the body as well as the footer: the footer is easy to miss
    // on mobile, and this is the one thing that stops a run being read as final.
    if (summary.isRunning) {
      embed.addFields({
        name: summary.stillIn ? "Still to come" : "Tournament in progress",
        value: summary.stillIn
          ? `${summary.exit} in **${tournamentName}**.`
          : `Knocked out in round ${summary.finishedAt}, but **${tournamentName}** is still being played.`,
      });
    }

    // a failed drawing should cost the picture, not the whole reply
    let png = null;
    try {
      png = session.asBracket
        ? renderAsBracket(tournament, tournamentName, track, summary)
        : RenderTrackProgression({ track, tournamentName, summary });
    } catch (error) {
      console.error(`Could not draw ${track.name} in ${tournamentName}:`, error);
    }
    if (png) {
      const fileName = `bracket-${session.page}-${Date.now()}.png`;
      files.push(new AttachmentBuilder(png, { name: fileName }));
      embed.setImage(`attachment://${fileName}`);
    }
  } else {
    embed.addFields({
      name: "No completed matches",
      value: isRunning
        ? "This track has not played a finished match in that tournament yet — it is still being played."
        : "This track has not played a scored match in that tournament yet.",
    });
  }

  return { embed, files, track, tournamentName };
}

function buildComponents(sessionId, session, track, tournamentName, running) {
  const rows = [];

  // Picking a track straight from the list beats stepping through it, and the
  // search caps at 25 results precisely so they all fit one menu.
  if (session.results.length > 1) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`track-history-track:${sessionId}`)
      .setPlaceholder(`${session.results.length} tracks: select one`)
      .addOptions(
        session.results.map((option, index) => ({
          label: option.name.slice(0, 100),
          description: (option.title || "").slice(0, 100) || undefined,
          value: String(index),
          default: index === session.page,
        }))
      );
    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  // Only worth a row when the track actually ran more than once.
  if (track.tournaments.length > 1) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`track-history-tournament:${sessionId}`)
      .setPlaceholder("Showing: " + tournamentName)
      .addOptions(
        track.tournaments.slice(0, 25).map((name) => ({
          label: name.slice(0, 100),
          // marked in the picker too, so a contest that is still being played
          // is obvious before it is opened
          description: running.has(name) ? "Still running" : undefined,
          value: name.slice(0, 100),
          default: name === tournamentName,
        }))
      );
    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  // Offered only to admins, and only when the stored link is unusable. The
  // check is repeated when the button is pressed and again on submit -- a
  // customId is client-supplied and proves nothing.
  if (session.canRepair && hasBrokenLink(track)) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`track-history-fixlink:${sessionId}:${session.page}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel("Fix broken link")
          .setEmoji("🔗")
      )
    );
  }

  return rows;
}

function renderSession(root, sessionId, session) {
  const { embed, files, track, tournamentName } = buildPage(root, session);
  return {
    embeds: [embed],
    files,
    components: buildComponents(
      sessionId,
      session,
      track,
      tournamentName,
      runningTournaments(root, track)
    ),
  };
}

/** Which of a track's tournaments are still being played. */
function runningTournaments(root, track) {
  const live = new Set();
  for (const name of track.tournaments) {
    if (IsTournamentRunning(root[name], name, root.currentTournament)) {
      live.add(name);
    }
  }
  return live;
}

function getTournamentRoot() {
  const db = GetDb();
  db.read();
  return db.get("tournaments").nth(0).value() || {};
}

// ---------------------------------------------------------------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-track-history")
    .setDescription(
      "Look up how a track or a game's tracks have done across every tournament."
    )
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("A track title or a game/series name.")
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("horizontal")
        .setDescription("Show a reduced bracket style instead of the full list.")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("make-public")
        .setDescription("Make the response viewable to the server.")
        .setRequired(false)
    ),

  async execute(interaction) {
    const isPublic = interaction.options.getBoolean("make-public") || false;
    await interaction.deferReply({ ephemeral: !isPublic });

    const query = interaction.options.getString("query");
    const root = getTournamentRoot();
    const results = searchTracks(root, query);

    if (!results.length) {
      return interaction.editReply({
        content: `Nothing matched **${query}**. Try a track title or the game it comes from.`,
      });
    }

    const sessionId = newSession(
      interaction.user.id,
      results,
      interaction.options.getBoolean("horizontal"),
      IsDomoAdmin(interaction)
    );
    const session = getSession(sessionId);
    return interaction.editReply(renderSession(root, sessionId, session));
  },
};

// ---------------------------------------------------------------------------
// Component handlers, routed from server.js
// ---------------------------------------------------------------------------

async function guardSession(interaction, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    await interaction.reply({
      content:
        "That search has expired. Run `/tournament-track-history` again to look it up.",
      ephemeral: true,
    });
    return null;
  }
  if (session.userId !== interaction.user.id) {
    await interaction.reply({
      content: "Sorry, these controls belong to whoever ran the command.",
      ephemeral: true,
    });
    return null;
  }
  return session;
}

module.exports.handleTrackHistoryTrack = async (interaction) => {
  const [, sessionId] = interaction.customId.split(":");
  const session = await guardSession(interaction, sessionId);
  if (!session) return;

  const picked = Number(interaction.values?.[0]);
  if (Number.isFinite(picked) && picked >= 0 && picked < session.results.length) {
    session.page = picked;
  }

  await interaction.deferUpdate();
  const root = getTournamentRoot();
  // attachments have to be cleared explicitly or the previous bracket lingers
  return interaction.editReply({
    ...renderSession(root, sessionId, session),
    attachments: [],
  });
};

module.exports.handleTrackHistoryTournament = async (interaction) => {
  const [, sessionId] = interaction.customId.split(":");
  const session = await guardSession(interaction, sessionId);
  if (!session) return;

  const track = session.results[session.page];
  const chosen = interaction.values?.[0];
  if (chosen && track.tournaments.includes(chosen)) {
    session.chosen.set(trackKey(track), chosen);
  }

  await interaction.deferUpdate();
  const root = getTournamentRoot();
  return interaction.editReply({
    ...renderSession(root, sessionId, session),
    attachments: [],
  });
};

// exported for tests and for the dev harness
module.exports.searchTracks = searchTracks;

module.exports.handleTrackHistoryFixLink = async (interaction) => {
  const [, sessionId, rawPage] = interaction.customId.split(":");
  const session = await guardSession(interaction, sessionId);
  if (!session) return;
  if (!IsDomoAdmin(interaction)) {
    return interaction.reply({
      content: "Only the server owner or Domo Admins can change a track's link.",
      ephemeral: true,
    });
  }

  const page = Number(rawPage);
  const track = session.results[Number.isFinite(page) ? page : session.page];
  if (!track) {
    return interaction.reply({
      content: "That track is no longer in this search.",
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`track-history-linkmodal:${sessionId}:${page}`)
    .setTitle("Replace track link")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("new_url")
          .setLabel(track.name.slice(0, 45))
          .setPlaceholder("https://youtu.be/...")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
  return interaction.showModal(modal);
};

module.exports.handleTrackHistoryLinkModal = async (interaction) => {
  const [, sessionId, rawPage] = interaction.customId.split(":");
  const session = getSession(sessionId);
  if (!session || session.userId !== interaction.user.id) {
    return interaction.reply({
      content: "That search has expired. Run the command again to retry.",
      ephemeral: true,
    });
  }
  if (!IsDomoAdmin(interaction)) {
    return interaction.reply({
      content: "Only the server owner or Domo Admins can change a track's link.",
      ephemeral: true,
    });
  }

  const url = SafeUrl(interaction.fields.getTextInputValue("new_url"));
  if (!url) {
    return interaction.reply({
      content: "That is not a usable link. It needs to start with http:// or https://.",
      ephemeral: true,
    });
  }

  const page = Number(rawPage);
  const track = session.results[Number.isFinite(page) ? page : session.page];
  if (!track) {
    return interaction.reply({
      content: "That track is no longer in this search.",
      ephemeral: true,
    });
  }

  await interaction.deferUpdate();

  const db = GetDb();
  db.read();
  const root = db.get("tournaments").nth(0).value() || {};
  const { updated, videoId } = repairTrackLink(root, track, url);
  if (!updated) {
    return interaction.followUp({
      content: "I could not find that track in the database to update.",
      ephemeral: true,
    });
  }
  db.write();

  // the search index caches by match counts, which a link edit does not change
  indexCache = { signature: "", tracks: [], fuse: null };
  track.link = url;
  if (videoId) track.videoId = videoId;

  await interaction.editReply({
    ...renderSession(getTournamentRoot(), sessionId, session),
    attachments: [],
  });
  return interaction.followUp({
    content: `Updated **${track.name}** in ${updated} match ${
      updated === 1 ? "entry" : "entries"
    }.`,
    ephemeral: true,
  });
};
