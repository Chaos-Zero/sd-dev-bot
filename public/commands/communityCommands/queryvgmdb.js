const fs = require("fs");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/api/vgmdb/vgmdb.js") + "");

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const smallLoadingEmbed = new EmbedBuilder().setImage(
  "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Domo-load-small.gif?v=1679713388809"
);

const loadingEmbed = new EmbedBuilder().setImage(
  "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Domo-load.gif?v=1679712312250"
);

const noResultsEmbed = new EmbedBuilder().setImage(
  "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/domo-sweat-blank-messageno-results.gif?v=1679872181343"
);

var attempts = 0

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vgmdb")
    .setDescription("Search for VGM released on VGMdb.net")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription(
          'Series, Game or Album to search. Use "quotation marks" for accurate results'
        )
        .setRequired(true)
    ),
  async execute(interaction) {
    const query = interaction.options.getString("query");

    await interaction.reply({
      content: "Looking for " + query,
      embeds: [loadingEmbed],
    });
    await SearchVgmdb(interaction, query, attempts);
  },
};

async function SearchVgmdb(interaction, query, attempts) {
  attempts += 1;
  await searchVGMdb(interaction, query, attempts).then(async (results) => {
    await sleep(2000);
    console.log("are we here?");
    //console.log(results.results)
    const checkIfResults =
      results?.results?.albums ?? await SearchVgmdb(interaction, query, attempts);
    if (checkIfResults == undefined) {
      return;
    }
    var isGameAvailable = await findValueInArray(
      results.results.albums,
      "category",
      "Game"
    );

    if (!isGameAvailable) {
      console.log("Time to say sorry");
      return await interaction.editReply({
        content: "Sorry, there were no results found for your query.",
        embeds: [noResultsEmbed],
      });
    }

    console.log("We have continuied on");
    var filteredResults = removeObjectsWithMismatch(
      results.results.albums,
      "category",
      "Game"
    );

    //await AddImgurlToResults(filteredResults);
    //console.log(filteredResults);
    userAlbumResults.set(interaction.user.id, {
      filteredResults,
      currentPage: 0,
      interaction: interaction,
    });
    var albumRange = filteredResults.length;
    if (results?.results?.albums == undefined || albumRange < 1) {
      return await interaction.editReply({
        content: "Sorry, there were no results found for your query.",
        embeds: [noResultsEmbed],
      });
    }

    console.log("Albums: " + albumRange);

    var url = "https://vgmdb.net/" + filteredResults[0].link;
    console.log(url);
    getAlbumCoverArtUrl(url).then(async (imgUrl) => {
      var imageExtension = imgUrl.split(".");
      var formattedImgUrl =
        imageExtension == "gif"
          ? "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Album%20Art.png?v=1679783448288"
          : imgUrl;
      const embed = await createVGMdbEmbed(
        filteredResults[0],
        formattedImgUrl,
        albumRange
      );
      //const embed = await createVGMdbEmbed(filteredResults[0], albumRange);
      const buttons = createPaginationButtons(interaction.member.id);
      const dropdown = createDropdown(interaction.member.id, 0);
      const topRow = new ActionRowBuilder().addComponents(dropdown);
      const row = new ActionRowBuilder().addComponents(buttons);

      interaction.editReply({
        content:
          "We have found **" +
          filteredResults.length +
          " entries** for the search " +
          query,
        embeds: [embed],
        components: [topRow, row],
      });
    });
  });
}

function removeObjectsWithMismatch(albumsArray, category, game) {
  return albumsArray.filter((obj) => obj[category] == game);
}

async function AddImgurlToResults(filteredResults) {
  const requests = filteredResults.map(async (result) => {
    var url = "https://vgmdb.net/" + result.link;
    getAlbumCoverArtUrl(url).then(async (imgUrl) => {
      result.imgUrl = imgUrl;
      console.log(result);
      console.log(result.imgUrl);
    });
  });
  const asyncResults = await Promise.all(requests);
  return asyncResults;
}

async function findValueInArray(array, fieldName, valueToFind) {
  for (const obj of array) {
    if (obj[fieldName] === valueToFind) {
      console.log("We found something");
      return true;
    }
  }
  console.log("We didn't find something");
  return false;
}

