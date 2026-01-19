const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const Discord = require("discord.js");

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/main.js") + "");
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

    const embeds = [];
    const userInfo = await getUserInfoFromId(interaction.guild, userId);
    if (!userInfo) {
      return interaction.reply({
        content: "Unable to fetch user info for the specified member.",
        ephemeral: true,
      });
    }

    if (searchAll) {
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
        "Single/Double Elimination"
      );

      const tripleEmbed = buildCompatibilityEmbedForAggregate(
        interaction,
        tripleAggregate,
        checkingUser,
        userId,
        userInfo,
        "All Tournaments - 3v3 Ranked",
        "3v3 Ranked"
      );
      if (tripleEmbed) {
        embeds.push(tripleEmbed);
      }

      const nonTripleEmbed = buildCompatibilityEmbedForAggregate(
        interaction,
        nonTripleAggregate,
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
      let userResults = "";

      if (tournamentDb.tournamentFormat == "3v3 Ranked") {
        userResults = compareTripleUsers(
          interaction,
          tournamentDb,
          checkingUser,
          userId
        );
      } else if (tournamentDb.tournamentFormat == "Single Elimination") {
        userResults = compareDoubleUsers(
          interaction,
          tournamentDb,
          checkingUser,
          userId
        );
      }

      if (userResults == "") {
        return interaction
          .reply({
            content:
              "It appears the current tournament format is not supported by this command.",
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      }

      if (userResults.matchCount < 1) {
        return interaction
          .reply({
            content:
              "It appears one of the members in the comparison did not take part in the tournament.",
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      }

      const embed = buildCompatibilityEmbedFromResult(
        userResults,
        userInfo,
        tournamentName,
        tournamentDb.tournamentFormat
      );
      if (embed) {
        embeds.push(embed);
      }
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
        "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016",
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
