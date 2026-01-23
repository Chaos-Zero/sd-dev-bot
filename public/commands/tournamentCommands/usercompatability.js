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
    .setName("user-compatibility")
    .setDescription(
      "Compare yourself and another user to see how compatible your votes have been"
    )
    .addStringOption((option) =>
      option
        .setName("other-member")
        .setDescription(
          "The taggeed user you want to compare with. e.g. @MajorDomo-Bot"
        )
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
    let tournamentDetails = db.get("tournaments").nth(0).value();
    let tournamentName = await db
      .get("tournaments[0].currentTournament")
      .value();
    let tournamentDb = await tournamentDetails[tournamentName];

    const checkingUser = interaction.user.id;
    const userToCompare = interaction.options.getString("other-member");
    const isPublic = interaction.options.getBoolean("make-public") || false;
    const searchAll =
      interaction.options.getBoolean("search-all-tournaments") || false;

    if (!userToCompare.includes("<@")) {
      return interaction.reply({
        content:
          "Please use a tag for the other member identification.\ne.g. `/user-compatibility` `other-member`**@MajorDomo-Bot**",
        ephemeral: true,
      });
    }
    var userNumb = userToCompare.match(/\d/g);
    var userId = userNumb.join("").trim();

    //await interaction.reply({
    //  content: "Testing in the backend",
    //});
    if (!searchAll && (!tournamentName || tournamentName === "N/A" || !tournamentDb)) {
      const latestTournament = getLatestTournamentEntry(tournamentDetails);
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
    const compatibilityDb = LoadCompatibilityDb();

    const embeds = [];
    const userInfo = await getUserInfoFromId(interaction.guild, userId);
    if (!userInfo) {
      return interaction.reply({
        content: "Unable to fetch user info for the specified member.",
        ephemeral: true,
      });
    }

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
        const latestTournament = getLatestTournamentEntry(tournamentDetails);
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

function getAllTournamentEntries(tournamentDetails) {
  const excludedKeys = new Set(["admin", "currentTournament", "receiptUsers"]);
  return Object.entries(tournamentDetails)
    .filter(([key, value]) => !excludedKeys.has(key) && value)
    .map(([key, value]) => ({ name: key, data: value }));
}

function getLatestTournamentEntry(tournamentDetails) {
  const allTournaments = getAllTournamentEntries(tournamentDetails);
  if (allTournaments.length < 1) {
    return null;
  }
  return allTournaments[allTournaments.length - 1];
}

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

  let userResults = {};
  if (tournamentType == "3v3 Ranked") {
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
      maxWeight: totalMatches,
      iterations,
      disagreementWeight: 0,
      matchCount: iterations,
    };
  }

  return buildCompatibilityEmbedFromResult(
    userResults,
    userInfo,
    tournamentName,
    tournamentType
  );
}

function buildTournamentSignature(tournaments) {
  return tournaments
    .map((tournament) => {
      const matchCount = Array.isArray(tournament.data.matches)
        ? tournament.data.matches.length
        : 0;
      const format = tournament.data.tournamentFormat || "unknown";
      return `${tournament.name}:${format}:${matchCount}`;
    })
    .join("|");
}

function getAggregateTournamentFromCache(tournamentDetails, formatKey) {
  const allTournaments = getAllTournamentEntries(tournamentDetails);
  const signature = buildTournamentSignature(allTournaments);
  if (aggregateCache.signature !== signature) {
    aggregateCache.signature = signature;
    aggregateCache.byFormat = {};
  }

  if (aggregateCache.byFormat[formatKey]) {
    return aggregateCache.byFormat[formatKey];
  }

  let tournaments = [];
  let tournamentFormat = "Single/Double Elimination";
  if (formatKey == "3v3 Ranked") {
    tournaments = allTournaments.filter(
      (tournament) => tournament.data.tournamentFormat == "3v3 Ranked"
    );
    tournamentFormat = "3v3 Ranked";
  } else {
    tournaments = allTournaments.filter(
      (tournament) => tournament.data.tournamentFormat != "3v3 Ranked"
    );
  }

  const aggregate = buildAggregateTournament(tournaments, tournamentFormat);
  aggregateCache.byFormat[formatKey] = aggregate;
  return aggregate;
}

function buildAggregateTournament(tournaments, tournamentFormat) {
  const matches = [];
  for (const tournament of tournaments) {
    if (Array.isArray(tournament.data.matches)) {
      const filteredMatches = tournament.data.matches.filter((match) =>
        isValidMatchForFormat(match, tournamentFormat)
      );
      matches.push(...filteredMatches);
    }
  }
  if (matches.length < 1) {
    return null;
  }
  return {
    tournamentFormat,
    matches,
  };
}

function isValidMatchForFormat(match, tournamentFormat) {
  if (!match || !match.entrant1 || !match.entrant2) {
    return false;
  }
  if (tournamentFormat == "3v3 Ranked") {
    return (
      match.entrant3 &&
      Array.isArray(match.entrant1?.voters?.first) &&
      Array.isArray(match.entrant1?.voters?.second) &&
      Array.isArray(match.entrant2?.voters?.first) &&
      Array.isArray(match.entrant2?.voters?.second) &&
      Array.isArray(match.entrant3?.voters?.first) &&
      Array.isArray(match.entrant3?.voters?.second)
    );
  }
  return (
    Array.isArray(match.entrant1?.voters) &&
    Array.isArray(match.entrant2?.voters)
  );
}

function buildCompatibilityEmbedForAggregate(
  interaction,
  aggregateTournament,
  checkingUser,
  userId,
  userInfo,
  tournamentName,
  tournamentType
) {
  if (!aggregateTournament || aggregateTournament.matches.length < 10) {
    return null;
  }

  let userResults = "";
  if (aggregateTournament.tournamentFormat == "3v3 Ranked") {
    userResults = compareTripleUsers(
      interaction,
      aggregateTournament,
      checkingUser,
      userId
    );
  } else {
    userResults = compareDoubleUsers(
      interaction,
      aggregateTournament,
      checkingUser,
      userId
    );
  }

  if (userResults == "" || userResults.matchCount < 1) {
    return null;
  }

  return buildCompatibilityEmbedFromResult(
    userResults,
    userInfo,
    tournamentName,
    tournamentType
  );
}

function buildCompatibilityEmbedFromResult(
  userResults,
  userInfo,
  tournamentName,
  tournamentType
) {
  var partialMatchWeight =
    userResults?.partialMatch !== undefined
      ? parseInt(userResults.partialMatch) / 2
      : 0;
  var weightMinusDisagreements =
    parseInt(userResults.totalWeight) -
    parseInt(userResults.disagreementWeight);

  weightMinusDisagreements += partialMatchWeight;

  var userCompatPercent = Math.ceil(
    (parseInt(weightMinusDisagreements) / parseInt(userResults.maxWeight)) * 100
  );

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
