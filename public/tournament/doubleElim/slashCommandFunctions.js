const { EmbedBuilder } = require("discord.js");

function compareDoubleUsers(interaction, currentTournament, userId1, userId2) {
  let totalWeight = 0;
  let maxWeight = 0;
  let iterations = 0;
  let disagreementWeight = 0;
  var matchCount = 0;

  var playedMatches = currentTournament.matches;

  if (currentTournament.matches.length < 5) {
    return interaction
      .reply({
        content:
          "It appears there has not been enough rounds in this tournament to run this command.",
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
  matchCount = iterations;

  const usersCompatibility = {
    userId1,
    userId2,
    totalWeight,
    maxWeight,
    iterations,
    disagreementWeight,
    matchCount,
  };

  return usersCompatibility;
}

function compareDoubleUsersAndReturnMostCompatible(
  interaction,
  currentTournament,
  userId1,
  guildUsers,
  voters,
  userPercent
) {
  let instigatorBattleTotal = 0;

  var playedMatches = currentTournament.matches;

  let totalWeight = 0;
  let maxWeight = 0;
  let iterations = 0;

  let tiedValues = 0;
  let highestComapatValue = 0;
  let topCompatibility = [];

  if (currentTournament.matches.length < 1) {
    return interaction
      .reply({
        content: "it appears no matches have been held in this tournament yet.",
        ephemeral: true,
      })
      .then(() => console.log("Reply sent."))
      .catch((_) => null);
  }

  //Get the amount of rounds the user has been in
  outer: for (const match of playedMatches) {
    if (match.progress == "complete") {
      if (
        match.entrant1.voters.includes(userId1) ||
        match.entrant2.voters.includes(userId1)
      ) {
        instigatorBattleTotal++;
      }
    }
  }

  inner: for (var voter of voters) {
    if (voter == userId1) {
      continue;
    }
    // console.log(voter);
    matchInner: for (const match of playedMatches) {
      console.log("entrant1 voters: " + match.entrant1.voters);
      if (match.progress == "complete") {
        maxWeight += 1;
        if (
          match.entrant1.voters.includes(userId1) &&
          match.entrant1.voters.includes(voter)
        ) {
          totalWeight += 1;
          iterations += 1;
          continue matchInner;
        } else if (
          match.entrant2.voters.includes(userId1) &&
          match.entrant2.voters.includes(voter)
        ) {
          totalWeight += 1;
          iterations += 1;
          continue matchInner;
        } else if (
          match.entrant1.voters.includes(userId1) &&
          match.entrant2.voters.includes(voter)
        ) {
          iterations += 1;
        } else if (
          match.entrant2.voters.includes(userId1) &&
          match.entrant1.voters.includes(voter)
        ) {
          iterations += 1;
        }
      }
    }

    if (parseInt(userPercent) !== "NaN" && userPercent !== "") {
      if (
        (parseInt(iterations) / parseInt(instigatorBattleTotal)) * 100 <
        Math.ceil(parseInt(userPercent))
      ) {
        //console.log("We got here");
        totalWeight = 0;
        maxWeight = 0;
        iterations = 0;
        continue inner;
      }
    }
    var userCompatPercent = Math.ceil(
      (parseInt(totalWeight) / parseInt(iterations)) * 100
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
        userCompatPercent
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
        userCompatPercent
      });
    }
    totalWeight = 0;
    maxWeight = 0;
    iterations = 0;

    // function calculateMaxScore(iterations) {
    //   return iterations * 2 + iterations;
    // }
    //console.log(topCompatibility);
  }
  return topCompatibility;
}

function CreateDoubleHighestCompatDiscordEmbed(
  usersCompatibility,
  comparedUserInfo,
  colour,
  tournamentName
) {
  console.log("We created an embed for " + tournamentName);
  var disagreeCount =
    parseInt(usersCompatibility.iterations) -
    parseInt(usersCompatibility.totalWeight);

  return (
    new EmbedBuilder()
      .setTitle("Highest Compatibility")
      .setAuthor({
        name: tournamentName.toString(),
      })
      .setDescription(
        "You and " +
          comparedUserInfo.username +
          " have a vote compatibility of **" +
          usersCompatibility.userCompatPercent +
          "%**!\n\nHere's the breakdown of votes:"
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
