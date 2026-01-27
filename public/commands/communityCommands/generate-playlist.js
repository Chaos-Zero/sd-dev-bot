const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
} = require("discord.js");
const fs = require("fs");
const Fuse = require("fuse.js");
const path = require("path");
const Papa = require("papaparse");

eval(fs.readFileSync("./public/tournament/tournamentutils.js") + "");

const archiveFolder = path.join(
  __dirname,
  "..",
  "..",
  "utils",
  "sdArchiveData"
);
const contributorCsvPath = path.join(archiveFolder, "contributorVgm.csv");
const DEFAULT_ICON_URL =
  "http://91.99.239.6/files/assets/sd_logo.png";

// Load contributor map
const contributorMap = getContributorMap();
const contributorNames = Object.keys(contributorMap);

const worksheetIdToContributor = Object.fromEntries(
  Object.values(contributorMap).map((data) => [data.worksheetId, data])
);

module.exports = {
  data: (() => {
    return new SlashCommandBuilder()
      .setName("generate-playlist")
      .setDescription(
        "Generate a YouTube playlist with random tracks from our community contributors!"
      )
      .addBooleanOption((option) =>
        option
          .setName("contributor")
          .setDescription("Generate a playlist from a specific contributor")
      )
      .addStringOption((option) =>
        option
          .setName("series")
          .setDescription("Generate a playlist from a specific series/game")
      )
      .addIntegerOption((option) =>
        option
          .setName("year")
          .setDescription("Generate a playlist of tracks from a specific year")
      )
      .addBooleanOption((option) =>
        option
          .setName("make-public")
          .setDescription("Choose to post the result publicly")
      );
  })(),

  async execute(interaction) {
    const chooseContributor =
      interaction.options.getBoolean("contributor") ?? false;
    const seriesSearch = interaction.options.getString("series");
    const yearFilter = interaction.options.getInteger("year");
    const makePublic = interaction.options.getBoolean("make-public") ?? false;

    // If contributor flag or number/year specified without series, prompt contributor
    if (chooseContributor) {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select-contributor")
        .setPlaceholder("Select a contributor")
        .addOptions(
          contributorNames.slice(0, 25).map((key) => {
            const { seriesName } = contributorMap[key];
            return {
              label: seriesName.slice(0, 100),
              value: key,
            };
          })
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
        content: "Please select a contributor:",
        components: [row],
        ephemeral: !makePublic,
      });

      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) =>
          i.customId === "select-contributor" &&
          i.user.id === interaction.user.id,
        max: 1,
        time: 30000,
      });

      collector.on("collect", async (i) => {
        const chosenContributor = i.values[0];
        collector.stop("collected");

        try {
          if (!i.replied && !i.deferred) {
            await i.deferUpdate();
          }
          await handleTrackFetch(
            i,
            chosenContributor,
            seriesSearch,
            makePublic,
            true,
            yearFilter
          );
        } catch (err) {
          if (err.code === 40060 || err.code === 10062) {
            console.warn(`Ignored known interaction error: ${err.code}`);
          } else {
            console.error("Unexpected error after select:", err);
          }
        }
      });

      collector.on("end", (collected, reason) => {
        if (reason === "time" && collected.size === 0) {
          interaction.followUp({
            content: "No contributor selected in time. Cancelled.",
            ephemeral: true,
          });
          interaction.deleteReply();
        }
      });

      return;
    }

    // No contributor prompt needed: proceed
    await interaction.reply({
      content: "🎶 Fetching...",
      ephemeral: !makePublic,
    });

    await handleTrackFetch(
      interaction,
      null,
      seriesSearch,
      makePublic,
      true,
      yearFilter
    );
  },
};

// Main track handling
async function handleTrackFetch(
  interaction,
  selectedContributor,
  seriesSearch,
  makePublic,
  useEditReply = false,
  yearFilter = null
) {
  let tracks = [];
  let contributorData = null;

  const files = fs
    .readdirSync(archiveFolder)
    .filter(
      (file) =>
        file.endsWith(".csv") &&
        file !== "contributorVgm.csv" &&
        file !== "locationSheetData.csv" &&
        file !== "seriesMap.json"
    );

  let allTracks = [];

  if (selectedContributor !== null) {
    // contributor specified → try their sheet first
    contributorData = contributorMap[selectedContributor];
    const filePath = path.join(
      archiveFolder,
      `${contributorData.worksheetId}.csv`
    );
    if (fs.existsSync(filePath)) {
      allTracks = loadTracksFromCsv(filePath);
    }
    // if their file wasn’t present, we’ll fall through and load everyone
  } else {
    // no contributor → load all
    for (const file of files) {
      const filePath = path.join(archiveFolder, file);
      const data = loadTracksFromCsv(filePath);
      const worksheetId = path.basename(file, ".csv");
      const contributor = worksheetIdToContributor[worksheetId] || null;
      allTracks = allTracks.concat(
        data.map((row) => ({ ...row, __contributor: contributor }))
      );
    }
  }

  // filter by series if requested
  const fuse = new Fuse(allTracks, { keys: ["Game Title"], threshold: 0.2 });
  let matches = seriesSearch
    ? fuse.search(seriesSearch).map((r) => r.item)
    : allTracks;

  // then filter by year if requested
  if (yearFilter !== null) {
    matches = matches.filter(
      (t) => String(t["Year of release"]) === String(yearFilter)
    );
    if (matches.length === 0) {
      return await interaction.editReply({
        content: `No tracks could be found with selected options.`,
        embeds: [],
        compontens: [],
        ephemeral: !makePublic,
      });
    }
  }

  if (matches.length === 0) {
    return await interaction.editReply({
      content: seriesSearch
        ? `No results found for series "${seriesSearch} with selected options".`
        : "Could not find any tracks with selected options.",
      embeds: [],
      compontens: [],
      ephemeral: !makePublic,
    });
  }

  // 5) BVGM# lookup or final random from `tracks` array
  const validTracks = matches.filter((r) => r["YouTube URL"]);

  // Shuffle and remove duplicates based on YouTube URL
  const uniqueTracksMap = new Map();
  for (const track of validTracks) {
    const id = extractVideoId(track["YouTube URL"]);
    if (id && !uniqueTracksMap.has(id)) {
      uniqueTracksMap.set(id, track);
    }
  }

  // Get first 10 from the shuffled set
  const uniqueTracks = Array.from(uniqueTracksMap.values());

  // Shuffle the unique list
  for (let i = uniqueTracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniqueTracks[i], uniqueTracks[j]] = [uniqueTracks[j], uniqueTracks[i]];
  }

  const selectedTracks = uniqueTracks.slice(0, 10);

  if (selectedTracks.length === 0) {
    return await interaction.editReply({
      content: "Could not find enough unique tracks with selected options.",
      embeds: [],
      compontens: [],
      ephemeral: !makePublic,
    });
  }

  return await paginateSeriesResults(
    interaction,
    selectedTracks,
    seriesSearch,
    makePublic,
    yearFilter,
    selectedContributor
  );
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    // If ?v= param
    if (u.searchParams.has("v")) {
      const vid = u.searchParams.get("v");
      if (vid && vid.length === 11) return vid;
    }
    // Short youtu.be/
    const short = u.pathname.match(/^\/([\w-]{11})$/);
    if (u.hostname.includes("youtu.be") && short) {
      return short[1];
    }
    // Embed
    const embed = u.pathname.match(/embed\/([\w-]{11})/);
    if (embed) return embed[1];
  } catch (e) {
    // fallback: try regex for really malformed links
    const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    if (match) return match[1];
  }
  return null;
}

// Load contributor metadata
function getContributorMap() {
  const contributors = {};
  try {
    const fileData = fs.readFileSync(contributorCsvPath, "utf8");
    const lines = fileData.split(/\r?\n/);
    if (lines.length < 2) return contributors;

    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const seriesNameIdx = headers.findIndex(
      (h) => h.toLowerCase() === "series name"
    );
    const userColorIdx = headers.findIndex(
      (h) => h.toLowerCase() === "user color"
    );
    const userNameIdx = headers.findIndex(
      (h) => h.toLowerCase() === "user name"
    );
    const worksheetIdIdx = headers.findIndex(
      (h) => h.toLowerCase() === "worksheet id"
    );
    const iconUrlIdx = headers.findIndex((h) => h.toLowerCase() === "icon url");

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",");
      if (row.length <= Math.max(seriesNameIdx, worksheetIdIdx)) continue;

      const seriesName = row[seriesNameIdx]?.trim().replace(/"/g, "");
      const userColor = row[userColorIdx]?.trim().replace(/"/g, "");
      const userName = row[userNameIdx]?.trim().replace(/"/g, "");
      const worksheetId = row[worksheetIdIdx]?.trim().replace(/"/g, "");
      const iconUrl =
        row[iconUrlIdx]?.trim().replace(/"/g, "") || DEFAULT_ICON_URL;

      if (worksheetId && userName) {
        contributors[userName] = {
          userName,
          worksheetId,
          seriesName,
          userColor,
          iconUrl,
        };
      }
    }
  } catch (err) {
    console.error("Error reading contributorVgm.csv:", err);
  }

  contributors["SupraDarky"] = {
    userName: "SupraDarky",
    worksheetId: "mainSheetData",
    seriesName: "SupraDarky's Best",
    userColor: 0xff0000,
    iconUrl:
      "http://91.99.239.6/files/assets/sd_logo.png",
  };
  return contributors;
}

async function paginateSeriesResults(
  interaction,
  matches,
  seriesSearch,
  makePublic,
  yearFilter = null,
  selectedContributor = null
) {
  const videoIds = matches
    .map((t) => extractVideoId(t["YouTube URL"]))
    .filter(Boolean);

  const playlistUrl = `https://www.youtube.com/watch_videos?video_ids=${videoIds.join(
    ","
  )}`;

  let page = 0;
  const itemsPerPage = 10;
  const totalPages = Math.ceil(matches.length / itemsPerPage);

  const generateEmbed = (page) => {
    const start = page * itemsPerPage;
    const slice = matches.slice(start, start + itemsPerPage);
    console.log(slice);
    const lines = slice.map((t, i) => {
      const idx = start + i + 1;
      const url = t["YouTube URL"];
      const title = t["Piece Title"] || "Unknown";
      const game = t["Game Title"] || "Unknown Game";
      const who = selectedContributor
        ? contributorMap[selectedContributor].seriesName
        : t.__contributor?.seriesName || "Supradarky";
      return `${idx}. ${url ? `[${title}](${url})` : title} – ${game} | ${who}`;
    });

    const headerParts = [];
    if (selectedContributor)
      headerParts.push(contributorMap[selectedContributor].seriesName);
    if (seriesSearch) headerParts.push(seriesSearch);
    if (yearFilter) headerParts.push(String(yearFilter));
    const title = `🎵 Contents: ${headerParts.join(" – ")}`;

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        "────────────────────────────\n" +
          lines.join("\n") +
          "\n────────────────────────────"
      )
      .setColor(0x09c309)
      .setFooter({
        text: "Playlists can be accessed via the link at the top of the message!",
        iconURL:
          "http://91.99.239.6/files/assets/sd-img.png",
      });
  };

  // Build controls: Prev, Next and Page selector
  const prevBtn = new ButtonBuilder()
    .setCustomId("prev_page")
    .setEmoji("⬅️")
    .setStyle("Primary")
    .setDisabled(page === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId("next_page")
    .setEmoji("➡️")
    .setStyle("Primary")
    .setDisabled(page >= totalPages - 1);

  const pageOptions = Array.from({ length: totalPages }, (_, i) => ({
    label: `Page ${i + 1}`,
    value: String(i),
    default: i === page,
  }));
  const pageSelect = new StringSelectMenuBuilder()
    .setCustomId("jump_page")
    .setPlaceholder("Select page…")
    .addOptions(pageOptions);

  const controlsRow1 = new ActionRowBuilder().addComponents(pageSelect);
  const controlsRow2 = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

  // Send initial
  const components = totalPages > 1 ? [controlsRow1, controlsRow2] : [];

  const message = await interaction.editReply({
    content: `# >> [Playlist Link](${playlistUrl}) <<`,
    embeds: [generateEmbed(page)],
    components: components,
    ephemeral: !makePublic,
  });

  const collector = message.createMessageComponentCollector({ time: 120000 });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      return i.reply({ content: "Not for you!", ephemeral: true });
    }

    // Prev / Next
    if (i.customId === "prev_page" && page > 0) {
      page--;
    }
    if (i.customId === "next_page" && page < totalPages - 1) {
      page++;
    }

    // Jump via dropdown
    if (i.customId === "jump_page") {
      page = parseInt(i.values[0], 10);
    }

    // Update buttons’ disabled state and default option
    controlsRow2.components[0].setDisabled(page === 0);
    controlsRow2.components[1].setDisabled(page === totalPages - 1);
    controlsRow1.components[0].setOptions(
      pageOptions.map((opt, idx) => ({ ...opt, default: idx === page }))
    );

    await i.update({
      embeds: [generateEmbed(page)],
      components: [controlsRow1, controlsRow2],
    });
  });

  collector.on("end", () => {
    if (message.editable) {
      message.edit({ components: [] }).catch(() => {});
    }
  });
}

// Loads and parses CSV safely
function loadTracksFromCsv(filePath) {
  const csvData = fs.readFileSync(filePath, "utf8");
  const { data, errors, meta } = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (header) => header.trim(),
  });

  // Manually check for duplicate headers
  const seen = new Set();
  for (const field of meta.fields) {
    if (seen.has(field)) {
      throw new Error(`Duplicate header detected: ${field}`);
    }
    seen.add(field);
  }

  if (errors.length > 0) {
    throw new Error(`CSV parsing error: ${errors[0].message}`);
  }

  return data.filter(
    (row) => row["Game Title"] && row["Piece Title"] && row["YouTube URL"]
  );
}
