const {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const fs = require("fs");
eval(fs.readFileSync("./public/api/vgmdb/vgmdb.js") + "");
eval(fs.readFileSync("./public/commands/communityCommands/queryvgmdb.js") + "");

const smallLoadingEmbed = new EmbedBuilder().setImage(
  "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Domo-load-small.gif?v=1679713388809"
);

async function handleVgmdbButtonPress(interaction) {
  console.log("We're in handle Vgmdb");
  
  var isUsersButtonNext = interaction.customId == "album-next-" + interaction.user.id;
  var isUsersButtonPrevious = interaction.customId == "album-previous-" + interaction.user.id;
  
  const splitButtonName = interaction.customId.split("-");
  if (splitButtonName[2] !== interaction.user.id) {
    return await interaction.reply({
      content: "This option is reserved for the user who spawned the message.",
      ephemeral: true,
    });
  }

  await interaction.update({ embeds: [smallLoadingEmbed] });
  
  var newIndex = 0;
  const { results, currentPage } = getResultsAndPage(interaction);
  if (splitButtonName[1] == "dropdown") {
    const selectedValue = interaction.values[0];
    newIndex = results[selectedValue];
    //Array.from(results.keys()).indexOf(selectedValue);
  } else {
    newIndex = splitButtonName[1] == "next" ? currentPage + 1 : currentPage - 1;
    console.log("The New Index is " + newIndex);
  }
  if (newIndex < 0 || newIndex >= results.length) newIndex = 0;

  var url = "https://vgmdb.net/" + results[newIndex].link;
  console.log(url);
  getAlbumCoverArtUrl(url).then(async (imgUrl) => {
    console.log("Here is imgurl: " + imgUrl);
    var imageExtension = imgUrl.split(".");
    console.log(imageExtension);
    var formattedImgUrl =
      imageExtension[1] == "gif"
        ? "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Album%20Art.png?v=1679783448288"
        : imgUrl;
    const newEmbed = createVGMdbEmbed(
      results[newIndex],
      formattedImgUrl,
      results.length
    );

    newEmbed.setFooter({
      text:
        "Page " + (parseInt(newIndex) + parseInt(1)) + " of " + results.length,
    });

    // Update the stored page number
    updatePage(interaction.user.id, newIndex);

    await interaction.editReply({ embeds: [newEmbed] });
  });
}
