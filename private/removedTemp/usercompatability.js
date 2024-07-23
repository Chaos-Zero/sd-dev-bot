const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const Discord = require("discord.js");

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/main.js") + "");

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
    ),
  async execute(interaction) {
    var db = GetDb();
    db.read();
    let tournamentDetails = db.get("tournaments").nth(0).value();
    let doubleEliminationName = await db
      .get("tournaments[0].currentTournament")
      .value();
    let tournamentDb = await tournamentDetails[doubleEliminationName];

    const checkingUser = interaction.user.id;
    const userToCompare = interaction.options.getString("other-member");
    const isPublic = interaction.options.getBoolean("make-public") || false;

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

    var userResults = compareUsers(
      interaction,
      tournamentDb,
      checkingUser,
      userId
    );

    if (userResults.iterations < 1) {
      return interaction
        .reply({
          content:
            "It appears one of the members in the comparison did not take part in the tournament.",
          ephemeral: true,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
    }

    var userCompatPercent = Math.ceil(
      (parseInt(userResults.totalWeight) / parseInt(userResults.iterations)) * 100
    );

    let colour = 0x0047ab;
    if (userCompatPercent >= 90) {
      colour = 0xff69b4;
    } else if (userCompatPercent > 74 && userCompatPercent < 90) {
      colour = 0xffd700;
    } else if (userCompatPercent > 49 && userCompatPercent < 75) {
      colour = 0xc0c0c0;
    }

    console.log(colour);
    getUserInfoFromId(interaction.guild, userId).then((userInfo) => {
      var embed = CreateCompatibilityEmbed(
        userResults,
        userInfo,
        userCompatPercent,
        colour,
        doubleEliminationName
      );
      if (!isPublic) {
        return interaction
          .reply({
            //content: "Score attained: " + userResults.totalWeight  + "\nMax Score possible: " + userResults.maxScore + "\nTracks checked: " + userResults.iterations,
            embeds: [embed],
            ephemeral: true,
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      } else {
        return interaction
          .reply({
            //content: "Score attained: " + userResults.totalWeight  + "\nMax Score possible: " + userResults.maxScore + "\nTracks checked: " + userResults.iterations,
            embeds: [embed],
          })
          .then(() => console.log("Reply sent."))
          .catch((_) => null);
      }
    });
  },
};

function compareUsers(interaction, currentTournament, userId1, userId2) {
  let totalWeight = 0;
  let maxWeight = 0;
  let iterations = 0;

  var playedMatches = currentTournament.matches;

  if (currentTournament.matches.length < 1) {
    return interaction
      .reply({
        content: "it appears no matches have been held in this tournament yet.",
        ephemeral: true,
      })
      .then(() => console.log("Reply sent."))
      .catch((_) => null);
  }

  matchInner: for (const match of playedMatches) {
    if (match.progress == "complete") {
      maxWeight += 1;
      if (
        match.entrant1.voters.includes(userId1) &&
        match.entrant1.voters.includes(userId2)
      ) {
        totalWeight += 1;
        iterations += 1;
        continue matchInner;
      } else if (
        match.entrant2.voters.includes(userId1) &&
        match.entrant2.voters.includes(userId2)
      ) {
        totalWeight += 1;
        iterations += 1;
        continue matchInner;
      } else if (
        match.entrant1.voters.includes(userId1) &&
        match.entrant2.voters.includes(userId2)
      ) {
        iterations += 1;
      } else if (
        match.entrant2.voters.includes(userId1) &&
        match.entrant1.voters.includes(userId2)
      ) {
        iterations += 1;
      }
    }
  }

  // function calculateMaxScore(iterations) {
  //   return iterations * 2 + iterations;
  // }

  const usersCompatibility = {
    userId1,
    userId2,
    totalWeight,
    maxWeight,
    iterations,
  };

  return usersCompatibility;
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
  tournamentName
) {
  var disagreeCount =
    parseInt(usersCompatibility.iterations) -
    parseInt(usersCompatibility.totalWeight);
  return (
    new EmbedBuilder()
      .setTitle("Users Compatibility")
      .setAuthor({
        name: tournamentName,
      })
      .setDescription(
        "You and " +
          comparedUserInfo.username +
          " have a vote compatibility of **" +
          percent +
          "%**!\n\nHere's a breakdown of votes:"
      )
      .setThumbnail(String(comparedUserInfo.avatarURL))
      //.addFields("\u200B", "\u200B")
      .addFields(
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
      )
      .setColor(colour)
      .setFooter({
        text: "Supradarky's VGM Club",
        iconURL:
          "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016",
      })
  );
}

// const userId1 = "165663829135458305";
// const userId2 = "197134533127176192";
// const result = compareUsers(bestvgm2022awards, userId1, userId2);
//
// console.log(result);
