const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");

const {
  BuildUserProfile,
  FindCompatibleUsers,
  FindMostBacked,
  MIN_MATCHES_FOR_COMPATIBILITY,
  MIN_MATCHES_FOR_RATE,
} = require("../../tournament/userProfile.js");
const { SafeUrl } = require("../../utils/embedSafety.js");

const ASSET_BASE =
  process.env.ASSET_BASE_URL || "http://91.99.239.6/files/assets";
const FALLBACK_THUMB = ASSET_BASE + "/album_art.png";
const FOOTER = {
  text: "Supradarky's VGM Club",
  iconURL: ASSET_BASE + "/sd-img.png",
};
function getTournamentRoot() {
  const db = GetDb();
  db.read();
  return db.get("tournaments").nth(0).value() || {};
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function percent(value) {
  return Math.round(value * 100) + "%";
}

function nameOf(member, user) {
  return (member && member.displayName) || user.username;
}

function buildProfileEmbed(profile, info, compatible, mostBacked) {
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

  const contests =
    profile.tournaments === 1 ? "1 tournament" : profile.tournaments + " tournaments";

  // A percentage off a couple of ballots reads as fact but is not one, so it is
  // withheld until there is enough behind it. The counts are shown regardless.
  embed.setDescription(
    profile.enoughForRate
      ? "Backed winners in **" +
          percent(profile.hitRate) +
          "** of matches, in " +
          contests +
          "."
      : "Voted in " +
          contests +
          ". _Needs " +
          MIN_MATCHES_FOR_RATE +
          " matches before a success rate is worth quoting._"
  );

  embed.addFields(
    { name: "Hits", value: String(profile.hits), inline: true },
    { name: "Misses", value: String(profile.misses), inline: true },
    {
      name: "Votes cast",
      value: String(profile.votes),
      inline: true,
    }
  );

  const best = profile.perTournament
    .slice()
    .sort(function (a, b) {
      return b.hitRate - a.hitRate || b.votes - a.votes;
    })[0];
  if (best && profile.enoughForRate) {
    embed.addFields({
      name: "Best tournament run",
      value:
        best.name + " - " + percent(best.hitRate) + " over " + best.votes + " votes",
      inline: false,
    });
  }

  if (mostBacked.length) {
    embed.addFields({
      name: "Supported longest",
      value: mostBacked
        .map(function (row) {
          const label = SafeUrl(row.link)
            ? "[" + row.name + "](" + SafeUrl(row.link) + ")"
            : row.name;
          return (
            "*" +
            row.tournament +
            "*\n" +
            label +
            " - **" +
            Math.round(row.share * 100) +
            "%** of its run (" +
            row.votes +
            "/" +
            row.appearances +
            ")"
          );
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
            "> - **" +
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

// ---------------------------------------------------------------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-my-profile")
    .setDescription("Your voting record across every tournament.")
    .addBooleanOption(function (option) {
      return option
        .setName("make-public")
        .setDescription("Make the response viewable to the server.")
        .setRequired(false);
    }),

  async execute(interaction) {
    const isPublic = interaction.options.getBoolean("make-public") || false;
    await interaction.deferReply({ ephemeral: !isPublic });

    // A member's own record only: a voting history is theirs to share, not
    // something anyone can pull up about someone else.
    const target = interaction.user;
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

    const compatible = FindCompatibleUsers(LoadCompatibilityDb(), profile, {
      limit: 3,
      // only members this server can still resolve, so the result never names
      // someone who has left
      isMember: function (id) {
        return interaction.guild.members.cache.has(id);
      },
    });
    const mostBacked = FindMostBacked(profile, 4);

    return interaction.editReply({
      embeds: [buildProfileEmbed(profile, info, compatible, mostBacked)],
    });
  },
};
