/*const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require("@discordjs/voice");
const { EmbedBuilder } = require("discord.js");
const ytdl = require("ytdl-core");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);
const QueueManager = require(path.join(
  require.main.path,
  "public",
  "ytPlayback",
  "queueManager"
));

async function playSong(guildId, song) {
  const queue = QueueManager.getQueue(guildId);
  const player = await ensurePlayerExists(guildId);

  if (!song || !ytdl.validateURL(song.url)) {
    console.log("Invalid or no song URL provided to playSong.");
    await playNextSong(guildId);
    return;
  }

  const streamOptions = {
    filter: "audioonly",
    quality: "highestaudio",
    highWaterMark: 1 << 26, // Example: Increase buffer size to 32 MB
  };
  const songStream = ytdl(song.url, streamOptions);
  const ffmpegProcess = createFFmpegProcess(songStream);
  queue.currentFFmpegProcess = ffmpegProcess; // Store the FFmpeg process in the queue for later reference

  const resource = createAudioResource(ffmpegProcess.pipe(), {
    inlineVolume: true,
  });
  player.play(resource);

  console.log(`Now playing: ${song.url}`);
  queue.currentlyPlayingStartTime = Date.now();
  if (queue.currentlyPlayingEmbed) {
    await QueueManager.startProgressUpdate(guildId);
  }
}

async function playNextSong(guildId) {
  const queue = QueueManager.getQueue(guildId);
  if (queue && queue.songs.length > 0) {
    const nextSong = queue.songs.shift(); // Prepare the next song
    queue.currentlyPlaying = nextSong;

    await playSong(guildId, nextSong); // Play the next song
  } else {
    // Handle when the queue is empty
    console.log("Queue is empty or not found. Handling cleanup...");
    // Example: leave the voice channel
    if (queue && queue.connection) {
      queue.connection.destroy(); // Use destroy() to ensure cleanup of resources
      if (queue.currentlyPlayingEmbed) {
        queue.currentlyPlayingEmbed.edit({
          embeds: [
            new EmbedBuilder()
              .setTitle("Playback Finished")
              .setDescription(`✅ **Thank you for listening.**`),
          ],
        });
      }
    }
    // Reset or delete the queue if needed
    QueueManager.deleteQueue(guildId);
  }
}

async function playSongWithRetry(guildId, queue, song, retries = 0) {
  const maxRetries = 3; // Set a max retry limit to avoid infinite loops
  try {
    queue.currentlyPlaying = song;
    await playSong(guildId, song);
  } catch (error) {
    console.log(
      `Error playing song: ${error.message}. Retry ${
        retries + 1
      } of ${maxRetries}`
    );

    if (retries < maxRetries) {
      // Wait a bit before retrying to avoid hammering the service or resource
      await new Promise((resolve) => setTimeout(resolve, 1000 * (retries + 1))); // Exponential back-off could be a better strategy

      // Ensure you await the recursive call to properly handle asynchronous operation
      await playSongWithRetry(guildId, queue, song, retries + 1);
    } else {
      console.log(`Max retries reached. Skipping song.`);
      // Ensure that playNextSong is awaited to handle any asynchronous actions it performs
      await playNextSong(guildId);
    }
  }
}

async function ensurePlayerExists(guildId) {
  const queue = QueueManager.getQueue(guildId);

  // If the player already exists, return it directly
  if (queue.player) {
    return queue.player;
  }

  // Create a new player and subscribe it to the connection if it exists
  console.log(`Creating new player for guild ID: ${guildId}`);
  const player = createAudioPlayer();
  queue.player = player;

  if (queue.connection) {
    queue.connection.subscribe(player);
  }

  // Event listeners for the player
  player.on(AudioPlayerStatus.Idle, async () => {
    console.log(`Player is idle. Guild ID: ${guildId}`);
    await playNextSong(guildId); // Ensure playNextSong is defined and handles the queue correctly
  });

  player.on(AudioPlayerStatus.Playing, () => {
    console.log(`Player is playing. Guild ID: ${guildId}`);
  });

  // Optionally, handle other player states/events as needed

  return player;
}

function createFFmpegProcess(songStream) {
  const ffmpegProcess = ffmpeg(songStream)
    .audioFilters("dynaudnorm=f=100") // Dynamic audio normalization
    .audioFilters("acompressor") // Optional: Add audio compressor
    .inputOptions(["-probesize 10000000", "-analyzeduration 10000000"]) // Optional: Increase probe size and analysis duration for buffering
    .audioFrequency(48000) // Set sample rate to 48kHz
    .audioChannels(2) // Set audio to stereo
    .format("opus")
    .on("error", (err) => {
      console.error(`FFmpeg Error: ${err.message}`);
      // Handle error, possibly by skipping to next song
    });
  return ffmpegProcess;
}
*/