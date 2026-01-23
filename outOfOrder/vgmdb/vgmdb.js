const axios = require("axios");
const cheerio = require("cheerio");
const sleep = require("util").promisify(setTimeout);
const fs = require("fs");
//eval(fs.readFileSync("./public/commands/queryvgmdb.js") + "");

const {
  ButtonBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");

const ITEMS_PER_PAGE = 10;

const smallLoadingEmbed = new EmbedBuilder().setImage(
  "http://91.99.239.6/files/assets/Domo_load.gif"
);

const oopsEmbed = new EmbedBuilder().setImage(
  "http://91.99.239.6/files/assets/domo-sweat-blank-message-broke.gif"
);

const noResultsEmbed = new EmbedBuilder().setImage(
  "http://91.99.239.6/files/assets/domo-sweat-blank-messageno-results.gif"
);

async function searchVGMdb(interaction, query, attempts, maxRetries = 5) {
  console.log ("On Retry: " + attempts)
  let retries = attempts;
  let response;
  const timeout = 3000;
  const source = axios.CancelToken.source();
  setTimeout(() => {
    source.cancel("Request cancelled due to timeout");
  }, timeout);

  const apiUrl = "https://vgmdb.info/search/albums";

  try {
    console.log("Getting ready to send on");
    response = await axios
      .get(apiUrl, { params: { q: query }, cancelToken: source.token })
      .then((response) => response.data)
      .catch((err) => {
        console.error(err);
      });
  } catch (error) {
    // If the error is not a 404 error, rethrow the error
    //if (
    //  axios.isCancel(error) &&
    //  error.response &&
    //  error.response.status !== 404
    //) {
    //  throw error;
    //}
  }

  if (retries > maxRetries) {
    return await interaction.editReply({
      content: "Sorry, there were no results found for your query.",
      embeds: [noResultsEmbed],
    });
  }

  return response;
}

function createVGMdbEmbed(result, imgUrl, albumRange = 0) {
  var title = shortenString(result.titles.en);
  var nameFields = [];

  for (const key in result.titles) {
    if (result.titles.hasOwnProperty(key)) {
      const value = result.titles[key];

      console.log(`Key: ${key}, Value: ${value}`);

      var fullKeyName = "";

      if (key == "en") {
        fullKeyName = "English Title: ";
      } else if (key === "ja" && key !== "ja-latn") {
        fullKeyName = "Japanese Title: ";
      }

      var isLatinJapanese = key == "ja-latn";

      var entry = { name: fullKeyName, value: value, inline: false };
    }
    if (!isLatinJapanese) {
      nameFields.push(entry);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setAuthor({
      name: "VGMdb results",
      iconURL:
        "http://91.99.239.6/files/assets/VGMDB-icon.png",
      url: "https://vgmdb.net/",
    })
    .setColor(0xDC143C)
    .setURL("https://vgmdb.net/" + result.link)
    .setDescription("**Known names**: ")
    .addFields(nameFields)
    .addFields(
      {
        name: "Media Format",
        value: result.media_format,
        inline: true,
      },
      {
        name: "Release Date",
        value: result.release_date,
        inline: true,
      }
    )
    .setFooter({
      text: "Page 1 of " + albumRange,
      iconUrl:
        "http://91.99.239.6/files/assets/sd-img.png",
    });

  if (imgUrl !== null) {
    embed.setThumbnail(imgUrl);
  }
  return embed;
}

function createPaginationButtons(userId) {
  const buttons = [
    new ButtonBuilder()
      .setCustomId("album-previous-" + userId)
      .setLabel("Previous")
      .setStyle("1"),
    new ButtonBuilder()
      .setCustomId("album-next-" + userId)
      .setLabel("Next")
      .setStyle("1"),
  ];

  return buttons;
}

function createDropdown(userId, pageNumber = 1) {
  const userResult = userAlbumResults.get(userId);

  pageNumber = Math.floor(pageNumber);

  const paginatedData = paginateArray(
    userResult.filteredResults,
    pageNumber,
    ITEMS_PER_PAGE
  );

  const hasPreviousPage = pageNumber > 0.9;
  const hasNextPage =
    (pageNumber + 1) * ITEMS_PER_PAGE < userResult.filteredResults.length;

  console.log("Page Number: " + pageNumber);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("album-dropdown-" + userId)
    .setPlaceholder("Select an album")
    .addOptions([
      ...(hasPreviousPage
        ? [{ label: "Load previous...", value: "album-prev" }]
        : []),
      ...paginatedData.map((value, index) => ({
        label: shortenString(
          pageNumber < 1
            ? Math.floor(pageNumber * 9 + index) + 1 + ". " + value.titles.en
            : Math.floor(pageNumber * ITEMS_PER_PAGE + index + 1) +
                ". " +
                value.titles.en
        ),
        value: `item-${pageNumber * ITEMS_PER_PAGE + index}`,
      })),
      ...(hasNextPage ? [{ label: "Load next...", value: "album-next" }] : []),
    ]);

  return selectMenu;
}

async function getAlbumCoverArtUrl(albumUrl) {
  try {
    const response = await axios.get(albumUrl);
    const $ = cheerio.load(response.data);

    // Find the album cover art element using its CSS selector
    const coverArtDiv = $("div#coverart");

    // Extract the style attribute value
    const style = coverArtDiv.attr("style");

    // Use a regular expression to match the URL in the style string
    const regex = /url\(['"]?(.*?)['"]?\)/;
    const match = style.match(regex);

    if (match && match[1]) {
      return match[1];
    } else {
      return null;
    }
  } catch (error) {
    console.error(`Error fetching album cover art: ${error.message}`);
    return null;
  }
}

function extractBackgroundImageUrl(html) {
  const $ = cheerio.load(html);

  // Find the div with id 'coverart'
  const coverArtDiv = $("div#coverart");

  // Extract the style attribute value
  const style = coverArtDiv.attr("style");

  // Use a regular expression to match the URL in the style string
  const regex = /url\(['"]?(.*?)['"]?\)/;
  const match = style.match(regex);

  if (match && match[1]) {
    return match[1];
  } else {
    return null;
  }
}

function paginateArray(array, pageNumber, itemsPerPage) {
  const startIndex = pageNumber * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  return array.slice(startIndex, endIndex);
}

async function handleVgmdbDropdownSelection(interaction) {
  var value = interaction.values[0];

  if (typeof value == "undefined") {
    value = "album-next";
  }

  var newIndex = 0;
  if (value == "album-prev" || value == "album-next") {
    var currentPage = 0.1;
    try {
      currentPage =
        parseInt(
          interaction.message.components[0].components[0].options[1].value.split(
            "-"
          )[1]
        ) / 10;
    } catch (e) {
      console.log("Setting to 1.1 because of " + e);
    }

    const newPage = value === "album-prev" ? currentPage - 1 : currentPage + 1;
    const dropdown = createDropdown(interaction.member.id, newPage);
    const buttons = createPaginationButtons(interaction.member.id);
    const topRow = new ActionRowBuilder().addComponents(dropdown);
    const row = new ActionRowBuilder().addComponents(buttons);

    return await interaction.update({ components: [topRow, row] });
  } else {
    await interaction.update({ embeds: [smallLoadingEmbed] });
    const { results, currentPage } = getResultsAndPage(interaction);

    const valueArray = value.split("-");
    var index = valueArray[1];

    console.log("The value from the interaction: " + value);
    console.log("The results: " + results);
    console.log("The Page: " + currentPage);

    var entryIndex = parseInt(index);
    if (!results[entryIndex].link) {
      return interaction.editReply({
        content:
          "It would appear something went wrong.\nPlease try using the command again.",
        embeds: [oopsEmbed],
      });
    }
    var url = "https://vgmdb.net/" + results[entryIndex].link;

    getAlbumCoverArtUrl(url).then(async (imgUrl) => {
      console.log("Here is imgurl: " + imgUrl);
      var imageExtension = imgUrl.split(".");
      console.log(imageExtension);
      var formattedImgUrl =
        imageExtension[1] == "gif"
          ? "http://91.99.239.6/files/assets/album_art.png"
          : imgUrl;
      const newEmbed = createVGMdbEmbed(
        results[entryIndex],
        formattedImgUrl,
        results.length
      );

      newEmbed.setFooter({
        text:
          "Page " +
          (parseInt(entryIndex) + parseInt(1)) +
          " of " +
          results.length,
      });

      // Update the stored page number
      updatePage(interaction.user.id, entryIndex);

      await interaction.editReply({ embeds: [newEmbed] });
    });
  }
}

function getResultsAndPage(interaction) {
  if (userAlbumResults.length < 1) {
    return interaction.editReply({
      content:
        "It would appear something went wrong.\nPlease try using the command again.",
      embeds: [oopsEmbed],
    });
  }
  if (userAlbumResults.has(interaction.user.id)) {
    const userResult = userAlbumResults.get(interaction.user.id);
    console.log("userResults ID: " + userResult.userId);
    if (userResult) {
      return {
        results: userResult.filteredResults,
        currentPage: userResult.currentPage,
      };
    }
    return { results: [], currentPage: 0 };
  } else {
    return interaction.editReply({
      content:
        "It would appear something went wrong.\nPlease try using the command again.",
      embeds: [oopsEmbed],
    });
  }
}

function updatePage(userId, newPage) {
  const userResult = userAlbumResults.get(userId);
  if (userResult) {
    userResult.currentPage = newPage;
    userAlbumResults.set(userId, userResult);
  }
}

function shortenString(str) {
  if (str.length > 100) {
    return str.slice(0, 95) + "...";
  }
  return str;
}
