const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/main.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("list-yt-channels")
    .setDescription(
      "Shows which channels are registered to upload to playlists on YT."
    ),
  async execute(interaction) {
    var db = GetDb();
    db.read();
    var message =
      "The following channels are registered to add YouTube links to playlists: ";
    let ytChannelDetails = await db.get("ytChannels").value();
    outer: for (var channelEntry of ytChannelDetails) {
      message += "\n > <#" + channelEntry.discordChannelId + "> - " + channelEntry.channelType;
      message = channelEntry.channelType == "spotlight" ? message : message += " - " + channelEntry.updateFrequency
    }

    await interaction.reply(message);
  },
};
