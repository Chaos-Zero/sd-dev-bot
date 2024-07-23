const Discord = require("discord.js");
const { EmbedBuilder } = require("discord.js");
const { Worker } = require("worker_threads");
const fs = require("fs");
eval(fs.readFileSync("./public/main.js") + "");
const path = require("path");

class QueueManager {
  constructor() {
    this.queues = {};
    this.initializeWorker();
  }

  initializeWorker() {
    this.worker = new Worker(path.resolve(__dirname, "./queueWorker.js"));
    this.worker.on("message", (message) => {
      if (message.action == "updateQueue") {
        console.log("Queue is updating");
        const { guildId, songs } = message;
        console.log("Here's the id: " + guildId);
        if (this.queues[guildId]) {
          this.queues[guildId].songs = songs;
          console.log(`Queue updated for guild ${guildId}`);
        }
      }
    });
  }

  getQueue(guildId) {
    if (!this.queues[guildId]) {
      this.queues[guildId] = {
        guildId: guildId,
        currentlyPlaying: null,
        currentlyPlayingStartTime: null,
        currentlyPlayingEmbed: null,
        songs: [],
        connection: null,
        player: null,
        textChannel: null,
        voiceChannel: null,
        progressInterval: null, // Store the interval ID for updating the embed,
      };
    }
    return this.queues[guildId];
  }
  
  async addSongsToQueue(guildId, newSongs) {
    // Assuming newSongs is either a single song object or an array of song objects
    // Make sure newSongs is always an array for consistency
    const songsArray = Array.isArray(newSongs) ? newSongs : [newSongs];

    const simplifiedSongs = songsArray.map((song) => ({
      url: song.url,
      title: song.title, // Assuming you're using the title
      user: song.user, // ID of the user who added the song
      duration: song.duration, // Duration in seconds
      hidden: song.hidden, // Whether the song is hidden
    }));

    // Log the data being sent to the worker for inspection
    console.log("Sending to worker:", {
      action: "addSongsToQueue",
      guildId: guildId,
      currentSongs: this.getQueue(guildId).songs,
      newSongs: simplifiedSongs,
    });

    this.worker.postMessage({
      action: "addSongsToQueue",
      guildId: guildId,
      currentSongs: this.getQueue(guildId).songs,
      newSongs: simplifiedSongs,
    });
  }


  deleteQueue(guildId) {
    //var queue = this.getQueue(guildId);
    //queue.textChannel.setTopic(
    //  `Start music playback and other music player options here!`
    //);
    // Log any errors
    delete this.queues[guildId];
  }

  async startProgressUpdate(guildId) {
    console.log("Updating message");
    const queue = this.getQueue(guildId);

    var db = GetDb();
    await db.read();
    let gamesDetails = await db.get("guessingGame").nth(0).value();

    if (queue.progressInterval) clearInterval(queue.progressInterval);
    
    if (!queue.currentlyPlaying.duration) {
      clearInterval(queue.progressInterval);
      queue.progressInterval = null;
      if (queue.currentlyPlayingEmbed) {
        var descript = !gamesDetails.isGameRunning
          ? `✅ **${queue.currentlyPlaying.title}**`
          : `Guessing Game Track`;
        queue.currentlyPlayingEmbed.edit(
          new EmbedBuilder()
            .setTitle("Playback Finished")
            .setDescription(descript)
        );
      }
      clearInterval(clearInterval(queue.progressInterval));
      return;
    }

    queue.progressInterval = setInterval(() => {
      const elapsedTime = Math.floor(
        (Date.now() - queue.currentlyPlayingStartTime) / 1000
      );
      const remainingTime = queue.currentlyPlaying.duration - elapsedTime;
      if (queue.currentlyPlayingEmbed) {
        if (remainingTime <= 0) {
          clearInterval(queue.progressInterval);
          queue.progressInterval = null;
          if (queue.currentlyPlayingEmbed) {
            var descript = !gamesDetails.isGameRunning
              ? `✅ **${queue.currentlyPlaying.title}**`
              : `Guessing Game Track`;
            queue.currentlyPlayingEmbed.edit(
              new EmbedBuilder()
                .setTitle("Playback Finished")
                .setDescription(descript)
            );
          }
          return;
        }

        const progressBar = this.generateProgressBar(elapsedTime, guildId);
        if (queue.currentlyPlayingEmbed) {
          var title = insertNewLines(queue.currentlyPlaying.title);
          var descriptionText = !gamesDetails.isGameRunning
            ? `🎶 **[${title}](${queue.currentlyPlaying.url})**`
            : `🎶 **Guessing Game Track**`;
          var embedToSend = new EmbedBuilder()
            .setTitle("Now Playing")
            .setDescription(descriptionText)
            .setColor("#6c25be")
            .addFields({
              name: "Progress",
              value: progressBar,
              inline: false,
            });

          if (queue.songs.length > 0 && !gamesDetails.isGameRunning) {
            embedToSend.setFooter({
              text: "Up next: " + trimStringTo45(queue.songs[0].title),
              iconURL:
                "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Next.png?v=1708342497115",
            });
          }

          queue.currentlyPlayingEmbed
            .edit({
              embeds: [embedToSend],
            })
            .catch((err) => {
              console.error("The Embed cannot be found:", err);
              clearInterval(clearInterval(queue.progressInterval));
            });
        }
      }
    }, 3000); // Update every 3 seconds
  }

  generateProgressBar(elapsedTime, guildId) {
    const queue = this.getQueue(guildId);
    const totalBars = 20;
    var elapsedBars;

    try {
      // Check if the remaining time is less than or equal to 10 seconds
      if (queue.currentlyPlaying.duration - elapsedTime <= 10) {
        // Fill the whole area
        elapsedBars = totalBars;
      } else {
        // Calculate normally
        elapsedBars = Math.floor(
          (elapsedTime / queue.currentlyPlaying.duration) * totalBars
        );
      }

      const remainingBars = totalBars - elapsedBars;
      return (
        "▶️" +
        "█".repeat(elapsedBars) +
        "▁".repeat(remainingBars) +
        " " +
        " `[" +
        formatTime(elapsedTime) +
        "/" +
        formatTime(queue.currentlyPlaying.duration) +
        "]`"
      );
    } catch {
      return "⏹️ Stopped - **Thank you for listening.**";
    }
  }

  async createPlayingEmbed(guildId, song) {
    const queue = this.getQueue(guildId);

    var db = GetDb();
    await db.read();
    let gamesDetails = await db.get("guessingGame").nth(0).value();

    const elapsedTime = Math.floor(
      (Date.now() - queue.currentlyPlayingStartTime) / 1000
    );

    const remainingTime = song.duration - elapsedTime;

    if (remainingTime <= 0) {
      clearInterval(queue.progressInterval);
      queue.progressInterval = null;
      if (queue.currentlyPlayingEmbed) {
        var descript = !gamesDetails.isGameRunning
          ? `✅ **${queue.currentlyPlaying.title}**`
          : `Guessing Game Track`;
        return new EmbedBuilder()
          .setTitle("Playback Finished")
          .setDescription(descript);
      }
    }

    const progressBar = this.generateProgressBar(elapsedTime, guildId);

    var title = insertNewLines(queue.currentlyPlaying.title);

    var descriptionText = !gamesDetails.isGameRunning
      ? `🎶 **[${title}](${queue.currentlyPlaying.url})**`
      : `🎶 **Guessing Game Track**`;
    var embedToSend = new EmbedBuilder()
      .setTitle("Now Playing")
      .setDescription(descriptionText)
      .setColor("#6c25be")
      .addFields({ name: "Progress", value: progressBar, inline: false });

    if (queue.songs.length > 0 && !gamesDetails.isGameRunning) {
      embedToSend.setFooter({
        text: "Up next: " + trimStringTo45(queue.songs[0].title),
        iconURL:
          "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Next.png?v=1708342497115",
      });
    }
    return embedToSend;
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function insertNewLines(str) {
  const words = str.split(" ");
  let currentLine = "";
  let result = "";

  words.forEach((word) => {
    if ((currentLine + word).length > 45) {
      // When adding a new word exceeds the limit, start a new line
      result += currentLine.trim() + "\n";
      currentLine = word + " "; // Start new line with current word
    } else {
      // Add word to current line
      currentLine += word + " ";
    }
  });

  // Add any remaining text not yet added to the result
  result += currentLine.trim();
  return result;
}

function trimStringTo45(str) {
  if (str.length > 45) {
    return str.substring(0, 45) + "...";
  } else {
    return str;
  }
}

module.exports = new QueueManager();
