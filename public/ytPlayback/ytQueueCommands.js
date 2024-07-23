const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const QueueManager = require(path.join(
  require.main.path,
  "public",
  "ytPlayback",
  "queueManager"
));

function AddSongsToQueue(queueStruct, newSongs) {
  // Ensure newSongs is always an array
  var queue = queueStruct.songs;
  if (!Array.isArray(newSongs)) {
    newSongs = [newSongs];
  }

  distributeSongsFairly(queue, newSongs);
}

function extractPlaylistId(url) {
  try {
    const parsedUrl = new URL(url);
    const queryParams = parsedUrl.searchParams;
    const playlistId = queryParams.get("list"); // 'list' is the query parameter for playlist IDs

    if (playlistId) {
      return playlistId;
    } else {
      throw new Error("Playlist ID not found in URL");
    }
  } catch (error) {
    console.error(`Error extracting playlist ID: ${error}`);
    return null; // Or handle the error as appropriate for your application
  }
}

function distributeSongsFairly(queue, newSongs) {
  // Ensure newSongs is an array
  if (!Array.isArray(newSongs)) newSongs = [newSongs];

  const newUserId = newSongs[0].user; // Assuming all newSongs have the same user
  var newOrderedArray = queue;
  var indexDrift = 0;

  var newUserIdCount = getOccurrence(queue, newUserId);
  var users = [];

  outer: for (var i = 0; i < queue.length; i++) {
    if (newSongs.length < 1) {
      break outer;
    }
    let userIndex = users.findIndex((user) => user.name == queue[i].user);
    if (userIndex == -1 && queue[i].user !== newUserId) {
      // User is not in the array, add them with count 1
      users.push({ name: queue[i].user, count: 1 });
    } else {
      // User is already in the array, increment their count
      if (queue[i].user !== newUserId) {
        if (parseInt(users[userIndex].count) > parseInt(newUserIdCount)) {
          var songToAdd = newSongs.shift();
          newOrderedArray.splice(i + indexDrift, 0, songToAdd);
          indexDrift += 1;
          newUserIdCount += 1;
        }
        users[userIndex].count += 1;
      }
    }
  }
  if (newSongs.length > 0) {
    newOrderedArray.push(...newSongs);
  }

  queue = newOrderedArray;
}

function getOccurrence(array, value) {
  var count = 0;
  array.forEach((v) => v.user == value && count++);
  return count;
}
