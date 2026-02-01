// Required Declarations
const axios = require("axios");
const { Client, RichEmbed } = require("discord.js");
const sleep = require("util").promisify(setTimeout);
const Discord = require("discord.js");

//var FileSync = require("lowdb/adapters/FileSync");
//var adapter = new FileSync(".data/db.json");
//var low = require("lowdb");
//var db = low(adapter);

function returnDuplicateEntries(entries) {
  var duplicates = entries.reduce(function (acc, el, i, arr) {
    if (arr.indexOf(el) !== i && acc.indexOf(el) < 0) acc.push(el);
    return acc;
  }, []);

  return duplicates;
}

async function getTestModeChannelOverride(guild) {
  try {
    if (typeof GetDb !== "function") {
      return null;
    }
    const db = GetDb();
    await db.read();
    const testMode = db.get("tournaments[0].testMode").value();
    if (!testMode || testMode.enabled !== true) {
      return null;
    }
    let channel = null;
    if (testMode.channelId) {
      channel = guild.channels.cache.get(testMode.channelId) || null;
    }
    if (!channel && testMode.channelName) {
      channel = guild.channels.cache.find(
        (ch) => ch.name === testMode.channelName
      );
    }
    return channel || null;
  } catch (error) {
    return null;
  }
}

async function GetChannelByName(guild, channelString) {
  const overrideChannel = await getTestModeChannelOverride(guild);
  if (overrideChannel) {
    return overrideChannel;
  }
  const channel = await guild.channels.cache.find(
    (ch) => ch.name === channelString
  );
  return await channel;
}

async function GetTournamentChannel(
  guild,
  tournamentChannelId,
  tournamentChannelName
) {
  const overrideChannel = await getTestModeChannelOverride(guild);
  if (overrideChannel) {
    return overrideChannel;
  }
  let channel = null;
  if (tournamentChannelId) {
    channel = guild.channels.cache.get(tournamentChannelId) || null;
  }
  if (!channel && tournamentChannelName) {
    channel = guild.channels.cache.find(
      (ch) => ch.name === tournamentChannelName
    );
  }
  if (!channel && process.env.TOURNAMENT_CHANNEL) {
    channel =
      guild.channels.cache.find(
        (ch) => ch.name === process.env.TOURNAMENT_CHANNEL
      ) || null;
  }
  return channel;
}

async function GetLastMessageInChannel(channel) {
  let lastMessages = await channel.messages.fetch({ limit: 2 });
  // this is the last message sent before this command
  //console.log("Last Message: " + lastMessages.first().content);
  return await lastMessages.first();
}

async function GetLastMessageDetailsFromChannelName(
  channelString,
  guild,
  roundVoteResultsCollection
) {
  return new Promise((resolve) => {
    GetChannelByName(guild, channelString).then((channel) => {
      GetLastMessageInChannel(channel).then(async (lastMessage) => {
        await GetMessageReactions(lastMessage, roundVoteResultsCollection);
      });
    });
    resolve();
  });
}

function GetTimeInEpochStamp(hoursToAdd = 0) {
  var date = new Date(); // Generic JS date object
  var unixDate = Math.floor(date.getTime() / 1000) + 60 * 60 * hoursToAdd;
  return unixDate.toString();
}

function GetNextScheduleEpochFromSettings(time, includeWeekends) {
  const safeTime = typeof time === "string" && time.includes(":") ? time : "19:00";
  const [hourStr, minuteStr] = safeTime.split(":");
  let hour = Number(hourStr);
  let minute = Number(minuteStr);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    hour = 19;
    minute = 0;
  }
  const now = new Date();
  let candidate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      0,
      0
    )
  );
  if (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  if (!includeWeekends) {
    while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
      candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    }
  }
  return Math.floor(candidate.getTime() / 1000);
}

function GetNextTournamentScheduleEpoch() {
  const db = GetDb();
  db.read();
  const tournamentRoot = db.get("tournaments").nth(0).value() || {};
  const scheduleTime = tournamentRoot.tournamentPostTime || "19:00";
  const includeWeekends = tournamentRoot.tournamentIncludeWeekends === true;
  return GetNextScheduleEpochFromSettings(scheduleTime, includeWeekends);
}

async function downloadFile(url) {
  console.log("Downloading file from URL:", url);
  try {
    const response = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
      timeout: 10000, // 10 seconds timeout, adjust as needed
    });

    return response.data;
  } catch (error) {
    console.error("Failed to download file:", error.message);
    throw error;
  }
}
