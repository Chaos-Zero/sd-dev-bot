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
  "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752";

// Load contributor map
const contributorMap = getContributorMap();
const contributorNames = Object.keys(contributorMap);

const worksheetIdToContributor = Object.fromEntries(
  Object.values(contributorMap).map((data) => [data.worksheetId, data])
);

module.exports = {
  data: (() => {
    return new SlashCommandBuilder()
      .setName("community-track")
      .setDescription(
        "Get a random or specific track from our community members' uploads!"
      )
      .addBooleanOption((option) =>
        option
          .setName("contributor")
          .setDescription("Choose a specific contributor for results")
      )
      .addIntegerOption((option) =>
        option
          .setName("track-number")
          .setDescription("Use a VGM # to get a specific track")
      )
      .addStringOption((option) =>
        option
          .setName("series")
          .setDescription("Filter results by series/game. Returns a list.")
      )
      .addIntegerOption((option) =>
        option
          .setName("year")
          .setDescription("Filter results by year of release. Returns a list.")
      )
      .addBooleanOption((option) =>
        option
          .setName("include-supra")
          .setDescription("Add SupraDarkys videos to list outputs")
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
    const inputNum = interaction.options.getInteger("track-number");
    const seriesSearch = interaction.options.getString("series");
    const yearFilter = interaction.options.getInteger("year");
    const makePublic = interaction.options.getBoolean("make-public") ?? false;
    const includeSupra =
      interaction.options.getBoolean("include-supra") ?? false;

    // Validate mutually exclusive options
    if (inputNum !== null && yearFilter !== null) {
      return await interaction.reply({
        content:
          "The `year` option cannot be used in conjuction with `track-number`.\n`track-number` can only be used when searching by `contributor`.",
        ephemeral: true,
      });
    }
    if (seriesSearch && inputNum !== null) {
      return await interaction.reply({
        content:
          "The `series` options cannot be used in conjuction with `track-number`.\n`track-number` can only be used when searching by `contributor`.",
        ephemeral: true,
      });
    }

    // If contributor flag or number/year specified without series, prompt contributor
    if (chooseContributor || (inputNum !== null && !seriesSearch)) {
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
            inputNum,
            seriesSearch,
            makePublic,
            true,
            yearFilter,
            includeSupra
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
      inputNum,
      seriesSearch,
      makePublic,
      true,
      yearFilter,
      includeSupra
    );
  },
};

// Main track handling
async function handleTrackFetch(
  interaction,
  selectedContributor,
  inputNum,
  seriesSearch,
  makePublic,
  useEditReply = false,
  yearFilter = null,
  includeSupra
) {
  let tracks = [];
  let contributorData = null;

  const supraArgs = includeSupra ? "seriesMap.json" : "mainSheetData.csv";

  // 1) If user supplied a BVGM# but no contributor yet, show contributor dropdown
  if (inputNum !== null && !selectedContributor) {
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
      content: "Please select a contributor to search by track number:",
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

    collector.on("collect", async (selectInteraction) => {
      const chosenContributor = selectInteraction.values[0];
      collector.stop("collected");
      try {
        await selectInteraction.deferUpdate();
        // recurse with the chosen contributor
        await handleTrackFetch(
          selectInteraction,
          chosenContributor,
          inputNum,
          null,
          makePublic,
          true,
          yearFilter,
          includeSupra
        );
      } catch (err) {
        if (err.code === 40060 || err.code === 10062) {
          console.warn(`Ignored interaction error ${err.code}`);
        } else {
          console.error("Error after contributor select:", err);
        }
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason !== "collected") {
        await interaction
          .editReply({
            content: "No contributor selected in time. Cancelled.",
            embeds: [],
            compontens: [],
            ephemeral: true,
          })
          .catch(() => {});
        interaction.deleteReply();
      }
    });

    return;
  } else if (seriesSearch || yearFilter !== null) {
    const files = fs
      .readdirSync(archiveFolder)
      .filter(
        (file) =>
          file.endsWith(".csv") &&
          file !== "contributorVgm.csv" &&
          file !== "locationSheetData.csv" &&
          file !== "seriesMap.json" &&
          file !== supraArgs
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

    // paginate or list
    await paginateSeriesResults(
      interaction,
      matches,
      seriesSearch,
      makePublic,
      yearFilter,
      selectedContributor,
      includeSupra
    );
    return;

    // 4) finally, pure random pick (no contributor, no series, no year)
  } else {
    const supraArgs = includeSupra ? "seriesMap.json" : "mainSheetData.csv";

    if (selectedContributor !== null) {
      contributorData = contributorMap[selectedContributor];
      const filePath = path.join(
        archiveFolder,
        `${contributorData.worksheetId}.csv`
      );
      if (fs.existsSync(filePath)) {
        tracks = loadTracksFromCsv(filePath);
      } else {
        return await interaction.editReply({
          content: "Could not find contributor's tracks with selected options.",
          embeds: [],
          compontens: [],
          ephemeral: !makePublic,
        });
      }
    } else {
      const files = fs
        .readdirSync(archiveFolder)
        .filter(
          (file) =>
            file.endsWith(".csv") &&
            file !== "contributorVgm.csv" &&
            file !== "seriesMap.json" &&
            file !== "locationSheetData.csv" &&
            file !== supraArgs
        );
      const randomFile = files[Math.floor(Math.random() * files.length)];
      const worksheetId = path.basename(randomFile, ".csv");
      contributorData = worksheetIdToContributor[worksheetId] || null;
      tracks = loadTracksFromCsv(path.join(archiveFolder, randomFile));
    }
  }

  // 5) BVGM# lookup or final random from `tracks` array
  let chosenTrack = null;
  if (inputNum !== null) {
    const bvgmKey = Object.keys(tracks[0]).find((k) =>
      k.toLowerCase().startsWith("bvgm#")
    );
    if (!bvgmKey) {
      return await interaction.editReply({
        content: `This contributor does not have an entry with track number ${inputNum}.`,
        embeds: [],
        compontens: [],
        ephemeral: !makePublic,
      });
    }
    chosenTrack = tracks.find((r) => parseInt(r[bvgmKey], 10) === inputNum);
    if (!chosenTrack) {
      return await interaction.editReply({
        content: `No track found with track number ${inputNum}.`,
        embeds: [],
        compontens: [],
        ephemeral: !makePublic,
      });
    }
  } else {
    const validTracks = tracks.filter((r) => r["YouTube URL"]);
    chosenTrack = validTracks[Math.floor(Math.random() * validTracks.length)];
  }

  if (!chosenTrack) {
    return await interaction.editReply({
      content: "Could not find a track to show with selected options.",
      embeds: [],
      compontens: [],
      ephemeral: !makePublic,
    });
  }

  return await sendEmbed(
    interaction,
    chosenTrack,
    contributorData,
    makePublic,
    useEditReply
  );
}

// Builds the embed
function buildEmbedForTrack(track, contributorData) {
  const title = `${track["Label"] || track["SD Label"]}\n${
    track["Game Title"] || "Unknown Game"
  } – ${track["Piece Title"] || "Unknown Track"}`;

  const embed = new EmbedBuilder()
    .setColor(parseInt(contributorData?.userColor || "0xff0000"))
    .setTitle(title)
    .setURL(track["YouTube URL"] || null)
    .setAuthor({
      name: contributorData?.seriesName || "Supradarky's VGM Club",
      iconURL: contributorData?.iconUrl || DEFAULT_ICON_URL,
    });

  if (track["YouTube URL"]) {
    embed.setThumbnail(
      `https://img.youtube.com/vi/${extractVideoId(track["YouTube URL"])}/0.jpg`
    );
  }

  if (track["Composer(s)"]) {
    embed.addFields({
      name: "Composers",
      value: track["Composer(s)"],
      inline: false,
    });
  }

  if (track["Platform"]) {
    embed.addFields({
      name: "Platform",
      value: track["Platform"] || "Unknown",
      inline: true,
    });
  }
  if (track["Franchise"]) {
    embed.addFields({
      name: "Franchise",
      value: track["Franchise"] || "Unknown",
      inline: true,
    });
  }

  if (track["Year of release"]) {
    embed.addFields({
      name: "Year of Release",
      value: track["Year of release"] || "Unknown",
      inline: true,
    });
  }
  const footerText = contributorData?.userName
    ? `Maintained by ${contributorData?.userName}`
    : "Supradarky's VGM Club";
  embed.setFooter({
    text: footerText,
    iconURL:
      "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016",
  });

  return embed;
}

// YouTube ID extractor
function extractVideoId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
  return match ? match[1] : null;
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
  return contributors;
}

async function sendEmbed(
  interaction,
  track,
  contributorData,
  makePublic,
  useEditReply
) {
  const embed = buildEmbedForTrack(track, contributorData);
  const payload = {
    content: "", // Clear the original message content
    embeds: [embed],
    components: [], // Remove dropdown or buttons
    ephemeral: !makePublic,
  };

  if (useEditReply) {
    return await interaction.editReply(payload);
  } else {
    return await interaction.followUp(payload);
  }
}

async function paginateSeriesResults(
  interaction,
  matches,
  seriesSearch,
  makePublic,
  yearFilter = null,
  selectedContributor = null,
  includeSupra = false
) {
  var xondition = selectedContributor !== null && includeSupra;
  console.log(
    "Contributib: " +
      selectedContributor +
      "\nsupra: " +
      includeSupra +
      "\nxondition: " +
      xondition
  );
  var supraMessage = xondition
    ? "*SupraDarky entries are omitted if a specific contributor is selected*"
    : "";
  // Sort entries
  matches.sort((a, b) => {
    const aGame = (a["Game Title"] || "").toLowerCase();
    const bGame = (b["Game Title"] || "").toLowerCase();
    const cmp = aGame.localeCompare(bGame);
    if (cmp !== 0) return cmp;
    return (a["Piece Title"] || "").localeCompare(b["Piece Title"] || "");
  });

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
    const title = `🎵 Results for ${headerParts.join(" – ")}`;

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        "────────────────────────────\n" +
          lines.join("\n") +
          "\n────────────────────────────"
      )
      .setColor(0x5865f2)
      .setFooter({
        text:
          `Page ${page + 1}/${totalPages} - ${matches.length} entries` +
          supraMessage,
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
    content: supraMessage,
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
