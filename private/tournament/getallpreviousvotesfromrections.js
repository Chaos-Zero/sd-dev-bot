const Discord = require("discord.js");
const sleep = require("util").promisify(setTimeout);

class RoundVoteResults {
  constructor(name = "", count = "") {
    this.emojiName = name;
    this.emojiCount = count;
    this.users = [];
  }
}

async function GetAllMessages(bot, channel, messageArray) {
  return new Promise(async (resolve1) => {
    channel.messages.fetch({ limit: 100 }).then((messages) => {
      console.log(`Received ${messages.size} messages`);
      //Iterate through the messages here with the variable "messages".
      messages.forEach((message) => messageArray.unshift(message));
      resolve1(messageArray);
    });
  });
}

async function GetMessageReactionsFromPrev(
  message,
  roundVoteResultsCollection
) {
  //let info =
  return new Promise(async (resolve) => {
    let reactions = await message.reactions.cache;
    reactions = reactions.toJSON();
    //console.log("Let's see them reactions: " + reactions);
    for (var i = 0; i < reactions.length; i++) {
      let roundVoteResults = new RoundVoteResults();
      const reactionUsers = await reactions[i].users.fetch();
      const reactionUsersArray = Array.from(reactionUsers.keys());

      roundVoteResults.emojiName = reactions[i].emoji.name;
      //console.log("We got this name" + reactions[i].emoji.name);
      roundVoteResults.emojiCount = reactions[i].count;
      //console.log("We got this many reactions: " + reactions[i].count);
      //console.log("The group of users: " + reactionUsersArray);

      for (var j = 0; j < reactionUsersArray.length; j++) {
        //console.log("The name: " + reactionUsersArray[j]);
        if (reactionUsersArray[j] !== process.env.BOT_ID) {
          roundVoteResults.users.push(reactionUsersArray[j]);
        }
        //console.log("What" + roundVoteResults);
      }
      //console.log("We got these results: " + roundVoteResults.users[0]);
      roundVoteResultsCollection.push(roundVoteResults);
    }
    resolve(roundVoteResultsCollection);
  });
}

function CalculateReactionPoints(populatedDb, reactionDetails) {
  //[{emojiName, emojiCount, users: []}]
  // 1 = A + 2, B + 1
  // 2 = A + 2 ,C + 1
  // 3 = B + 2, A + 1
  // 4 = B + 2, C + 1
  // 5 = C + 2, A + 1
  // 6 = C + 2, B + 1
  var localReactionDetails = reactionDetails;
  var entry1Tally = 0,
    entry2Tally = 0,
    entry3Tally = 0;
  var votedAFirst = [];
  var votedASecond = [];
  var didNotVoteA = [];
  var votedBFirst = [];
  var votedBSecond = [];
  var didNotVoteB = [];
  var votedCFirst = [];
  var votedCSecond = [];
  var didNotVoteC = [];

  console.log("Reactions object: " + reactionDetails[0].users);
  // All voters
  var listOfVoters = [];

  for (var i = 0; i < localReactionDetails.length; i++) {
    listOfVoters.push.apply(listOfVoters, localReactionDetails[i].users);
  }
  // All Duplicate voter ids
  var duplicateUsers = returnDuplicateEntries(listOfVoters);

  var filteredDetails = [];
  var filteredReactionDetails = [];

  for (var i = 0; i < localReactionDetails.length; i++) {
    //var count = parseInt(localReactionDetails[i].users.length);
    for (const user of duplicateUsers) {
      localReactionDetails[i].users = localReactionDetails[i].users.filter(
        (item) => item !== user
      );
    }
    localReactionDetails[i].emojiCount = localReactionDetails[i].users.length;
  }

  //console.log("Length: " + reactionDetails);
  for (var i = 0; i < localReactionDetails.length; i++) {
    console.log(localReactionDetails[i].users);
    switch (localReactionDetails[i].emojiName) {
      case "1️⃣":
        entry1Tally += parseInt(localReactionDetails[i].emojiCount) * 2;
        entry2Tally += parseInt(localReactionDetails[i].emojiCount);

        votedAFirst.push.apply(votedAFirst, localReactionDetails[i].users);
        votedBSecond.push.apply(votedBSecond, localReactionDetails[i].users);
        didNotVoteC.push.apply(didNotVoteC, localReactionDetails[i].users);
        for (var user of localReactionDetails[i].users) {
          UpdateVotesToday(populatedDb, 1, user, "A>B>C");
        }
        break;
      case "2️⃣":
        entry1Tally += parseInt(localReactionDetails[i].emojiCount) * 2;
        entry3Tally += parseInt(localReactionDetails[i].emojiCount);

        votedAFirst.push.apply(votedAFirst, localReactionDetails[i].users);
        votedCSecond.push.apply(votedCSecond, localReactionDetails[i].users);
        didNotVoteB.push.apply(didNotVoteB, localReactionDetails[i].users);
        for (var user of localReactionDetails[i].users) {
          UpdateVotesToday(populatedDb, 1, user, "A>C>B");
        }
        break;
      case "3️⃣":
        entry2Tally += parseInt(localReactionDetails[i].emojiCount) * 2;
        entry1Tally += parseInt(localReactionDetails[i].emojiCount);

        votedBFirst.push.apply(votedBFirst, localReactionDetails[i].users);
        votedASecond.push.apply(votedASecond, localReactionDetails[i].users);
        didNotVoteC.push.apply(didNotVoteC, localReactionDetails[i].users);
        for (var user of localReactionDetails[i].users) {
          UpdateVotesToday(populatedDb, 1, user, "B>A>C");
        }
        break;
      case "4️⃣":
        entry2Tally += parseInt(localReactionDetails[i].emojiCount) * 2;
        entry3Tally += parseInt(localReactionDetails[i].emojiCount);

        votedBFirst.push.apply(votedBFirst, localReactionDetails[i].users);
        votedCSecond.push.apply(votedCSecond, localReactionDetails[i].users);
        didNotVoteA.push.apply(didNotVoteA, localReactionDetails[i].users);
        for (var user of localReactionDetails[i].users) {
          UpdateVotesToday(populatedDb, 1, user, "B>C>A");
        }
        break;
      case "5️⃣":
        entry3Tally += parseInt(localReactionDetails[i].emojiCount) * 2;
        entry1Tally += parseInt(localReactionDetails[i].emojiCount);

        votedCFirst.push.apply(votedCFirst, localReactionDetails[i].users);
        votedASecond.push.apply(votedASecond, localReactionDetails[i].users);
        didNotVoteB.push.apply(didNotVoteB, localReactionDetails[i].users);
        for (var user of localReactionDetails[i].users) {
          UpdateVotesToday(populatedDb, 1, user, "C>A>B");
        }
        break;
      case "6️⃣":
        entry3Tally += parseInt(localReactionDetails[i].emojiCount) * 2;
        entry2Tally += parseInt(localReactionDetails[i].emojiCount);

        votedCFirst.push.apply(votedCFirst, localReactionDetails[i].users);
        votedBSecond.push.apply(votedBSecond, localReactionDetails[i].users);
        didNotVoteA.push.apply(didNotVoteA, localReactionDetails[i].users);
        for (var user of localReactionDetails[i].users) {
          UpdateVotesToday(populatedDb, 1, user, "C>B>A");
        }
        break;
    }
  }
  console.log("Who voted for c first: " + votedCFirst);
  var votesForA = {
    first: votedAFirst,
    second: votedASecond,
    last: didNotVoteA,
  };
  var votesForB = {
    first: votedBFirst,
    second: votedBSecond,
    last: didNotVoteB,
  };
  var votesForC = {
    first: votedCFirst,
    second: votedCSecond,
    last: didNotVoteC,
  };
  var votesPerGame = [votesForA, votesForB, votesForC];

  console.log("Tallys: " + entry1Tally + " " + entry2Tally + " " + entry3Tally);
  let returnValue = [
    { 0: entry1Tally, 1: entry2Tally, 2: entry3Tally },
    votesPerGame,
  ];
  console.log("Previous days points during promise: " + returnValue);
  return returnValue;
}

async function GetVotesFromPreviousMessages(bot, db, populatedDb, channel) {
  var messages = [];

  await GetAllMessages(bot, channel, messages).then(async (messages) => {
    var allRoundVoteResultsCollection = [];
    for (var i = 0; i < messages.length; i++) {
      
      populatedDb.map((item) => {
      if (parseInt(item.round) == 1) {
        console.log("Previous votes: " + item.votedToday)
        item.votedToday = [];
      }
    });
      
      console.log("Address message number " + i);
      var nthDbIndex = i;
      var roundVoteResultsCollection = [];
      await GetMessageReactionsFromPrev(
        messages[i],
        roundVoteResultsCollection
      ).then(async (roundVoteResultsCollection) => {
        await sleep(10000);
        var formattedPoints = CalculateReactionPoints(populatedDb,
          roundVoteResultsCollection
        );
        console.log("Before the method, index num: " + nthDbIndex);
        UpdateBattleResults(db, formattedPoints, nthDbIndex).then(
          (battleWinnerIndex) => {
            //AddToNextRound(db, nthDbIndex, battleWinnerIndex);
          }
        );

        //allRoundVoteResultsCollection.push(formattedPoints)
      });
    }
    console.log("Mission complete!");
  });
}

async function UpdateBattleResults(db, assignments, dbNthIndex) {
  // bestvgm2022awards
  var promise = new Promise((resolve) => {
    console.log("Index coming through: " + parseInt(dbNthIndex));

    // bestvgm2022awards
    var battleWinnerTotal = 0;
    var battleWinnerIndex = 0;
    for (var i = 0; i < assignments[1].length; i++) {
      console.log("assignments[1].length   " + assignments[1].length);
      var nthRound = parseInt(dbNthIndex) * 3 + i;
      if (Object.values(assignments[0])[i] > battleWinnerTotal) {
        battleWinnerIndex = i;
        battleWinnerTotal = Object.values(assignments[0])[i];
      }
      console.log("Round to write to: " + nthRound);
      console.log("Writing entry: " + i);
      var points = Object.values(assignments[0])[i];
      var usersFirst = assignments[1][i].first;
      var usersSecond = assignments[1][i].second;
      var usersThird = assignments[1][i].last;
      console.log("Points: " + points);
      console.log("usersFirst: " + usersFirst);
      console.log("usersSecond: " + usersSecond);
      console.log("usersThird: " + usersThird);

      db.get(process.env.TOURNAMENT_NAME)
        .find({ round: 1 })
        .get("entries")
        // Need to match on index here
        .nth(parseInt(nthRound))
        .assign({
          points: points,
          hasTakenPlace: true,
          usersFirstPick: usersFirst,
          usersSecondPick: usersSecond,
          usersDidNotPlace: usersThird,
        })
        .write();
    }
    /*await sleep(4000);
  var winnerIndex = parseInt(dbNthIndex) * 3 + parseInt(battleWinnerIndex);
  let dbWinnerEntry = db
    .get(process.env.TOURNAMENT_NAME)
    .find({ round: 1 })
    .get("entries")
    // Need to match on index here
    .nth(parseInt(winnerIndex))
    .value();
  await sleep(800);
  
  console.log("Our battle number" + (parseInt(dbWinnerEntry.battle) + 1));
  var battleNumber =
    parseInt(dbWinnerEntry.battle) < 3
      ? 1
      : Math.ceil((parseInt(dbWinnerEntry.battle)) / 3);

  dbWinnerEntry.battle = battleNumber;
  dbWinnerEntry.points = 0;
  dbWinnerEntry.hasTakenPlace = false;
  dbWinnerEntry.usersFirstPick = [];
  dbWinnerEntry.usersSecondPick = [];
  dbWinnerEntry.usersDidNotPlace = [];

  console.log(dbWinnerEntry);

  entriesArray.push(dbWinnerEntry);
    let dbWinnerWrite = db
    .get(process.env.TOURNAMENT_NAME)
    .find({ round: 2 })
    .get("entries")
    .assign(entriesArray).write();
  await sleep(500);*/
    resolve(battleWinnerIndex);
  });
  return promise;
}

async function AddToNextRound(db, dbNthIndex, battleWinnerIndex) {
  let entriesArray = db
    .get(process.env.TOURNAMENT_NAME)
    .find({ round: 2 })
    .get("entries")
    .value();

  var winnerIndex =
    (parseInt(dbNthIndex) - 1) * 3 + parseInt(battleWinnerIndex);
  let dbWinnerEntry = db
    .get(process.env.TOURNAMENT_NAME)
    .find({ round: 1 })
    .get("entries")
    // Need to match on index here
    .nth(parseInt(winnerIndex))
    .value();
  await sleep(800);

  console.log("Our battle number" + (parseInt(dbWinnerEntry.battle) + 1));
  var battleNumber =
    parseInt(dbWinnerEntry.battle) < 3
      ? 1
      : Math.ceil(parseInt(dbWinnerEntry.battle) / 3);
  var entryToInsert = {
    name: dbWinnerEntry.name,
    link: dbWinnerEntry.link,
    battle: battleNumber,
    points: 0,
    hasTakenPlace: false,
    usersFirstPick: [],
    usersSecondPick: [],
    usersDidNotPlace: [],
  };

  entriesArray.push(entryToInsert);
  let dbWinnerWrite = db
    .get(process.env.TOURNAMENT_NAME)
    .find({ round: 2 })
    .get("entries")
    .assign(entriesArray)
    .write();
  await sleep(800);
}

function UpdateVotesToday(populatedDb, roundNumber, userId, userVote) {
  populatedDb.map((item) => {
    if (item.round == roundNumber) {
      const userFoundIndex = item.votedToday.findIndex(
        (el) => el.memberId == userId
      );

      if (userFoundIndex >= 0) {
        item.votedToday[userFoundIndex].vote = userVote;
      } else {
        item.votedToday.push({
          memberId: userId,
          vote: userVote,
        });
      }
    }
  });
}
/*
      points: Object.values(previousDaysPoints[0])[i],
      hasTakenPlace: true,
      usersFirstPick: previousDaysPoints[1][i].first,
      usersSecondPick: previousDaysPoints[1][i].second,
      usersDidNotPlace: previousDaysPoints[1][i].last,
*/
