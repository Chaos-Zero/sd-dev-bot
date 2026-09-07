const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require("discord.js");
const fs = require("fs");
const Fuse = require("fuse.js");

eval(fs.readFileSync("./public/main.js") + "");

const {
  BuildTrackIndex,
  SummariseTrackRun,
  CountUserVotesForTrack,
  IsTournamentRunning,
  normaliseTitle,
  trackKey,
} = require("../../tournament/trackHistory.js");
const {
  RenderTrackProgression,
} = require("../../imageprocessing/bracketBuilder.js");

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

function newSession(userId, results) {
  const id = Math.random().toString(36).slice(2, 10);
  sessions.set(id, {
    userId,
    results,
    page: 0,
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

function youtubeThumb(track) {
  return track.videoId
    ? `https://i1.ytimg.com/vi/${track.videoId}/mqdefault.jpg`
    : FALLBACK_THUMB;
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
    .setURL(track.link || null)
    .setColor(placementColour(summary))
    .setThumbnail(youtubeThumb(track))
    .setDescription(
      isRunning
        ? `_${tournamentName}_\n🔴 **This tournament is still running** — the run so far, up to the last finished match.`
        : `_${tournamentName}_`
    )
    .setFooter(liveFooter(summary));

  if (track.title) {
    embed.setAuthor({ name: track.title.slice(0, 256) });
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

    const png = RenderTrackProgression({
      track,
      tournamentName,
      summary,
    });
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

    const sessionId = newSession(interaction.user.id, results);
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
