const Discord = require("discord.js");
const fs = require("fs");
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/collections/roles.js") + "");

async function HandleAddPointsReactions(reactionId, messageAuthorId) {
  var db = GetDb();
  await db.read();

  let gamesDetails = await db.get("guessingGame").nth(0).value();

  var userPoints = gamesDetails.currentGamePoints;

  var pointValue = 0;

  switch (reactionId) {
    case pointEmotes["two"]:
      pointValue += 2;
      break;
    case pointEmotes["one"]:
      pointValue += 1;
      break;
    case pointEmotes["half"]:
      pointValue += 0.5;
      break;
    case pointEmotes["quarter"]:
      pointValue += 0.25;
      break;
    case pointEmotes["tenth"]:
      pointValue += 0.1;
      break;
  }

  let userIndex = userPoints.findIndex((user) => user.id == messageAuthorId);

  if (userIndex == -1) {
    // User is not in the array, add them with count 1
    userPoints.push({ id: messageAuthorId, count: pointValue });
  } else {
    userPoints[userIndex].count += pointValue;
  }

  await db.get("guessingGame").nth(0).assign(gamesDetails).write();
}

async function HandleRemovePointsReactions(reactionId, messageAuthorId) {
  var db = GetDb();
  await db.read();

  let gamesDetails = await db.get("guessingGame").nth(0).value();

  var userPoints = gamesDetails.currentGamePoints;

  var pointValue = 0;

  switch (reactionId) {
    case pointEmotes["two"]:
      pointValue += 2;
      break;
    case pointEmotes["one"]:
      pointValue += 1;
      break;
    case pointEmotes["half"]:
      pointValue += 0.5;
      break;
    case pointEmotes["quarter"]:
      pointValue += 0.25;
      break;
    case pointEmotes["tenth"]:
      pointValue += 0.1;
      break;
  }

  let userIndex = userPoints.findIndex((user) => user.id == messageAuthorId);

  if (userIndex == -1) {
    // User is not in the array, add them with count 1
    return;
  } else {
    userPoints[userIndex].count -= pointValue;
  }

  await db.get("guessingGame").nth(0).assign(gamesDetails).write();
}
