const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const Discord = require("discord.js");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/utils/compatibilityStore.js") + "");

const loadingEmbed = new EmbedBuilder().setImage(
  "http://91.99.239.6/files/assets/Domo_load.gif"
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-iconoclast")
    .setDescription(
      "Find who's marching to the beat of their own drum!"
    )
    .addBooleanOption((option) =>
      option
        .setName("make-public")
        .setDescription("Make the response viewable to the server.")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("include-low-participation")
        .setDescription(
          "Allows comparison against those who have competed in less than 50% of matches."
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    var db = GetDb();
    db.read();

    let tournamentDetails = db.get("tournaments").nth(0).value() || {};
    let doubleEliminationName = await db
      .get("tournaments[0].currentTournament")
      .value();
    console.log(doubleEliminationName);
    let tournamentDb = tournamentDetails[doubleEliminationName];
    if (!doubleEliminationName || doubleEliminationName === "N/A" || !tournamentDb) {
      const latestTournament = GetLatestTournamentEntry(tournamentDetails);
      if (latestTournament) {
        doubleEliminationName = latestTournament.name;
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
    const isPublic = interaction.options.getBoolean("make-public") || false;
    const isAllowedLessThan50Percent =
      interaction.options.getBoolean("include-low-participation") || false;

    if (!isPublic) {
      await interaction.reply({
        content: "Tallying scores...",
        embeds: [loadingEmbed],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "Tallying scores...",
        embeds: [loadingEmbed],
      });
    }

    await sleep(1000);

    var guild = interaction.member.guild;
    var guildUsers = await guild.members.cache;

    var voters = GetAllTournamentVoters(tournamentDb);

    var userResults = compareUsersAndReturnIconoclast(
      interaction,
      tournamentDb,
      guildUsers,
      voters,
      isAllowedLessThan50Percent
    );

    let embeds = await PopulateEmbeds(
      userResults,
      interaction,
      doubleEliminationName
    );

    if (!isPublic) {
      return await interaction
        .editReply({
          content: null,
          embeds: embeds,
          ephemeral: true,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
    } else {
      return await interaction
        .editReply({
          content: null,
          embeds: embeds,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
    }
  },
};

async function PopulateEmbeds(userResults, interaction, tournamentName) {
  var embeds = [];
  for (var result of userResults) {
    result.colour = 0xffd700;
    var embed = await PopulateEmbedData(interaction, result, tournamentName);
    embeds.push(embed);
  }
  return embeds;
}

async function PopulateEmbedData(interaction, result, tournamentName) {
  return new Promise((resolve) => {
    getUserInfoFromId(interaction.guild, result.voter).then((userInfo) => {
      var embed = CreateDiscordEmbed(
        result,
        userInfo,
        result.colour,
        tournamentName
      );

      resolve(embed);
    });
  });
}

function compareUsersAndReturnIconoclast(
  interaction,
  currentTournament,
  guildUsers,
  voters,
  isAllowedLessThan50Percent = false
) {
  var playedMatches = currentTournament.matches;

  let totalWeight = 0;
  let maxWeight = 0;
  let iterations = 0;

  let tiedValues = 0;
  let lowestRate = Number.POSITIVE_INFINITY;
  let iconoclasts = [];

  if (playedMatches.length < 1) {
    return interaction
      .reply({
        content: "It appears no matches have been held in this tournament yet.",
        ephemeral: true,
      })
      .then(() => console.log("Reply sent."))
      .catch((_) => null);
  }

  for (var voter of voters) {
    totalWeight = 0;
    maxWeight = 0;
    iterations = 0;
    for (const match of playedMatches) {
      // Read every entrant slot and judge the ballot by its own shape.
      // Historical contests ran 3- and 4-way "pick one" battles and ranked
      // rounds, so comparing entrant1 against entrant2 picked the wrong winner
      // and threw outright on a ranked ballot, whose voters are an object.
      // GetWinnerVoteOutcome comes from compatibilityStore.js, eval'd at the top.
      const outcome = GetWinnerVoteOutcome(match, voter);
      if (!outcome.isValid) {
        continue;
      }
      maxWeight += 1;
      if (!outcome.participated) {
        continue;
      }
      iterations += 1;
      if (outcome.hit) {
        totalWeight += 1;
      }
    }

    if (!isAllowedLessThan50Percent) {
      if ((parseInt(iterations) / parseInt(maxWeight)) * 100 < 50) {
        continue;
      }
    }
    if (iterations < 1) {
      continue;
    }
    var isUserInServer = guildUsers.has(voter);
    const winnerRate = totalWeight / iterations;
    const rateDelta = winnerRate - lowestRate;

    if (rateDelta < -Number.EPSILON && isUserInServer) {
      lowestRate = winnerRate;
      if (iconoclasts.length > 0) {
        iconoclasts.splice(0, 1 + parseInt(tiedValues));
      }

      iconoclasts.push({
        voter,
        totalWeight,
        maxWeight,
        iterations,
        winnerRate,
      });
      tiedValues = 0;
    } else if (Math.abs(rateDelta) <= Number.EPSILON && isUserInServer) {
      tiedValues += 1;

      iconoclasts.push({
        voter,
        totalWeight,
        maxWeight,
        iterations,
        winnerRate,
      });
    }
  }
  return iconoclasts;
}

async function getUserInfoFromId(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    const user = member.user;

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

function CreateDiscordEmbed(
  usersCompatibility,
  comparedUserInfo,
  colour,
  tournamentName
) {
  console.log(
    "We created an embed for " +
      tournamentName +
      "\n" +
      usersCompatibility.iterations +
      usersCompatibility.totalWeight +
      usersCompatibility.iterations
  );
  var disagreeCount =
    parseInt(usersCompatibility.iterations) -
    parseInt(usersCompatibility.totalWeight);

  let winnerPercent = Math.ceil(
    (parseInt(usersCompatibility.totalWeight) /
      parseInt(usersCompatibility.iterations)) *
      100
  );

  return (
    new EmbedBuilder()
      .setTitle("Contest Iconoclasts")
      .setAuthor({
        name: tournamentName.toString(),
      })
      .setDescription(
        "**" +
          comparedUserInfo.username +
          "** has voted on the least winners so far with a success rate of **" +
          winnerPercent +
          "%**!\n\nHere's the breakdown of votes:"
      )
      .setThumbnail(String(comparedUserInfo.avatarURL))
      .addFields(
        {
          name: "Hits:",
          value: String(usersCompatibility.totalWeight) + " times",
          inline: true,
        },
        {
          name: "Misses: ",
          value: String(disagreeCount) + " times",
          inline: true,
        },
        {
          name: "Competed in: ",
          value:
            String(usersCompatibility.iterations) +
            "/" +
            String(usersCompatibility.maxWeight) +
            " matches",
          inline: false,
        }
      )
      .setColor(colour)
      .setFooter({
        text: "Supradarky's VGM Club",
        iconURL:
          "http://91.99.239.6/files/assets/sd-img.png",
      })
  );
}
