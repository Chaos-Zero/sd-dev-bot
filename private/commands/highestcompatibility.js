const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const Discord = require("discord.js");

eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/main.js") + "");

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
    .addBooleanOption((option) =>
      option
        .setName("include-low-participation")
        .setDescription(
          "Allows comparison against those with less than 25% of your battles."
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    var db = GetDb();
    db.read();
    var tournamentDb = await GetDbTable(db, process.env.TOURNAMENT_NAME);
    const isPublic = interaction.options.getBoolean("make-public") || false;
    const isAllowedLessThan25Percent =
      interaction.options.getBoolean("include-low-participation") || false;
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

    var guild = interaction.member.guild;
    var guildUsers = await guild.members.cache;

    //console.log(guildUsers);
    var voters = GetAllVoters(tournamentDb);

    console.log(voters);

    var userResults = compareUsersAndReturnMostCompatible(
      interaction,
      tournamentDb,
      interaction.user.id,
      guildUsers,
      voters,
      isAllowedLessThan25Percent
    );

    //console.log("We got here")
    let embeds = await PopulateEmbeds(userResults, interaction);

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

async function PopulateEmbeds(userResults, interaction) {
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
    var embed = await PopulateEmbedData(interaction, result, embeds);
    embeds.push(embed);
  }
  return embeds;
}

async function PopulateEmbedData(interaction, result) {
  return new Promise((resolve) => {
    getUserInfoFromId(interaction.guild, result.voter).then((userInfo) => {
      var embed = CreateDiscordEmbed(result, userInfo, result.colour);

      resolve(embed);
    });
  });
}

function GetAllVoters(db) {
  var voters = [];
  outer: for (const rounds of db) {
    if (rounds?.entries?.length < 1) {
      break outer;
    }
    for (const entry of rounds.entries) {
      for (var voter of entry.usersFirstPick) {
        if (!voters.includes(voter)) {
          voters.push(voter);
        }
      }
    }
  }
  return voters;
}

function compareUsersAndReturnMostCompatible(
  interaction,
  awards,
  userId1,
  guildUsers,
  voters,
  isAllowedLessThan25Percent = false
) {
  let instigatorBattleTotal = 0;

  let totalWeight = 0;
  let maxWeight = 0;
  let iterations = 0;
  let bothInFirstPickCount = 0;
  let bothInSecondPickCount = 0;
  let bothPlacedlastCount = 0;
  let oneInFirstPickOtherInDidNotPlaceCount = 0;

  let tiedValues = 0;
  let highestComapatValue = 0;
  let topCompatibility = [];

  //Get the amount of rounds the user has been in
  outer: for (var i = 0; i < awards.length; i++) {
    if (awards[i]?.entries?.length < 1) {
      continue;
    }
    console.log(
      "How many entries have we found?: " +
        awards[i].entries.length +
        "\nRound: " +
        i
    );

    //var isATwoEntryRound = awards[i].entries.length % 2 == 0;
    var isATwoEntryRound = parseInt(i) > 2;
    //awards[i].entries.length % 2 == 0 &&

    for (const entry of awards[i].entries) {
      if (isATwoEntryRound) {
        if (entry.usersFirstPick.length == 0) {
          //console.log("We didn't find anything on this one");
          break outer;
        }
        if (entry.usersFirstPick.includes(userId1)) {
          instigatorBattleTotal++;
          //console.log("We didn't find anything on this one");
        }
      } else {
        if (
          entry.usersFirstPick.length == 0 &&
          entry.usersSecondPick.length == 0 &&
          entry.usersDidNotPlace.length == 0
        ) {
          //console.log("We didn't find anything on this one");
          break outer;
        }
        if (
          entry.usersFirstPick.includes(userId1) ||
          entry.usersSecondPick.includes(userId1) ||
          entry.usersDidNotPlace.includes(userId1)
        ) {
          instigatorBattleTotal++;
          //console.log("We didn't find anything on this one");
        }
      }
    }
  }

  for (var voter of voters) {
    if (voter == userId1) {
      continue;
    }
    // console.log(voter);
    for (var j = 0; j < awards.length; j++) {
      if (awards[j]?.entries?.length < 1) {
        continue;
      }
      var isTwoEntryRound = parseInt(j) > 2;
      //console.log("How many entries have we found?: " + award.entries.length);
      //console.log("isATwoEntryRoundInAThreeEntryTournament : " + isATwoEntryRoundInAThreeEntryTournament)
      for (const entry of awards[j].entries) {
        if (isTwoEntryRound) {
          if (entry.usersFirstPick.length == 0) {
            //console.log("We didn't find anything on this one");
            continue;
          }
        } else {
          if (
            entry.usersFirstPick.length == 0 &&
            entry.usersSecondPick.length == 0 &&
            entry.usersDidNotPlace.length == 0
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

        //console.log("Got to Def");
        // Two pointers
        if (isTwoEntryRound) {
          const bothInFirstPick =
            entry.usersFirstPick.includes(userId1) &&
            entry.usersFirstPick.includes(voter);

          if (bothInFirstPick) {
            totalWeight += 2;
            bothInFirstPickCount++;
          } else {
            maxWeight += 1;
          }
        } else {
          const bothInFirstPick =
            entry.usersFirstPick.includes(userId1) &&
            entry.usersFirstPick.includes(voter);

          const bothInSecondPick =
            entry.usersSecondPick.includes(userId1) &&
            entry.usersSecondPick.includes(voter);
          const bothInThirdPick =
            entry.usersDidNotPlace.includes(userId1) &&
            entry.usersDidNotPlace.includes(voter);

          // Single Pointers
          const user1InFirstPickAndUser2InDidNotPlace =
            entry.usersFirstPick.includes(userId1) &&
            entry.usersDidNotPlace.includes(voter);
          const user1InDidNotPlaceAndUser2InFirstPick =
            entry.usersDidNotPlace.includes(userId1) &&
            entry.usersFirstPick.includes(voter);

          const user1InFirstPickAndUser2InSecondPick =
            entry.usersFirstPick.includes(userId1) &&
            entry.usersSecondPick.includes(voter);
          const user1InSecondPickAndUser2InFirstPick =
            entry.usersSecondPick.includes(userId1) &&
            entry.usersFirstPick.includes(voter);

          if (bothInFirstPick) {
            totalWeight += 2;
            bothInFirstPickCount++;
          } else if (bothInSecondPick) {
            totalWeight += 2;
            bothInSecondPickCount++;
          } else if (bothInThirdPick) {
            totalWeight += 2;
            bothPlacedlastCount++;
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
            entry.usersFirstPick.includes(voter) ||
            entry.usersSecondPick.includes(voter) ||
            entry.usersDidNotPlace.includes(voter);

          if (user1InBattle && user2InBattle) {
            maxWeight += 2;
            iterations++;
          }
        }
      }
    }
    if (!isAllowedLessThan25Percent) {
      if ((parseInt(iterations) / parseInt(instigatorBattleTotal)) * 100 < 25) {
        //console.log("We got here");
        continue;
      }
    }
    var userCompatPercent = Math.ceil(
      (parseInt(totalWeight) / parseInt(maxWeight)) * 100
    );

    var isUserInServer = guildUsers.has(voter);

    if (highestComapatValue < userCompatPercent && isUserInServer) {
      highestComapatValue = userCompatPercent;
      if (topCompatibility.length > 0) {
        topCompatibility.splice(0, 1 + parseInt(tiedValues));
      }

      topCompatibility.push({
        userId1,
        voter,
        totalWeight,
        maxWeight,
        userCompatPercent,
        iterations,
        bothInFirstPickCount,
        bothInSecondPickCount,
        bothPlacedlastCount,
        oneInFirstPickOtherInDidNotPlaceCount,
      });
      tiedValues = 0;
    } else if (highestComapatValue == userCompatPercent && isUserInServer) {
      tiedValues += 1;

      topCompatibility.push({
        userId1,
        voter,
        totalWeight,
        maxWeight,
        userCompatPercent,
        iterations,
        bothInFirstPickCount,
        bothInSecondPickCount,
        bothPlacedlastCount,
        oneInFirstPickOtherInDidNotPlaceCount,
      });
    }
    totalWeight = 0;
    maxWeight = 0;
    iterations = 0;
    bothInFirstPickCount = 0;
    bothInSecondPickCount = 0;
    bothPlacedlastCount = 0;
    oneInFirstPickOtherInDidNotPlaceCount = 0;
  }

  // function calculateMaxScore(iterations) {
  //   return iterations * 2 + iterations;
  // }
  //console.log(topCompatibility);
  return topCompatibility;
}

async function getUserInfoFromId(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    const user = member.user;

    // console.log(user.username);
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

function CreateDiscordEmbed(usersCompatibility, comparedUserInfo, colour) {
  console.log("We created an embed");
  return (
    new EmbedBuilder()
      .setTitle("Highest Compatibility")
      .setAuthor({
        name: "Best VGM 2022",
      })
      .setDescription(
        "You and " +
          comparedUserInfo.username +
          " have a vote compatibility of **" +
          usersCompatibility.userCompatPercent +
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
          value: String(usersCompatibility.bothPlacedlastCount) + " times",
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
      //     .setColor(colour)
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
