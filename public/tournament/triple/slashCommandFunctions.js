const { EmbedBuilder } = require("discord.js");

function compareTripleUsers(interaction, currentTournament, userId1, userId2) {
  let totalWeight = 0;
  let firstWeight = 0;
  let secondWeight = 0;
  let maxWeight = 0;
  let iterations = 0;
  let disagreementWeight = 0;
  let matchCount = 0;
  var partialMatch = 0;

  var playedMatches = currentTournament.matches;

  // Max weight of a match is 2 points for 1st + 1 point for Second

  // Can get points for:
  /*
  +2 for matching first
  +1 for matching second
  +0.5 for 1st in one and 2nd in another
  -0.5 for 1st in third
*/

  matchInner: for (const match of playedMatches) {
    if (match.progress == "complete") {
      iterations += 1;
      var userOneCompeted =
        match.entrant1.voters.first.includes(userId1) ||
        match.entrant1.voters.second.includes(userId1) ||
        match.entrant2.voters.first.includes(userId1) ||
        match.entrant2.voters.second.includes(userId1) ||
        match.entrant3.voters.first.includes(userId1) ||
        match.entrant3.voters.second.includes(userId1);

      var userTwoCompeted =
        match.entrant1.voters.first.includes(userId2) ||
        match.entrant1.voters.second.includes(userId2) ||
        match.entrant2.voters.first.includes(userId2) ||
        match.entrant2.voters.second.includes(userId2) ||
        match.entrant3.voters.first.includes(userId2) ||
        match.entrant3.voters.second.includes(userId2);

      var firstInEntrant1 =
        match.entrant1.voters.first.includes(userId1) &&
        match.entrant1.voters.first.includes(userId2);
      var firstInEntrant2 =
        match.entrant2.voters.first.includes(userId1) &&
        match.entrant2.voters.first.includes(userId2);
      var firstInEntrant3 =
        match.entrant3.voters.first.includes(userId1) &&
        match.entrant3.voters.first.includes(userId2);

      var secondInEntrant1 =
        match.entrant1.voters.second.includes(userId1) &&
        match.entrant1.voters.second.includes(userId2);
      var secondInEntrant2 =
        match.entrant2.voters.second.includes(userId1) &&
        match.entrant2.voters.second.includes(userId2);
      var secondInEntrant3 =
        match.entrant3.voters.second.includes(userId1) &&
        match.entrant3.voters.second.includes(userId2);

      var MixFirstSecondInEntrant =
        match.entrant1.voters.first.includes(userId1) &&
        match.entrant1.voters.second.includes(userId2) &&
        match.entrant2.voters.first.includes(userId2) &&
        match.entrant2.voters.second.includes(userId1);

      var MixFirstThirdInEntrant =
        match.entrant1.voters.first.includes(userId1) &&
        match.entrant1.voters.second.includes(userId2) &&
        match.entrant3.voters.first.includes(userId2) &&
        match.entrant3.voters.second.includes(userId1);

      var MixSecondFirstInEntrant =
        match.entrant2.voters.first.includes(userId1) &&
        match.entrant2.voters.second.includes(userId2) &&
        match.entrant1.voters.first.includes(userId2) &&
        match.entrant1.voters.second.includes(userId1);

      var MixSecondThirdInEntrant =
        match.entrant2.voters.first.includes(userId1) &&
        match.entrant2.voters.second.includes(userId2) &&
        match.entrant3.voters.first.includes(userId2) &&
        match.entrant3.voters.second.includes(userId1);

      var MixThirdFirstInEntrant =
        match.entrant3.voters.first.includes(userId1) &&
        match.entrant3.voters.second.includes(userId2) &&
        match.entrant1.voters.first.includes(userId2) &&
        match.entrant1.voters.second.includes(userId1);

      var MixThirdSecondInEntrant =
        match.entrant3.voters.first.includes(userId1) &&
        match.entrant3.voters.second.includes(userId2) &&
        match.entrant2.voters.first.includes(userId2) &&
        match.entrant2.voters.second.includes(userId1);

      if (userOneCompeted && userTwoCompeted) {
        maxWeight += 3;
        matchCount += 1;
      }

      if (firstInEntrant1 || firstInEntrant2 || firstInEntrant3) {
        totalWeight += 2;
        firstWeight += 1;
      }

      if (secondInEntrant1 || secondInEntrant2 || secondInEntrant3) {
        totalWeight += 1;
        secondWeight += 1;
      }

      if (
        MixFirstSecondInEntrant ||
        MixFirstThirdInEntrant ||
        MixSecondFirstInEntrant ||
        MixSecondThirdInEntrant ||
        MixThirdFirstInEntrant ||
        MixThirdSecondInEntrant
      ) {
        partialMatch += 1;
      }

      if (
        !firstInEntrant1 &&
        !firstInEntrant2 &&
        !firstInEntrant3 &&
        !secondInEntrant1 &&
        !secondInEntrant2 &&
        !secondInEntrant3 &&
        !MixFirstSecondInEntrant &&
        !MixFirstThirdInEntrant &&
        !MixSecondFirstInEntrant &&
        !MixSecondThirdInEntrant &&
        !MixThirdFirstInEntrant &&
        !MixThirdSecondInEntrant &&
        userOneCompeted &&
        userTwoCompeted
      ) {
        disagreementWeight += 1;
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
    firstWeight,
    secondWeight,
    partialMatch,
    maxWeight,
    iterations,
    disagreementWeight,
    matchCount,
  };

  return usersCompatibility;
}

function compareTripleUsersAndReturnMostCompatible(
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
  let firstWeight = 0;
  let secondWeight = 0;
  let maxWeight = 0;
  let iterations = 0;
  let disagreementWeight = 0;
  let matchCount = 0;
  var partialMatch = 0;

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
      var userOneCompeted =
        match.entrant1.voters.first.includes(userId1) ||
        match.entrant1.voters.second.includes(userId1) ||
        match.entrant2.voters.first.includes(userId1) ||
        match.entrant2.voters.second.includes(userId1) ||
        match.entrant3.voters.first.includes(userId1) ||
        match.entrant3.voters.second.includes(userId1);

      if (userOneCompeted) {
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
      if (match.progress == "complete") {
        iterations += 1;
        var userOneCompeted =
          match.entrant1.voters.first.includes(userId1) ||
          match.entrant1.voters.second.includes(userId1) ||
          match.entrant2.voters.first.includes(userId1) ||
          match.entrant2.voters.second.includes(userId1) ||
          match.entrant3.voters.first.includes(userId1) ||
          match.entrant3.voters.second.includes(userId1);

        var userTwoCompeted =
          match.entrant1.voters.first.includes(voter) ||
          match.entrant1.voters.second.includes(voter) ||
          match.entrant2.voters.first.includes(voter) ||
          match.entrant2.voters.second.includes(voter) ||
          match.entrant3.voters.first.includes(voter) ||
          match.entrant3.voters.second.includes(voter);

        var firstInEntrant1 =
          match.entrant1.voters.first.includes(userId1) &&
          match.entrant1.voters.first.includes(voter);
        var firstInEntrant2 =
          match.entrant2.voters.first.includes(userId1) &&
          match.entrant2.voters.first.includes(voter);
        var firstInEntrant3 =
          match.entrant3.voters.first.includes(userId1) &&
          match.entrant3.voters.first.includes(voter);

        var secondInEntrant1 =
          match.entrant1.voters.second.includes(userId1) &&
          match.entrant1.voters.second.includes(voter);
        var secondInEntrant2 =
          match.entrant2.voters.second.includes(userId1) &&
          match.entrant2.voters.second.includes(voter);
        var secondInEntrant3 =
          match.entrant3.voters.second.includes(userId1) &&
          match.entrant3.voters.second.includes(voter);

        var MixFirstSecondInEntrant =
          match.entrant1.voters.first.includes(userId1) &&
          match.entrant1.voters.second.includes(voter) &&
          match.entrant2.voters.first.includes(voter) &&
          match.entrant2.voters.second.includes(userId1);

        var MixFirstThirdInEntrant =
          match.entrant1.voters.first.includes(userId1) &&
          match.entrant1.voters.second.includes(voter) &&
          match.entrant3.voters.first.includes(voter) &&
          match.entrant3.voters.second.includes(userId1);

        var MixSecondFirstInEntrant =
          match.entrant2.voters.first.includes(userId1) &&
          match.entrant2.voters.second.includes(voter) &&
          match.entrant1.voters.first.includes(voter) &&
          match.entrant1.voters.second.includes(userId1);

        var MixSecondThirdInEntrant =
          match.entrant2.voters.first.includes(userId1) &&
          match.entrant2.voters.second.includes(voter) &&
          match.entrant3.voters.first.includes(voter) &&
          match.entrant3.voters.second.includes(userId1);

        var MixThirdFirstInEntrant =
          match.entrant3.voters.first.includes(userId1) &&
          match.entrant3.voters.second.includes(voter) &&
          match.entrant1.voters.first.includes(voter) &&
          match.entrant1.voters.second.includes(userId1);

        var MixThirdSecondInEntrant =
          match.entrant3.voters.first.includes(userId1) &&
          match.entrant3.voters.second.includes(voter) &&
          match.entrant2.voters.first.includes(voter) &&
          match.entrant2.voters.second.includes(userId1);

        if (userOneCompeted && userTwoCompeted) {
          maxWeight += 3;
          matchCount += 1;
        }

        if (firstInEntrant1 || firstInEntrant2 || firstInEntrant3) {
          totalWeight += 2;
          firstWeight += 1;
        }

        if (secondInEntrant1 || secondInEntrant2 || secondInEntrant3) {
          totalWeight += 1;
          secondWeight += 1;
        }

        if (
          MixFirstSecondInEntrant ||
          MixFirstThirdInEntrant ||
          MixSecondFirstInEntrant ||
          MixSecondThirdInEntrant ||
          MixThirdFirstInEntrant ||
          MixThirdSecondInEntrant
        ) {
          partialMatch += 1;
        }

        if (
          !firstInEntrant1 &&
          !firstInEntrant2 &&
          !firstInEntrant3 &&
          !secondInEntrant1 &&
          !secondInEntrant2 &&
          !secondInEntrant3 &&
          !MixFirstSecondInEntrant &&
          !MixFirstThirdInEntrant &&
          !MixSecondFirstInEntrant &&
          !MixSecondThirdInEntrant &&
          !MixThirdFirstInEntrant &&
          !MixThirdSecondInEntrant &&
          userOneCompeted &&
          userTwoCompeted
        ) {
          disagreementWeight += 1;
        }
      }
    }

    if (parseInt(userPercent) !== "NaN" && userPercent !== "") {
      if (
        (parseInt(matchCount) / parseInt(instigatorBattleTotal)) * 100 <
        Math.ceil(parseInt(userPercent))
      ) {
        //console.log("We got here");
        totalWeight = 0;
        matchCount = 0;
        maxWeight = 0;
        iterations = 0;
        firstWeight = 0;
        partialMatch = 0;
        secondWeight = 0;
        disagreementWeight = 0;
        continue inner;
      }
    }

    var partialMatchWeight = parseInt(partialMatch) / 2;
    var weightMinusDisagreements =
      parseInt(totalWeight) - parseInt(disagreementWeight);

    weightMinusDisagreements += partialMatchWeight;

    var userCompatPercent = Math.ceil(
      (parseInt(weightMinusDisagreements) / parseInt(maxWeight)) * 100
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
        firstWeight,
        secondWeight,
        partialMatch,
        maxWeight,
        iterations,
        disagreementWeight,
        matchCount,
        userCompatPercent
      });
      tiedValues = 0;
    } else if (highestComapatValue == userCompatPercent && isUserInServer) {
      tiedValues += 1;

      topCompatibility.push({
        userId1,
        voter,
        totalWeight,
        firstWeight,
        secondWeight,
        partialMatch,
        maxWeight,
        iterations,
        disagreementWeight,
        matchCount,
        userCompatPercent
      });
    }
    totalWeight = 0;
    matchCount = 0;
    maxWeight = 0;
    iterations = 0;
    firstWeight = 0;
    partialMatch = 0;
    secondWeight = 0;
    disagreementWeight = 0;

    // function calculateMaxScore(iterations) {
    //   return iterations * 2 + iterations;
    // }
    //console.log(topCompatibility);
  }
  return topCompatibility;
}

function CreateTripleHighestCompatDiscordEmbed(
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
          value: String(usersCompatibility.disagreementWeight) + " times",
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
      )
      .setColor(colour)
      .setFooter({
        text: "Supradarky's VGM Club",
        iconURL:
          "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016",
      })
  );
}
