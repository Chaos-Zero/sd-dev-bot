const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const Discord = require("discord.js");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/main.js") + "");

const loadingEmbed = new EmbedBuilder().setImage(
  "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Domo-load.gif?v=1679712312250"
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("taste-makers")
    .setDescription(
      "Find who's on the pulse and has most consistently voted for the winner in matches!"
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

    let tournamentDetails = db.get("tournaments").nth(0).value();
    let doubleEliminationName = await db
      .get("tournaments[0].currentTournament")
      .value();
    console.log(doubleEliminationName);
    let tournamentDb = await tournamentDetails[doubleEliminationName];
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

    var voters = GetAllVoters(tournamentDb);

    var userResults = compareUsersAndReturnTasteMakers(
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
          embeds: embeds,
          ephemeral: true,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
    } else {
      return await interaction
        .editReply({
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

function GetAllVoters(currentTournament) {
  var voters = [];
  if (currentTournament?.matches?.length < 1) {
    return [];
  }
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
  return voters;
}

function compareUsersAndReturnTasteMakers(
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
  let highestValue = 0;
  let tasteMakers = [];

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
    matchInner: for (const match of playedMatches) {
      if (match.progress == "complete") {
        maxWeight += 1;
        if (
          parseInt(match.entrant1.points) > parseInt(match.entrant2.points) &&
          match.entrant1.voters.includes(voter)
        ) {
          totalWeight += 1;
          iterations += 1;
          continue matchInner;
        } else if (
          parseInt(match.entrant2.points) > parseInt(match.entrant1.points) &&
          match.entrant1.voters.includes(voter)
        ) {
          iterations += 1;
          continue matchInner;
        } else if (
          parseInt(match.entrant2.points) > parseInt(match.entrant1.points) &&
          match.entrant2.voters.includes(voter)
        ) {
          totalWeight += 1;
          iterations += 1;
          continue matchInner;
        } else if (
          parseInt(match.entrant1.points) > parseInt(match.entrant2.points) &&
          match.entrant2.voters.includes(voter)
        ) {
          iterations += 1;
          continue matchInner;
        }
      }
    }

    if (!isAllowedLessThan50Percent) {
      if ((parseInt(iterations) / parseInt(maxWeight)) * 100 < 50) {
        continue;
      }
    }
    var isUserInServer = guildUsers.has(voter);

    if (highestValue < totalWeight && isUserInServer) {
      highestValue = totalWeight;
      if (tasteMakers.length > 0) {
        tasteMakers.splice(0, 1 + parseInt(tiedValues));
      }

      tasteMakers.push({
        voter,
        totalWeight,
        maxWeight,
        iterations,
      });
      tiedValues = 0;
    } else if (highestValue == totalWeight && isUserInServer) {
      tiedValues += 1;

      tasteMakers.push({
        voter,
        totalWeight,
        maxWeight,
        iterations,
      });
    }
  }
  return tasteMakers;
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
      .setTitle("Contest Tastemakers")
      .setAuthor({
        name: tournamentName.toString(),
      })
      .setDescription(
        "**" +
          comparedUserInfo.username +
          "** has voted on the most winners so far with a success rate of **" +
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
          "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016",
      })
  );
}
