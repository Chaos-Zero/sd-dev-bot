const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
} = require("discord.js");

const { ActionRowBuilder } = require("discord.js");
const path = require("path");
const songsPerPage = 10;
const QueueManager = require(path.join(
  require.main.path,
  "public",
  "ytPlayback",
  "queueManager"
));
const fs = require("fs");
eval(fs.readFileSync("./public/main.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yt-show-queue")
    .setDescription("Displays the current music queue.")
    .addBooleanOption((option) =>
      option
        .setName("make-public")
        .setDescription("Make the response viewable to the server.")
        .setRequired(false)
    ),
  async execute(interaction) {
    if (
      interaction.channel.name == "listening-parties-host" ||
      interaction.channel.name == "listening-parties" ||
      interaction.channel.name == "guessing-games"
    ) {
      var db = GetDb();
      await db.read();
      let gamesDetails = await db.get("guessingGame").nth(0).value();

      if (
        gamesDetails.isGameRunning &&
        !gamesDetails.currentHosts.includes(interaction.user.id)
      ) {
        return await interaction.reply({
          content: "This command cannot be used during a guessing game.",
          ephemeral: true,
        });
      }

      const guildId = interaction.guildId;
      const queue = QueueManager.getQueue(guildId);
      var isPublic = interaction.options.getBoolean("make-public") || false;

      if (gamesDetails.isGameRunning) {
        isPublic = false;
      }

      if (!queue || !queue.songs.length) {
        if (queue && queue.connection && queue.currentlyPlaying) {
          const embed = await QueueManager.createPlayingEmbed(
            guildId,
            queue.currentlyPlaying
          );
          console.log(embed);

          // Reply with the embed as the initial response to the interaction
          await interaction
            .reply({
              content: "The queue is currently empty.",
              embeds: [embed],
            })
            .then(async () => {
              // Fetch the message that was just sent as the reply to save its reference
              const message = await interaction.fetchReply();
              queue.currentlyPlayingEmbed = message;
            });
          await QueueManager.startProgressUpdate(
            guildId,
            queue.currentlyPlaying.duration
          );
          return;
        } else {
          await interaction.reply({
            content: "The queue is currently empty.",
            ephemeral: true,
          });
          return;
        }
      }
      const pages = CreatePages(queue, songsPerPage);

      await sendPaginatedQueue(interaction, pages); // Call the function with interaction and pages
    } else {
      return await interaction.reply({
        content:
          "You can only use this command in #listening-parties, #listening-parties-host, and #guessing-games channels.",
        ephemeral: true,
      });
    } // Call the function with interaction and pages
  },
};

function calculateTotalDuration(songs) {
  var totalSeconds = 0;
  for (var song of songs) {
    totalSeconds += parseInt(song.duration);
  }
  return totalSeconds;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0"); // Calculate remaining seconds

  // Combine parts into HH:MM:SS format
  var output = `${remainingSeconds}`;
  if (minutes !== "00" || hours !== "00") {
    output = `${minutes}:` + output;
  }
  if (hours !== "00") {
    output = `${hours}:` + output;
  }
  return output;
}

// Function to create button rows

async function sendPaginatedQueue(interaction, pages) {
  // Send initial message with first page and buttons
  const message = await interaction.reply({
    embeds: [pages[0]],
    components: [createButtonRow(0, pages.length)],
    fetchReply: true,
    ephemeral: !interaction.options.getBoolean("make-public"),
  });

  // Listen for button interactions (this should be in your main bot file or an interaction create event handler)
  const filter = (i) =>
    ["nextPage", "previousPage"].some((a) => i.customId.startsWith(a)) &&
    i.message.id == message.id;
  const collector = message.createMessageComponentCollector({
    filter,
    time: 120000,
  });

  collector.on("collect", async (i) => {
    const queue = QueueManager.getQueue(interaction.guild.id);
    const splitButtonName = i.customId.split("-");
    const action = splitButtonName[0];
    const currentPageIndex = splitButtonName[1];
    let newIndex = parseInt(currentPageIndex);

    if (action == "nextPage") newIndex++;
    if (action == "previousPage") newIndex--;

    CreatePages(queue, songsPerPage);

    await i.update({
      embeds: [pages[newIndex]],
      components: [createButtonRow(newIndex, pages.length)],
    });
  });
}

function CreatePages(queue, songsPerPage) {
  var pages = [];
  var queueDuration = formatDuration(calculateTotalDuration(queue.songs));
  var pageCount = Math.ceil(queue.songs.length / songsPerPage);
  var pageNum = 0;
  for (let i = 0; i < queue.songs.length; i += songsPerPage) {
    pageNum++;
    const current = queue.songs.slice(i, i + songsPerPage);
    const embed = new EmbedBuilder()
      .setColor("#6c25be")
      .setTitle("Player Queue");

    let description = current
      .map(
        (song, index) =>
          `${index + 1 + parseInt(i)}. \`[${formatDuration(
            song.duration
          )}]\` [${song.title}](${song.url}) - <@!${song.user}>`
      )
      .join("\n");
    embed.setDescription(
      `🎶 Now Playing: **[${queue.currentlyPlaying.title}](${
        queue.currentlyPlaying.url
      })** [\`${formatDuration(
        queue.currentlyPlaying.duration
      )}\`]\n------------------------------------\nComing up...\n` + description
    );

    embed.setFooter({
      text:
        "Page " +
        pageNum +
        " of " +
        pageCount +
        " | " +
        queue.songs.length +
        " entries | Total length: " +
        queueDuration,
      iconURL:
        "http://91.99.239.6/files/assets/sd-img.png",
    });
    pages.push(embed);
  }
  return pages;
}

function createButtonRow(currentPageIndex, totalPages) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`previousPage-${currentPageIndex}`)
      .setLabel("◀️")
      .setStyle("1")
      .setDisabled(currentPageIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`nextPage-${currentPageIndex}`)
      .setLabel("▶️")
      .setStyle("1")
      .setDisabled(currentPageIndex >= totalPages - 1)
  );
  return row;
}
