const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const Discord = require("discord.js");

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
          "The tagged member you want to compare with. e.g. @MajorDomo-Bot"
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
    var tournamentDb = await GetDbTable(db, process.env.TOURNAMENT_NAME);

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
    console.log(userId);

    //await interaction.reply({
    //  content: "Testing in the backend",
    //});

    var userResults = compareUsers(
      interaction,
      tournamentDb,
      checkingUser,
      userId
    );

    var userCompatPercent = Math.ceil(
      (parseInt(userResults.totalWeight) / parseInt(userResults.maxScore)) * 100
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
      var embed = CreateDiscordEmbed(
        userResults,
        userInfo,
        userCompatPercent,
        colour
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

function compareUsers(interaction, awards, userId1, userId2) {
  let totalWeight = 0;
  let maxWeight = 0;
  let iterations = 0;
  let bothInFirstPickCount = 0;
  let bothInSecondPickCount = 0;
  let bothPlacedlast = 0;
  let oneInFirstPickOtherInDidNotPlaceCount = 0;

  outer: for (var i = 0; i < awards.length; i++) {
    if (awards[i]?.entries?.length < 1) {
      continue;
    }
    var isTwoEntryRound = parseInt(i) > awards.length - 3;
    //console.log("How many entries have we found?: " + award.entries.length);
    for (const entry of awards[i].entries) {
      if (isTwoEntryRound) {
        if (entry.usersFirstPick.length === 0) {
          //console.log("We didn't find anything on this one");
          continue;
        }
      } else {
        if (
          entry.usersFirstPick.length === 0 &&
          entry.usersSecondPick.length === 0 &&
          entry.usersDidNotPlace.length === 0
        ) {
          //console.log("We didn't find anything on this one");
          continue;
        }
      }

      /*
      A: 1 | A: 1
      B: 2 | B: 2  + 2
      C: 3 | C: 3 
      
      A: 2 | B: 1
      B: 1 | A: 2  + 1
           
      A: 1 | A: 3 (-2) + 0
      C: 3 | C: 1 (-2)
      (6-4=2)  */

      if (isTwoEntryRound) {
        const bothInFirstPick =
          entry.usersFirstPick.includes(userId1) &&
          entry.usersFirstPick.includes(userId2);

        if (bothInFirstPick) {
          totalWeight += 2;
          bothInFirstPickCount++;
        } else {
          maxWeight += 1;
        }
      } else {
        // Two pointers
        const bothInFirstPick =
          entry.usersFirstPick.includes(userId1) &&
          entry.usersFirstPick.includes(userId2);
        const bothInSecondPick =
          entry.usersSecondPick.includes(userId1) &&
          entry.usersSecondPick.includes(userId2);
        const bothInThirdPick =
          entry.usersDidNotPlace.includes(userId1) &&
          entry.usersDidNotPlace.includes(userId2);

        // Single Pointers
        const user1InFirstPickAndUser2InDidNotPlace =
          entry.usersFirstPick.includes(userId1) &&
          entry.usersDidNotPlace.includes(userId2);
        const user1InDidNotPlaceAndUser2InFirstPick =
          entry.usersDidNotPlace.includes(userId1) &&
          entry.usersFirstPick.includes(userId2);

        const user1InFirstPickAndUser2InSecondPick =
          entry.usersFirstPick.includes(userId1) &&
          entry.usersSecondPick.includes(userId2);
        const user1InSecondPickAndUser2InFirstPick =
          entry.usersSecondPick.includes(userId1) &&
          entry.usersFirstPick.includes(userId2);

        if (bothInFirstPick) {
          totalWeight += 2;
          bothInFirstPickCount++;
        } else if (bothInSecondPick) {
          totalWeight += 2;
          bothInSecondPickCount++;
        } else if (bothInThirdPick) {
          totalWeight += 2;
          bothPlacedlast++;
        } else if (
          user1InFirstPickAndUser2InSecondPick ||
          user1InSecondPickAndUser2InFirstPick
        ) {
          totalWeight += 1;
        }

        if (
          user1InFirstPickAndUser2InDidNotPlace ||
          user1InDidNotPlaceAndUser2InFirstPick
        ) {
          totalWeight -= 0.5;
          oneInFirstPickOtherInDidNotPlaceCount++;
        }

        var user1InBattle =
          entry.usersFirstPick.includes(userId1) ||
          entry.usersSecondPick.includes(userId1) ||
          entry.usersDidNotPlace.includes(userId1);
        var user2InBattle =
          entry.usersFirstPick.includes(userId2) ||
          entry.usersSecondPick.includes(userId2) ||
          entry.usersDidNotPlace.includes(userId2);

        if (user1InBattle && user2InBattle) {
          maxWeight += 2;
          iterations++;
        }
      }
    }
  }
  // function calculateMaxScore(iterations) {
  //   return iterations * 2 + iterations;
  // }

  const maxScore = maxWeight; //calculateMaxScore(iterations);
  console.log("User weight: " + totalWeight + "\nMax score: " + maxScore);

  if (iterations < 1) {
    return interaction
      .reply({
        content:
          "It appears one of the members in the comparison did not take part in the tournament.",
      })
      .then(() => console.log("Reply sent."))
      .catch((_) => null);
  }

  const usersCompatibility = {
    userId1,
    userId2,
    totalWeight,
    maxScore,
    iterations,
    bothInFirstPickCount,
    bothInSecondPickCount,
    bothPlacedlast,
    oneInFirstPickOtherInDidNotPlaceCount,
  };

  return usersCompatibility;
}

async function getUserInfoFromId(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    const user = member.user;

    console.log(user.username);
    return {
      username: user.username,
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
  percent,
  colour
) {
  return (
    new EmbedBuilder()
      .setTitle("Users Compatibility")
      .setAuthor({
        name: "Best VGM 2022 - User Compatibility",
      })
      .setDescription(
        "It looks like you and " +
          comparedUserInfo.username +
          " have a vote compatibility of **" +
          percent +
          "%**!\n\nHere's a breakdown on when you voted the same:"
      )
      .setThumbnail(String(comparedUserInfo.avatarURL))
      //.addFields("\u200B", "\u200B")
      .addFields(
        {
          name: "Matched on 1st:",
          value: String(usersCompatibility.bothInFirstPickCount) + " times",
          inline: true,
        },
        {
          name: "Matched on 2nd:",
          value: String(usersCompatibility.bothInSecondPickCount) + " times",
          inline: true,
        },
        {
          name: "Matched on 3rd:",
          value: String(usersCompatibility.bothPlacedlast) + " times",
          inline: true,
        },
        {
          name: "At odds with each other: ",
          value:
            String(usersCompatibility.oneInFirstPickOtherInDidNotPlaceCount) +
            " times",
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
