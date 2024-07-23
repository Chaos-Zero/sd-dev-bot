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
    if (tournamentDb.matches.length < 5) {
      return interaction
        .reply({
          content:
            "It appears there has not been enough rounds in this tournament to run this command.",
          ephemeral: true,
        })
        .then(() => console.log("Reply sent."))
        .catch((_) => null);
    }

    var userResults = "";

    if (tournamentDb.tournamentFormat == "3v3 Ranked") {
      userResults = compareTripleUsers(
        interaction,
        tournamentDb,
        checkingUser,
        userId
      );
    }

    if (tournamentDb.tournamentFormat == "Single Elimination") {
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
    var partialMatchWeight =
      userResults?.partialMatch !== undefined
        ? parseInt(userResults.partialMatch) / 2
        : 0;
    var weightMinusDisagreements =
      parseInt(userResults.totalWeight) -
      parseInt(userResults.disagreementWeight);

    weightMinusDisagreements += partialMatchWeight;

    var userCompatPercent = Math.ceil(
      (parseInt(weightMinusDisagreements) / parseInt(userResults.maxWeight)) *
        100
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
        tournamentName,
        tournamentDb.tournamentFormat
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
