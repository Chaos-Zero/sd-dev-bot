const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const Discord = require("discord.js");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/utils/compatibilityStore.js") + "");
eval(
  fs.readFileSync("./public/tournament/triple/slashCommandFunctions.js") + ""
);
eval(
  fs.readFileSync("./public/tournament/doubleElim/slashCommandFunctions.js") +
    ""
);

const loadingEmbed = new EmbedBuilder().setImage(
  "http://91.99.239.6/files/assets/Domo_load.gif"
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-most-compatible")
    .setDescription(
      "Find that other person who shares the most compatible votes with you in a tournament!"
    )
    .addBooleanOption((option) =>
      option
        .setName("make-public")
        .setDescription("Make the response viewable to the server.")
        .setRequired(false)
    )
    .addNumberOption((option) =>
      option
        .setName("specify-participation-percentage")
        .setDescription(
          "Allows users to specify minimum percent of engagement in the same battles. Default: 25%"
        )
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("search-all-tournaments")
        .setDescription("Include all tournaments when calculating compatibility.")
        .setRequired(false)
    ),

  async execute(interaction) {
    var db = GetDb();
    db.read();

    let tournamentDetails = db.get("tournaments").nth(0).value() || {};
    let tournamentName = await db
      .get("tournaments[0].currentTournament")
      .value();
    let tournamentDb = tournamentDetails[tournamentName];
    const searchAll =
      interaction.options.getBoolean("search-all-tournaments") || false;

    const isPublic = interaction.options.getBoolean("make-public") || false;
    const userPercent =
      interaction.options.getNumber("specify-participation-percentage") || 25;

    const compatibilityDb = LoadCompatibilityDb();

    if (!searchAll && (!tournamentName || tournamentName === "N/A" || !tournamentDb)) {
      const latestTournament = getLatestTournamentWithCompat(
        tournamentDetails,
        compatibilityDb
      ) || GetLatestTournamentEntry(tournamentDetails);
      if (latestTournament) {
        tournamentName = latestTournament.name;
        tournamentDb = latestTournament.data;
      } else {
        return interaction
          .reply({
            content: "There are no tournaments available to check.",
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      }
    }

    if (
      userPercent > 100 ||
      userPercent < 5 ||
      parseInt(userPercent) == "NaN"
    ) {
      return interaction.reply({
        content: "Please enter a number between 5 - 100 for the percentage",
        ephemeral: true,
      });
    }
    if (!isPublic) {
      await interaction.reply({
        content: "Calculating compatibility...",
        embeds: [loadingEmbed],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "Calculating compatibility...",
        embeds: [loadingEmbed],
      });
    }

    await sleep(1000);

    var guild = interaction.member.guild;
    var guildUsers = await guild.members.cache;

    var userResults = [];
    // The buckets actually scored, so the footnote below can look for standouts
    // in the same data the headline came from.
    var scoredStores = [];

    if (searchAll) {
      tournamentName = "All Tournaments";
      const globalSingle = compatibilityDb.global?.singleDouble;
      const globalTriple = compatibilityDb.global?.triple;

      if (globalSingle?.totalMatches >= 10) {
        userResults = mergeCompatibilityResults(
          userResults,
          getTopCompatibilityFromStore(
            globalSingle,
            interaction.user.id,
            guildUsers,
            userPercent,
            "Single Elimination",
            globalSingle.totalMatches
          )
        );
        scoredStores.push({ store: globalSingle, format: "Single Elimination" });
      }

      if (globalTriple?.totalMatches >= 10) {
        userResults = mergeCompatibilityResults(
          userResults,
          getTopCompatibilityFromStore(
            globalTriple,
            interaction.user.id,
            guildUsers,
            userPercent,
            "3v3 Ranked",
            globalTriple.totalMatches
          )
        );
        scoredStores.push({ store: globalTriple, format: "3v3 Ranked" });
      }
      if (userResults.length < 1) {
        const userSingleMatches =
          globalSingle?.userMatchCounts?.[interaction.user.id] || 0;
        const userTripleMatches =
          globalTriple?.userMatchCounts?.[interaction.user.id] || 0;
        const totalUserMatches = userSingleMatches + userTripleMatches;
        return interaction.editReply({
          content:
            totalUserMatches > 0
              ? "There does not seem to be anyone who meets the set requirements.\nPlease reduce the percentage of matches played together."
              : "No compatibility data found for your votes yet.",
          embeds: [],
        });
      }
    } else {
      let tournamentCompat = compatibilityDb.tournaments?.[tournamentName];
      if (!tournamentCompat) {
        const latestTournament = getLatestTournamentWithCompat(
          tournamentDetails,
          compatibilityDb
        ) || GetLatestTournamentEntry(tournamentDetails);
        if (latestTournament) {
          tournamentName = latestTournament.name;
          tournamentDb = latestTournament.data;
          tournamentCompat = compatibilityDb.tournaments?.[tournamentName];
        }
      }
      if (!tournamentCompat) {
        return interaction.editReply({
          content:
            "Compatibility data isn't available yet. Run the backfill to generate it.",
          embeds: [],
        });
      }

      if ((tournamentCompat.totalMatches || 0) < 10) {
        return interaction.editReply({
          content:
            "It appears there have not been enough matches in this tournament to run this command.",
          embeds: [],
        });
      }

      userResults = getTopCompatibilityFromStore(
        tournamentCompat,
        interaction.user.id,
        guildUsers,
        userPercent,
        tournamentCompat.format || tournamentDb.tournamentFormat,
        tournamentCompat.totalMatches || 0
      );
      scoredStores.push({
        store: tournamentCompat,
        format: tournamentCompat.format || tournamentDb.tournamentFormat,
      });
      if (userResults.length < 1) {
        const userMatchCount =
          tournamentCompat.userMatchCounts?.[interaction.user.id] || 0;
        return interaction.editReply({
          content:
            userMatchCount > 0
              ? "There does not seem to be anyone who meets the set requirements.\nPlease reduce the percentage of matches played together."
              : "No compatibility data found for your votes yet.",
          embeds: [],
        });
      }
    }

    if (userResults.length < 1) {
      return interaction.editReply({
        content:
          "There does not seem to be anyone who meets the set requirements.\nPlease reduce the percentage of matches played together.",
        embeds: [],
      });
    }
    // Smoothing keeps a thin pairing off the top spot on purpose, but if one
    // still scores higher outright it is worth saying so instead of hiding it.
    const headlineRaw = Math.max(
      ...userResults.map((r) =>
        r.rawPercent === undefined ? r.userCompatPercent : r.rawPercent
      )
    );
    let thinStandout = null;
    for (const scored of scoredStores) {
      const candidate = getThinStandout(
        scored.store,
        interaction.user.id,
        guildUsers,
        scored.format,
        headlineRaw
      );
      if (
        candidate &&
        (!thinStandout || candidate.rawPercent > thinStandout.rawPercent)
      ) {
        thinStandout = candidate;
      }
    }
    if (thinStandout) {
      const standoutInfo = await getUserInfoFromId(
        interaction.guild,
        thinStandout.voter
      );
      thinStandout.username = standoutInfo?.username || null;
    }

    //console.log("We got here")
    let embeds = await PopulateEmbeds(
      userResults,
      interaction,
      tournamentName,
      tournamentDb,
      thinStandout
    );

    if (!isPublic) {
      return await interaction
        .editReply({
          content: null,
          //content: "Score attained: " + userResults.totalWeight  + "\nMax Score possible: " + userResults.maxScore + "\nTracks checked: " + userResults.iterations,
          embeds: embeds,
          ephemeral: true,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
    } else {
      return await interaction
        .editReply({
          content: null,
          //content: "Score attained: " + userResults.totalWeight  + "\nMax Score possible: " + userResults.maxScore + "\nTracks checked: " + userResults.iterations,
          embeds: embeds,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
    }
  },
};

async function PopulateEmbeds(
  userResults,
  interaction,
  tournamentName,
  tournamentDb,
  thinStandout
) {
  var embeds = [];
  for (var result of userResults) {
    let colour = 0x0047ab;
    if (result.userCompatPercent >= 90) {
      colour = 0xff69b4;
    } else if (result.userCompatPercent > 74 && result.userCompatPercent < 90) {
      colour = 0xffd700;
    } else if (result.userCompatPercent > 49 && result.userCompatPercent < 75) {
      colour = 0xc0c0c0;
    }
    result.colour = colour;
    var embed = await PopulateEmbedData(
      interaction,
      result,
      tournamentName,
      tournamentDb
    );
    applyThinStandoutFooter(embed, thinStandout);
    embeds.push(embed);
  }
  return embeds;
}

/**
 * Note the higher-scoring but barely-shared pairing under the result, so the
 * headline stays trustworthy without quietly dropping the more eye-catching
 * number on the floor.
 */
function applyThinStandoutFooter(embed, thinStandout) {
  if (!embed || !thinStandout || !thinStandout.username) {
    return embed;
  }
  const matches =
    thinStandout.sharedMatches === 1
      ? "1 shared match"
      : String(thinStandout.sharedMatches) + " shared matches";
  return embed.setFooter({
    text:
      thinStandout.username +
      " scores higher at " +
      thinStandout.rawPercent +
      "%, but only across " +
      matches +
      "\nSupradarky's VGM Club",
    iconURL: "http://91.99.239.6/files/assets/sd-img.png",
  });
}

async function PopulateEmbedData(
  interaction,
  result,
  tournamentName,
  tournamentDb
) {
  return new Promise((resolve) => {
    getUserInfoFromId(interaction.guild, result.voter).then((userInfo) => {
      var embed = "";
      const format =
        result.tournamentFormat ||
        tournamentDb?.tournamentFormat ||
        "Single Elimination";
      if (format == "3v3 Ranked") {
        embed = CreateTripleHighestCompatDiscordEmbed(
          result,
          userInfo,
          result.colour,
          tournamentName
        );
      } else {
        embed = CreateDoubleHighestCompatDiscordEmbed(
          result,
          userInfo,
          result.colour,
          tournamentName
        );
      }
      resolve(embed);
    });
  });
}

/**
 * The most recent tournament that has compatibility data precomputed for it.
 * Walks newest first, so a contest that has not been backfilled yet is skipped
 * in favour of the next most recent one rather than the oldest on record.
 */
function getLatestTournamentWithCompat(tournamentDetails, compatibilityDb) {
  for (const candidate of GetTournamentEntriesNewestFirst(tournamentDetails)) {
    if (compatibilityDb?.tournaments?.[candidate.name]) {
      return candidate;
    }
  }
  return null;
}

function mergeCompatibilityResults(existingResults, nextResults) {
  if (!Array.isArray(nextResults) || nextResults.length < 1) {
    return existingResults;
  }
  const byVoter = new Map();
  for (const result of existingResults) {
    byVoter.set(result.voter, result);
  }
  for (const result of nextResults) {
    const current = byVoter.get(result.voter);
    if (!current) {
      byVoter.set(result.voter, result);
      continue;
    }
    if (result.userCompatPercent > current.userCompatPercent) {
      byVoter.set(result.voter, result);
    } else if (
      result.userCompatPercent === current.userCompatPercent &&
      result.iterations > current.iterations
    ) {
      byVoter.set(result.voter, result);
    }
  }
  return Array.from(byVoter.values()).sort(
    (a, b) => b.userCompatPercent - a.userCompatPercent
  );
}

function getTopCompatibilityFromStore(
  store,
  userId,
  guildUsers,
  userPercent,
  tournamentFormat,
  totalMatches
) {
  if (!store || !store.users) {
    return [];
  }

  const kind = tournamentFormat == "3v3 Ranked" ? "ranked" : "flat";
  const baseline = GetBaselineRate(store, kind);
  const userPairs = store.users[userId] || {};
  const userMatchCount = store.userMatchCounts?.[userId] || 0;
  let highestValue = Number.NEGATIVE_INFINITY;
  let topCompatibility = [];

  for (const [otherId, stats] of Object.entries(userPairs)) {
    if (otherId === userId || !guildUsers.has(otherId)) {
      continue;
    }

    const shared = GetPairSharedMatches(stats, kind);
    if (
      userMatchCount > 0 &&
      (shared / userMatchCount) * 100 < Math.ceil(userPercent)
    ) {
      continue;
    }

    // Ranked on the smoothed rate, so a pair who shared two matches cannot
    // outrank a pair who shared a season. The raw rate rides along for the
    // footnote, which is the only place it is still worth showing.
    const userCompatPercent = Math.ceil(
      GetPairShrunkRate(stats, kind, baseline) * 100
    );
    const rawPercent = Math.ceil(GetPairRawRate(stats, kind) * 100);

    const result =
      kind === "ranked"
        ? {
            voter: otherId,
            totalWeight: stats.totalWeight || 0,
            firstWeight: stats.firstWeight || 0,
            secondWeight: stats.secondWeight || 0,
            partialMatch: stats.partialMatch || 0,
            maxWeight: stats.maxWeight || 0,
            iterations: totalMatches || 0,
            disagreementWeight: stats.disagreementWeight || 0,
            matchCount: shared,
            userCompatPercent,
            rawPercent,
            sharedMatches: shared,
            tournamentFormat: "3v3 Ranked",
          }
        : {
            voter: otherId,
            totalWeight: stats.matched || 0,
            maxWeight: totalMatches || 0,
            iterations: shared,
            userCompatPercent,
            rawPercent,
            sharedMatches: shared,
            tournamentFormat,
          };

    if (userCompatPercent > highestValue) {
      highestValue = userCompatPercent;
      topCompatibility = [result];
    } else if (userCompatPercent === highestValue) {
      topCompatibility.push(result);
    }
  }

  return topCompatibility;
}

// Overlap below this share of your own votes is too thin to headline, but a
// standout there is still worth a mention.
const THIN_OVERLAP_PERCENT = 33;

// ...provided it rests on more than a coincidence. Agreeing twice is not a
// finding, and two thirds of the standouts sat at one or two shared matches,
// which would have made the note read as boilerplate rather than a highlight.
const STANDOUT_MIN_MATCHES = 3;

/**
 * The best score among partners you have barely voted alongside. Smoothing
 * deliberately keeps these off the top spot, but a 100% across four matches is
 * the sort of thing people want to know about, so it goes in the footer rather
 * than being buried.
 */
function getThinStandout(
  store,
  userId,
  guildUsers,
  tournamentFormat,
  headlineRawPercent
) {
  if (!store || !store.users) {
    return null;
  }
  const kind = tournamentFormat == "3v3 Ranked" ? "ranked" : "flat";
  const userPairs = store.users[userId] || {};
  const userMatchCount = store.userMatchCounts?.[userId] || 0;
  if (userMatchCount < 1) {
    return null;
  }

  let best = null;
  for (const [otherId, stats] of Object.entries(userPairs)) {
    if (otherId === userId || !guildUsers.has(otherId)) {
      continue;
    }
    const shared = GetPairSharedMatches(stats, kind);
    if (shared < STANDOUT_MIN_MATCHES) {
      continue;
    }
    if ((shared / userMatchCount) * 100 >= THIN_OVERLAP_PERCENT) {
      continue;
    }
    const rawPercent = Math.ceil(GetPairRawRate(stats, kind) * 100);
    if (rawPercent <= headlineRawPercent) {
      continue;
    }
    if (!best || rawPercent > best.rawPercent || (rawPercent === best.rawPercent && shared > best.sharedMatches)) {
      best = { voter: otherId, rawPercent, sharedMatches: shared };
    }
  }
  return best;
}

async function getUserInfoFromId(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    const user = member.user;

    // console.log(user.username);
    return {
      username: member.displayName,
      avatarURL: user.displayAvatarURL({
        format: "png",
        dynamic: true,
        size: 1024,
      }),
    };
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}
