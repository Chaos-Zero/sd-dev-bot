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
      ) || getLatestTournamentEntry(tournamentDetails);
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
        ) || getLatestTournamentEntry(tournamentDetails);
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
    //console.log("We got here")
    let embeds = await PopulateEmbeds(
      userResults,
      interaction,
      tournamentName,
      tournamentDb
    );

    if (!isPublic) {
      return await interaction
        .editReply({
          //content: "Score attained: " + userResults.totalWeight  + "\nMax Score possible: " + userResults.maxScore + "\nTracks checked: " + userResults.iterations,
          embeds: embeds,
          ephemeral: true,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
    } else {
      return await interaction
        .editReply({
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
  tournamentDb
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
    embeds.push(embed);
  }
  return embeds;
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

function getLatestTournamentWithCompat(tournamentDetails, compatibilityDb) {
  const allTournaments = getAllTournamentEntries(tournamentDetails);
  if (allTournaments.length < 1) {
    return null;
  }
  for (let i = allTournaments.length - 1; i >= 0; i -= 1) {
    const candidate = allTournaments[i];
    if (compatibilityDb?.tournaments?.[candidate.name]) {
      return candidate;
    }
  }
  return null;
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
  let tournamentFormat = "Single Elimination";
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
  if (aggregate) {
    aggregate.voters = GetAllVoters(aggregate);
  }

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

  const userPairs = store.users[userId] || {};
  const userMatchCount = store.userMatchCounts?.[userId] || 0;
  let highestValue = 0;
  let topCompatibility = [];

  for (const [otherId, stats] of Object.entries(userPairs)) {
    if (otherId === userId) {
      continue;
    }
    if (!guildUsers.has(otherId)) {
      continue;
    }

    if (tournamentFormat == "3v3 Ranked") {
      const matchCount = stats.matchCount || 0;
      if (
        userMatchCount > 0 &&
        (matchCount / userMatchCount) * 100 < Math.ceil(userPercent)
      ) {
        continue;
      }

      const totalWeight = stats.totalWeight || 0;
      const partialMatch = stats.partialMatch || 0;
      const disagreementWeight = stats.disagreementWeight || 0;
      const maxWeight = stats.maxWeight || 0;
      const weightMinusDisagreements =
        totalWeight - disagreementWeight + partialMatch / 2;
      const userCompatPercent =
        maxWeight > 0
          ? Math.ceil((weightMinusDisagreements / maxWeight) * 100)
          : 0;

      const result = {
        voter: otherId,
        totalWeight,
        firstWeight: stats.firstWeight || 0,
        secondWeight: stats.secondWeight || 0,
        partialMatch,
        maxWeight,
        iterations: totalMatches || 0,
        disagreementWeight,
        matchCount,
        userCompatPercent,
        tournamentFormat: "3v3 Ranked",
      };

      if (userCompatPercent > highestValue) {
        highestValue = userCompatPercent;
        topCompatibility = [result];
      } else if (userCompatPercent === highestValue) {
        topCompatibility.push(result);
      }
      continue;
    }

    const iterations = stats.iterations || 0;
    if (
      userMatchCount > 0 &&
      (iterations / userMatchCount) * 100 < Math.ceil(userPercent)
    ) {
      continue;
    }
    const matched = stats.matched || 0;
    const userCompatPercent =
      iterations > 0 ? Math.ceil((matched / iterations) * 100) : 0;
    const result = {
      voter: otherId,
      totalWeight: matched,
      maxWeight: totalMatches || 0,
      iterations,
      userCompatPercent,
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

function GetAllVoters(currentTournament) {
  var voters = [];
  if (currentTournament?.matches?.length < 1) {
    return [];
  }
  if (currentTournament.tournamentFormat == "3v3 Ranked") {
    outer: for (const match of currentTournament.matches) {
      if (!isValidMatchForFormat(match, "3v3 Ranked")) {
        continue;
      }
      addUniqueVoters(voters, match.entrant1.voters.first);
      addUniqueVoters(voters, match.entrant1.voters.second);
      addUniqueVoters(voters, match.entrant2.voters.first);
      addUniqueVoters(voters, match.entrant2.voters.second);
      addUniqueVoters(voters, match.entrant3.voters.first);
      addUniqueVoters(voters, match.entrant3.voters.second);
    }
  } else {
    outer: for (const match of currentTournament.matches) {
      if (!isValidMatchForFormat(match, "Single Elimination")) {
        continue;
      }
      addUniqueVoters(voters, match.entrant1.voters);
      addUniqueVoters(voters, match.entrant2.voters);
    }
  }

  return voters;
}

function addUniqueVoters(voters, list) {
  if (!Array.isArray(list)) {
    return;
  }
  for (const voter of list) {
    if (!voters.includes(voter)) {
      voters.push(voter);
    }
  }
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
