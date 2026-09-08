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
  BuildUserProfile,
  FindCompatibleUsers,
  FindBestRuns,
  MIN_MATCHES_FOR_COMPATIBILITY,
} = require("../../tournament/userProfile.js");
const {
  BuildFinalsSummary,
  BuildTrackBracketTree,
} = require("../../tournament/tournamentResults.js");
const {
  BuildTrackIndex,
  SummariseTrackRun,
  IsSameTrack,
  normaliseTitle,
} = require("../../tournament/trackHistory.js");
const {
  RenderFinalsBracket,
} = require("../../imageprocessing/finalsBracketBuilder.js");
const { SafeUrl, SafeThumbnail } = require("../../utils/embedSafety.js");

const ASSET_BASE =
  process.env.ASSET_BASE_URL || "http://91.99.239.6/files/assets";
const FALLBACK_THUMB = ASSET_BASE + "/album_art.png";
const FOOTER = {
  text: "Supradarky's VGM Club",
  iconURL: ASSET_BASE + "/sd-img.png",
};
const SELECT_ID = "my-profile-tournament";
const SESSION_TTL_MS = 15 * 60 * 1000;

// Browsing state, keyed by a short id: a track title and a game name together
// blow past Discord's 100-character customId limit.
const sessions = new Map();

function newSession(userId, targetId, track) {
  const id = Math.random().toString(36).slice(2, 10);
  sessions.set(id, {
    userId: userId,
    targetId: targetId,
    track: track,
    chosen: null,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  for (const [key, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(key);
  }
  return id;
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function getTournamentRoot() {
  const db = GetDb();
  db.read();
  return db.get("tournaments").nth(0).value() || {};
}

// ---------------------------------------------------------------------------
// The track index, cached the same way /tournament-track-history caches it
// ---------------------------------------------------------------------------

let indexCache = { signature: "", tracks: [] };

function trackIndex(root) {
  const signature = Object.keys(root || {})
    .map(function (key) {
      const value = root[key];
      return value && Array.isArray(value.matches)
        ? key + ":" + value.matches.length
        : "";
    })
    .filter(Boolean)
    .join("|");
  if (indexCache.signature !== signature) {
    indexCache = { signature: signature, tracks: BuildTrackIndex(root) };
  }
  return indexCache.tracks;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** The stable key an autocomplete choice carries back to execute(). */
function trackValue(track) {
  return normaliseTitle(track.name) + "|" + normaliseTitle(track.title);
}

function percent(value) {
  return Math.round(value * 100) + "%";
}

function nameOf(member, user) {
  return (member && member.displayName) || user.username;
}

function buildProfileEmbed(root, profile, info, compatible, bestRuns) {
  const embed = new EmbedBuilder()
    .setTitle(info.name + "'s tournament profile")
    .setColor(0xfaa61a)
    .setThumbnail(SafeUrl(info.avatarURL) || FALLBACK_THUMB)
    .setFooter(FOOTER);

  if (!profile.votes) {
    embed.setDescription(
      "_No votes recorded in any finished match yet._"
    );
    return embed;
  }

  embed.setDescription(
    "Backed the winner in **" +
      percent(profile.hitRate) +
      "** of the matches they voted in."
  );

  embed.addFields(
    { name: "Hits", value: String(profile.hits), inline: true },
    { name: "Misses", value: String(profile.misses), inline: true },
    {
      name: "Votes cast",
      value: String(profile.votes),
      inline: true,
    },
    {
      name: "Tournaments",
      value: String(profile.tournaments),
      inline: true,
    }
  );

  const best = profile.perTournament
    .slice()
    .sort(function (a, b) {
      return b.hitRate - a.hitRate || b.votes - a.votes;
    })[0];
  if (best) {
    embed.addFields({
      name: "Sharpest contest",
      value:
        best.name + " — " + percent(best.hitRate) + " over " + best.votes + " votes",
      inline: false,
    });
  }

  if (bestRuns.length) {
    embed.addFields({
      name: "Best runs backed",
      value: bestRuns
        .map(function (run) {
          const label = SafeUrl(run.link)
            ? "[" + run.name + "](" + SafeUrl(run.link) + ")"
            : run.name;
          return "**" + run.placement + "** · " + label + " _(" + run.tournament + ")_";
        })
        .join("\n"),
      inline: false,
    });
  }

  // Left off entirely below the threshold rather than naming a "closest match"
  // from a handful of ballots.
  if (!profile.enoughForCompatibility) {
    embed.addFields({
      name: "Closest voters",
      value:
        "Needs more than " +
        MIN_MATCHES_FOR_COMPATIBILITY +
        " matches voted in before this means anything.",
      inline: false,
    });
  } else if (compatible.length) {
    embed.addFields({
      name: "Closest voters",
      value: compatible
        .map(function (row) {
          return (
            "<@" +
            row.userId +
            "> — **" +
            row.percent +
            "%** across " +
            row.shared +
            " shared matches"
          );
        })
        .join("\n"),
      inline: false,
    });
  }

  return embed;
}

/**
 * One track's run drawn horizontally, with the caller's own votes picked out.
 * The same renderer /tournament-track-history uses, so the two agree.
 */
function buildTrackView(root, session) {
  const track = session.track;
  const tournamentName = session.chosen || track.tournaments[0];
  const tournament = root[tournamentName];
  const summary = SummariseTrackRun(tournament, track);
  if (!summary) return null;

  const tree = BuildTrackBracketTree(
    tournament,
    summary.progression,
    session.targetId
  );
  if (!tree) return null;

  const facts = [
    tournamentName,
    summary.placement,
    summary.wins + "W-" + summary.losses + "L",
    summary.totalVotes + " votes",
  ].join("   ·   ");

  return RenderFinalsBracket({
    summary: summary,
    tree: tree,
    compact: summary.progression.length > 6,
    heading: { title: track.name, subtitle: track.title, facts: facts },
    footer: summary.exit,
    highlight: function (entrant) {
      return IsSameTrack(entrant, track);
    },
    showVotes: true,
    voterLabel: session.voterLabel,
  });
}

function renderSession(root, sessionId, session, info) {
  const track = session.track;
  const tournamentName = session.chosen || track.tournaments[0];
  const votes = session.votesByTournament[tournamentName] || 0;

  const embed = new EmbedBuilder()
    .setTitle(track.name)
    .setURL(SafeUrl(track.link))
    .setColor(0x57c7ff)
    .setThumbnail(SafeThumbnail(track.videoId, FALLBACK_THUMB))
    .setDescription(
      (track.title ? "**" + track.title + "**\n" : "") +
        "_" +
        tournamentName +
        "_"
    )
    .setAuthor({ name: info.name + "'s votes" })
    .addFields({
      name: "You voted for it",
      value: votes
        ? votes + " time" + (votes === 1 ? "" : "s") + " in this tournament"
        : "Not in this tournament",
      inline: true,
    })
    .setFooter(FOOTER);

  const files = [];
  let png = null;
  try {
    png = buildTrackView(root, session);
  } catch (error) {
    console.error("Could not draw " + track.name + ":", error);
  }
  if (png) {
    const fileName = "profile-" + Date.now() + ".png";
    files.push(new AttachmentBuilder(png, { name: fileName }));
    embed.setImage("attachment://" + fileName);
  }

  const components = [];
  if (track.tournaments.length > 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(SELECT_ID + ":" + sessionId)
          .setPlaceholder("Showing: " + tournamentName)
          .addOptions(
            track.tournaments.slice(0, 25).map(function (name) {
              return {
                label: name.slice(0, 100),
                value: name.slice(0, 100),
                default: name === tournamentName,
              };
            })
          )
      )
    );
  }

  return { embeds: [embed], files: files, components: components };
}

// ---------------------------------------------------------------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-my-profile")
    .setDescription("Your voting record across every tournament.")
    .addUserOption(function (option) {
      return option
        .setName("member")
        .setDescription("Show someone else's profile instead.")
        .setRequired(false);
    })
    .addStringOption(function (option) {
      return option
        .setName("track")
        .setDescription("See how you voted on a particular track.")
        .setAutocomplete(true)
        .setRequired(false);
    })
    .addBooleanOption(function (option) {
      return option
        .setName("make-public")
        .setDescription("Make the response viewable to the server.")
        .setRequired(false);
    }),

  async execute(interaction) {
    const isPublic = interaction.options.getBoolean("make-public") || false;
    await interaction.deferReply({ ephemeral: !isPublic });

    const target = interaction.options.getUser("member") || interaction.user;
    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(function () {
        return null;
      });
    const info = {
      name: nameOf(member, target),
      avatarURL: target.displayAvatarURL({ size: 256 }),
    };

    const root = getTournamentRoot();
    const profile = BuildUserProfile(root, target.id);
    const wanted = interaction.options.getString("track");

    if (wanted) {
      // Matched on prefix, not equality: Discord caps an autocomplete value at
      // 100 characters and one track's key runs to 162, so the value the client
      // sends back can be a truncation of the real one. No two keys collide in
      // their first 100 characters, so the prefix still identifies one track.
      const track = trackIndex(root).find(function (candidate) {
        return trackValue(candidate).indexOf(wanted) === 0;
      });
      if (!track) {
        return interaction.editReply({
          content: "I could not find that track. Pick one from the suggestions.",
        });
      }

      const votesByTournament = {};
      for (const backed of profile.backed) {
        if (!IsSameTrack(backed, track)) continue;
        votesByTournament[backed.tournament] =
          (votesByTournament[backed.tournament] || 0) + backed.votes;
      }

      const sessionId = newSession(interaction.user.id, target.id, track);
      const session = getSession(sessionId);
      session.votesByTournament = votesByTournament;
      session.voterLabel = info.name;
      return interaction.editReply(
        renderSession(root, sessionId, session, info)
      );
    }

    const compatible = FindCompatibleUsers(LoadCompatibilityDb(), profile, {
      limit: 3,
      isMember: function (id) {
        return interaction.guild.members.cache.has(id);
      },
    });
    const bestRuns = FindBestRuns(root, profile, BuildFinalsSummary);

    return interaction.editReply({
      embeds: [buildProfileEmbed(root, profile, info, compatible, bestRuns)],
    });
  },

  async autocomplete(interaction) {
    const typed = (interaction.options.getFocused() || "").trim();
    const root = getTournamentRoot();
    const tracks = trackIndex(root);
    const wanted = normaliseTitle(typed);

    const matches = [];
    for (const track of tracks) {
      if (matches.length >= 25) break;
      if (
        wanted &&
        normaliseTitle(track.name).indexOf(wanted) === -1 &&
        normaliseTitle(track.title).indexOf(wanted) === -1
      ) {
        continue;
      }
      matches.push({
        name: (track.name + (track.title ? " — " + track.title : "")).slice(0, 100),
        // truncated to Discord's limit; execute() matches on prefix
        value: trackValue(track).slice(0, 100),
      });
    }
    return interaction.respond(matches);
  },
};

module.exports.handleProfileTournament = async (interaction) => {
  const sessionId = interaction.customId.split(":")[1];
  const session = getSession(sessionId);
  if (!session) {
    return interaction.reply({
      content:
        "That lookup has expired. Run your own copy with:\n```\n/tournament-my-profile\n```",
      ephemeral: true,
    });
  }
  if (session.userId !== interaction.user.id) {
    return interaction.reply({
      content:
        "These controls belong to whoever ran the command. " +
        "Run your own copy with:\n```\n/tournament-my-profile\n```",
      ephemeral: true,
    });
  }

  const chosen = interaction.values && interaction.values[0];
  if (chosen && session.track.tournaments.indexOf(chosen) !== -1) {
    session.chosen = chosen;
  }

  await interaction.deferUpdate();
  const root = getTournamentRoot();
  const info = { name: session.voterLabel, avatarURL: null };
  return interaction.editReply(
    Object.assign(renderSession(root, sessionId, session, info), {
      attachments: [],
    })
  );
};
