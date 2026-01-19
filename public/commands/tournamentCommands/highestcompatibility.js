const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const Discord = require("discord.js");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/main.js") + "");
eval(
  fs.readFileSync("./public/tournament/triple/slashCommandFunctions.js") + ""
);
eval(
  fs.readFileSync("./public/tournament/doubleElim/slashCommandFunctions.js") +
    ""
);

const loadingEmbed = new EmbedBuilder().setImage(
  "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Domo-load.gif?v=1679712312250"
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("most-compatible")
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

    let tournamentDetails = db.get("tournaments").nth(0).value();
    let tournamentName = await db
      .get("tournaments[0].currentTournament")
      .value();
    let tournamentDb = await tournamentDetails[tournamentName];
    const searchAll =
      interaction.options.getBoolean("search-all-tournaments") || false;

    const isPublic = interaction.options.getBoolean("make-public") || false;
    const userPercent =
      interaction.options.getNumber("specify-participation-percentage") || 25;

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

    if (!searchAll && tournamentDb.matches.length < 10) {
      return interaction
        .reply({
          content:
            "It appears there have not been enough matches in this tournament to run this command.",
          ephemeral: true,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
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

    //console.log(guildUsers);
    var voters = [];
    var userResults = [];

    if (searchAll) {
      tournamentName = "All Tournaments";
      const allTournaments = getAllTournamentEntries(tournamentDetails);
      const tripleAggregate = buildAggregateTournament(
        allTournaments.filter(
          (tournament) => tournament.data.tournamentFormat == "3v3 Ranked"
        ),
        "3v3 Ranked"
      );
      const nonTripleAggregate = buildAggregateTournament(
        allTournaments.filter(
          (tournament) => tournament.data.tournamentFormat != "3v3 Ranked"
        ),
        "Single Elimination"
      );

      if (
        nonTripleAggregate &&
        Array.isArray(nonTripleAggregate.matches) &&
        nonTripleAggregate.matches.length >= 10
      ) {
        voters = GetAllVoters(nonTripleAggregate);
        userResults = mergeCompatibilityResults(
          userResults,
          compareDoubleUsersAndReturnMostCompatible(
            interaction,
            nonTripleAggregate,
            interaction.user.id,
            guildUsers,
            voters,
            userPercent
          )
        );
      }

      if (
        tripleAggregate &&
        Array.isArray(tripleAggregate.matches) &&
        tripleAggregate.matches.length >= 10
      ) {
        voters = GetAllVoters(tripleAggregate);
        userResults = mergeCompatibilityResults(
          userResults,
          compareTripleUsersAndReturnMostCompatible(
            interaction,
            tripleAggregate,
            interaction.user.id,
            guildUsers,
            voters,
            userPercent
          )
        );
      }
    } else {
      voters = GetAllVoters(tournamentDb);

      if (tournamentDb.tournamentFormat == "3v3 Ranked") {
        console.log("In Triple Results");
        userResults = compareTripleUsersAndReturnMostCompatible(
          interaction,
          tournamentDb,
          interaction.user.id,
          guildUsers,
          voters,
          userPercent
        );
      } else {
        userResults = compareDoubleUsersAndReturnMostCompatible(
          interaction,
          tournamentDb,
          interaction.user.id,
          guildUsers,
          voters,
          userPercent
        );
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
      if (tournamentDb.tournamentFormat == "3v3 Ranked") {
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

function buildAggregateTournament(tournaments, tournamentFormat) {
  const matches = [];
  for (const tournament of tournaments) {
    if (Array.isArray(tournament.data.matches)) {
      matches.push(...tournament.data.matches);
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

function GetAllVoters(currentTournament) {
  var voters = [];
  if (currentTournament?.matches?.length < 1) {
    return [];
  }
  if (currentTournament.tournamentFormat == "3v3 Ranked") {
    outer: for (const match of currentTournament.matches) {
      for (const voter of match.entrant1.voters.first) {
        if (!voters.includes(voter)) {
          voters.push(voter);
        }
      }
      for (const voter of match.entrant2.voters.second) {
        if (!voters.includes(voter)) {
          voters.push(voter);
        }
      }

      for (const voter of match.entrant2.voters.first) {
        if (!voters.includes(voter)) {
          voters.push(voter);
        }
      }
      for (const voter of match.entrant2.voters.second) {
        if (!voters.includes(voter)) {
          voters.push(voter);
        }
      }

      for (const voter of match.entrant3.voters.first) {
        if (!voters.includes(voter)) {
          voters.push(voter);
        }
      }
      for (const voter of match.entrant3.voters.second) {
        if (!voters.includes(voter)) {
          voters.push(voter);
        }
      }
    }
  } else {
    outer: for (const match of currentTournament.matches) {
      for (const voter of match.entrant1.voters) {
        if (!voters.includes(voter)) {
          voters.push(voter);
        }
      }
      for (const voter of match.entrant2.voters) {
        if (!voters.includes(voter)) {
          voters.push(voter);
        }
      }
    }
  }

  return voters;
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
