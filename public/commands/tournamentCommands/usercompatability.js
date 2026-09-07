const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const Discord = require("discord.js");

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-user-compatibility")
    .setDescription(
      "Compare yourself and another user to see how compatible your votes have been"
    )
    .addUserOption((option) =>
      option
        .setName("other-member")
        .setDescription("The user you want to compare with.")
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("make-public")
        .setDescription("Make the response viewable to the server.")
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

    const checkingUser = interaction.user.id;
    const selectedUser = interaction.options.getUser("other-member");
    const isPublic = interaction.options.getBoolean("make-public") || false;
    const searchAll =
      interaction.options.getBoolean("search-all-tournaments") || false;
    const userId = selectedUser?.id;

    //await interaction.reply({
    //  content: "Testing in the backend",
    //});
    if (!searchAll && (!tournamentName || tournamentName === "N/A" || !tournamentDb)) {
      const latestTournament = GetLatestTournamentEntry(tournamentDetails);
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

    const embeds = [];
    const userInfo = await getUserInfoFromId(interaction.guild, userId);
    if (!userInfo) {
      return interaction.reply({
        content: "Unable to fetch user info for the specified member.",
        ephemeral: true,
      });
    }

    if (userId === checkingUser) {
      if (searchAll) {
        const allEmbeds = buildSelfWinnerRateEmbedsForAllTournaments(
          tournamentDetails,
          checkingUser,
          userInfo
        );
        if (allEmbeds.length < 1) {
          return interaction.reply({
            content: "No voting data found for your votes yet.",
            ephemeral: true,
          });
        }
        if (!isPublic) {
          return interaction
            .reply({
              embeds: allEmbeds,
              ephemeral: true,
            })
            .then(() => console.log("Reply sent."))
            .catch((_) => null);
        }
        return interaction
          .reply({
            embeds: allEmbeds,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      }

      const selfEmbed = buildSelfWinnerRateEmbedForTournament(
        tournamentName,
        tournamentDb,
        checkingUser,
        userInfo
      );
      if (!selfEmbed) {
        return interaction.reply({
          content:
            "It appears you have not voted in any completed matches for this tournament yet.",
          ephemeral: true,
        });
      }

      if (!isPublic) {
        return interaction
          .reply({
            embeds: [selfEmbed],
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      }
      return interaction
        .reply({
          embeds: [selfEmbed],
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
    }

    const compatibilityDb = LoadCompatibilityDb();

    if (searchAll) {
      const globalSingle = compatibilityDb.global?.singleDouble;
      const globalTriple = compatibilityDb.global?.triple;

      const tripleEmbed = buildCompatibilityEmbedFromStore(
        globalTriple,
        checkingUser,
        userId,
        userInfo,
        "All Tournaments - 3v3 Ranked",
        "3v3 Ranked"
      );
      if (tripleEmbed) {
        embeds.push(tripleEmbed);
      }

      const nonTripleEmbed = buildCompatibilityEmbedFromStore(
        globalSingle,
        checkingUser,
        userId,
        userInfo,
        "All Tournaments - Single/Double Elimination",
        "Single/Double Elimination"
      );
      if (nonTripleEmbed) {
        embeds.push(nonTripleEmbed);
      }

      if (embeds.length < 1) {
        return interaction
          .reply({
            content:
              "It appears there have not been enough matches in past tournaments to run this command.",
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      }
    } else {
      let tournamentCompat = compatibilityDb.tournaments?.[tournamentName];
      if (!tournamentCompat) {
        const latestTournament = GetLatestTournamentEntry(tournamentDetails);
        if (latestTournament) {
          tournamentName = latestTournament.name;
          tournamentDb = latestTournament.data;
          tournamentCompat = compatibilityDb.tournaments?.[tournamentName];
        }
      }
      if (!tournamentCompat) {
        return interaction
          .reply({
            content:
              "Compatibility data isn't available for this tournament yet. Run the backfill to generate it.",
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      }

      if ((tournamentCompat.totalMatches || 0) < 10) {
        return interaction
          .reply({
            content:
              "It appears there have not been enough matches in this tournament to run this command.",
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      }

      const embed = buildCompatibilityEmbedFromStore(
        tournamentCompat,
        checkingUser,
        userId,
        userInfo,
        tournamentName,
        tournamentCompat.format || tournamentDb.tournamentFormat
      );
      if (!embed) {
        return interaction
          .reply({
            content:
              "It appears one of the members in the comparison did not take part in the tournament.",
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      }
      embeds.push(embed);
    }

    if (!isPublic) {
      return interaction
        .reply({
          embeds: embeds,
          ephemeral: true,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
    }
    return interaction
      .reply({
        embeds: embeds,
      })
      .then(() => console.log("Reply sent."))
      .catch((_) => null);
  },
};

function buildCompatibilityEmbedFromStore(
  store,
  checkingUser,
  userId,
  userInfo,
  tournamentName,
  tournamentType
) {
  if (!store || !store.users) {
    return null;
  }
  const totalMatches = store.totalMatches || 0;
  if (totalMatches < 10) {
    return null;
  }
  const stats = store.users?.[checkingUser]?.[userId];
  if (!stats) {
    return null;
  }

  // Which shape to read is the pair's to decide, not the tournament's. A
  // contest that ran ranked group rounds and a head-to-head final stores both
  // side by side, and a pair who only ever met in that final carries no ranked
  // keys at all -- reading them by the tournament's label divides zero by zero
  // and reports the pair as "NaN%" compatible.
  const hasRanked = (stats.matchCount || 0) > 0;
  const hasFlat = (stats.iterations || 0) > 0;
  if (!hasRanked && !hasFlat) {
    return null;
  }
  const useRanked = tournamentType == "3v3 Ranked" ? hasRanked : !hasFlat;

  let userResults = {};
  if (useRanked) {
    userResults = {
      totalWeight: stats.totalWeight || 0,
      firstWeight: stats.firstWeight || 0,
      secondWeight: stats.secondWeight || 0,
      partialMatch: stats.partialMatch || 0,
      maxWeight: stats.maxWeight || 0,
      iterations: totalMatches,
      disagreementWeight: stats.disagreementWeight || 0,
      matchCount: stats.matchCount || 0,
    };
  } else {
    const iterations = stats.iterations || 0;
    userResults = {
      totalWeight: stats.matched || 0,
      maxWeight: iterations,
      iterations,
      disagreementWeight: 0,
      matchCount: iterations,
    };
  }

  // The embed lays its fields out by type too, so report the shape actually
  // read rather than the tournament's -- otherwise a head-to-head pair in a
  // ranked contest gets the ranked layout over flat numbers.
  const effectiveType = useRanked
    ? "3v3 Ranked"
    : tournamentType == "3v3 Ranked"
    ? "Single Elimination"
    : tournamentType;

  // Same smoothing /tournament-most-compatible ranks on, so a pair's number
  // reads the same in both commands. Two shared matches is not 100%.
  const kind = useRanked ? "ranked" : "flat";
  const shrunkPercent = Math.ceil(
    GetPairShrunkRate(stats, kind, GetBaselineRate(store, kind)) * 100
  );

  return buildCompatibilityEmbedFromResult(
    userResults,
    userInfo,
    tournamentName,
    effectiveType,
    shrunkPercent
  );
}

function buildCompatibilityEmbedFromResult(
  userResults,
  userInfo,
  tournamentName,
  tournamentType,
  percentOverride
) {
  var partialMatchWeight =
    userResults?.partialMatch !== undefined
      ? parseInt(userResults.partialMatch) / 2
      : 0;
  var weightMinusDisagreements =
    parseInt(userResults.totalWeight) -
    parseInt(userResults.disagreementWeight);

  weightMinusDisagreements += partialMatchWeight;

  var userCompatPercent =
    percentOverride === undefined
      ? Math.ceil(
          (parseInt(weightMinusDisagreements) /
            parseInt(userResults.maxWeight)) *
            100
        )
      : percentOverride;

  let colour = 0x0047ab;
  if (userCompatPercent >= 90) {
    colour = 0xff69b4;
  } else if (userCompatPercent > 74 && userCompatPercent < 90) {
    colour = 0xffd700;
  } else if (userCompatPercent > 49 && userCompatPercent < 75) {
    colour = 0xc0c0c0;
  }

  return CreateCompatibilityEmbed(
    userResults,
    userInfo,
    userCompatPercent,
    colour,
    tournamentName,
    tournamentType
  );
}

async function getUserInfoFromId(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    const user = member.user;

    console.log(user.username);
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

function CreateCompatibilityEmbed(
  usersCompatibility,
  comparedUserInfo,
  percent,
  colour,
  tournamentName,
  tournamentType
) {
  var disagreeCount =
    tournamentType == "3v3 Ranked"
      ? parseInt(usersCompatibility.disagreementWeight)
      : parseInt(usersCompatibility.iterations) -
        parseInt(usersCompatibility.totalWeight);

  var compatEmbed = new EmbedBuilder()
    .setTitle("Users Compatibility")
    .setAuthor({
      name: tournamentName,
    })
    .setDescription(
      "You and " +
        comparedUserInfo.username +
        " have a vote compatabitlity of **" +
        percent +
        "%**!\n\nHere's the breakdown of votes:"
    )
    .setThumbnail(String(comparedUserInfo.avatarURL))
    //.addFields("\u200B", "\u200B")

    .setColor(colour)
    .setFooter({
      text: "Supradarky's VGM Club",
      iconURL:
        "http://91.99.239.6/files/assets/sd-img.png",
    });

  if (tournamentType == "3v3 Ranked") {
    compatEmbed.addFields(
      {
        name: "Matched 1st:",
        value: String(usersCompatibility.firstWeight) + " times",
        inline: true,
      },
      {
        name: "Matched 2nd: ",
        value: String(usersCompatibility.secondWeight) + " times",
        inline: true,
      },

      {
        name: "Partial Matches: ",
        value: String(usersCompatibility.partialMatch) + " times",
        inline: true,
      },
      {
        name: "Disagreed: ",
        value: String(disagreeCount) + " times",
        inline: true,
      },
      {
        name: "Competed together in: ",
        value:
          String(usersCompatibility.matchCount) +
          "/" +
          String(usersCompatibility.iterations) +
          " matches",
        inline: true,
      }
    );
  } else {
    compatEmbed.addFields(
      {
        name: "Matched:",
        value: String(usersCompatibility.totalWeight) + " times",
        inline: true,
      },
      {
        name: "Disagreed: ",
        value: String(disagreeCount) + " times",
        inline: true,
      },
      {
        name: "Competed together in: ",
        value:
          String(usersCompatibility.iterations) +
          "/" +
          String(usersCompatibility.maxWeight) +
          " matches",
        inline: false,
      }
    );
  }
  return compatEmbed;
}

function buildSelfWinnerRateEmbedsForAllTournaments(
  tournamentDetails,
  userId,
  userInfo
) {
  const allTournaments = GetTournamentEntries(tournamentDetails);
  const embeds = [];

  const nonTripleTournaments = allTournaments.filter(
    (tournament) => tournament.data?.tournamentFormat != "3v3 Ranked"
  );
  const nonTripleStats = calculateWinnerRateStatsForTournamentList(
    nonTripleTournaments,
    userId
  );
  const nonTripleEmbed = createSelfWinnerRateEmbed(
    nonTripleStats,
    userInfo,
    "All Tournaments - Single/Double Elimination"
  );
  if (nonTripleEmbed) {
    embeds.push(nonTripleEmbed);
  }

  const tripleTournaments = allTournaments.filter(
    (tournament) => tournament.data?.tournamentFormat == "3v3 Ranked"
  );
  const tripleStats = calculateWinnerRateStatsForTournamentList(
    tripleTournaments,
    userId
  );
  const tripleEmbed = createSelfWinnerRateEmbed(
    tripleStats,
    userInfo,
    "All Tournaments - 3v3 Ranked"
  );
  if (tripleEmbed) {
    embeds.push(tripleEmbed);
  }

  return embeds;
}

function buildSelfWinnerRateEmbedForTournament(
  tournamentName,
  tournamentDb,
  userId,
  userInfo
) {
  const stats = calculateWinnerRateStatsForTournament(tournamentDb, userId);
  return createSelfWinnerRateEmbed(stats, userInfo, tournamentName);
}

function calculateWinnerRateStatsForTournamentList(tournaments, userId) {
  const stats = {
    totalWeight: 0,
    maxWeight: 0,
    iterations: 0,
  };
  for (const tournament of tournaments) {
    const tournamentStats = calculateWinnerRateStatsForTournament(
      tournament.data,
      userId
    );
    stats.totalWeight += tournamentStats.totalWeight;
    stats.maxWeight += tournamentStats.maxWeight;
    stats.iterations += tournamentStats.iterations;
  }
  return stats;
}

function calculateWinnerRateStatsForTournament(tournamentDb, userId) {
  const stats = {
    totalWeight: 0,
    maxWeight: 0,
    iterations: 0,
  };
  if (!tournamentDb || !Array.isArray(tournamentDb.matches)) {
    return stats;
  }

  for (const match of tournamentDb.matches) {
    if (!match || match.progress !== "complete") {
      continue;
    }

    // Decided per match, across every entrant slot. GetWinnerVoteOutcome
    // comes from compatibilityStore.js, eval'd at the top.
    const outcome = GetWinnerVoteOutcome(match, userId);
    if (!outcome.isValid) {
      continue;
    }

    stats.maxWeight += 1;
    if (!outcome.participated) {
      continue;
    }

    stats.iterations += 1;
    if (outcome.hit) {
      stats.totalWeight += 1;
    }
  }

  return stats;
}

function createSelfWinnerRateEmbed(stats, userInfo, tournamentName) {
  if (!stats || stats.iterations < 1) {
    return null;
  }

  const disagreeCount = stats.iterations - stats.totalWeight;
  const winnerPercent = Math.ceil((stats.totalWeight / stats.iterations) * 100);

  return new EmbedBuilder()
    .setTitle("Your Contest Stats")
    .setAuthor({
      name: tournamentName,
    })
    .setDescription(
      "**" +
        userInfo.username +
        "** has voted on winners with a success rate of **" +
        winnerPercent +
        "%**\n\nHere's the breakdown of votes:"
    )
    .setThumbnail(String(userInfo.avatarURL))
    .addFields(
      {
        name: "Hits:",
        value: String(stats.totalWeight) + " times",
        inline: true,
      },
      {
        name: "Misses: ",
        value: String(disagreeCount) + " times",
        inline: true,
      },
      {
        name: "Competed in: ",
        value: String(stats.iterations) + "/" + String(stats.maxWeight) + " matches",
        inline: false,
      }
    )
    .setColor(0xffd700)
    .setFooter({
      text: "Supradarky's VGM Club",
      iconURL:
        "http://91.99.239.6/files/assets/sd-img.png",
    });
}
