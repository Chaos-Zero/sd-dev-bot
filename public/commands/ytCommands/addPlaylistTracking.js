const { SlashCommandBuilder } = require("discord.js");

const fs = require("fs");
const fetch = require("node-fetch");
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/api/google/youtubeConnector.js") + "");
eval(fs.readFileSync("./public/tournament/dmUtils.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("toggle-playlist-channel")
    .setDescription("Toggle a channel to create playlists from on YT")
    .addStringOption((option) =>
      option
        .setName("channel-name")
        .setDescription("Name of the channel you wish to track/untrack")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("channel-type")
        .setDescription(
          "Permanent: Create New each month, Spotlight: Playlist for each name change"
        )
        .setRequired(true)
        .addChoices(
          { name: "permanent", value: "permanent" },
          { name: "spotlight", value: "spotlight" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("new-playlist-frequency")
        .setDescription(
          "Sets when a new playlist is created - not used for spotlights. Default: yearly"
        )
        .setRequired(false)
        .addChoices(
          { name: "monthly", value: "monthly" },
          { name: "yearly", value: "yearly" }
        )
    ),

  async execute(interaction) {
    const channelName = interaction.options.getString("channel-name");
    const channelType = interaction.options.getString("channel-type");
    const updateFrequency =
      interaction.options.getString("new-playlist-frequency") || "yearly";

    var db = GetDb();
    await db.read();
    let ytChannelDetails = await db.get("ytChannels");

    const channel = interaction.guild.channels.cache.find(
      (ch) => ch.name == channelName
    );

    var discordChannel = null;

    //discordChannelId
    for (var channelEntry of ytChannelDetails) {
      if (channelEntry.discordChannelId == channel.id) {
        discordChannel = channelEntry;
        break;
      }
    }
    console.log(channel);
    if (!channel) {
      await interaction
        .reply({
          content: "Sorry, I can't seem to find this channel in the server.",
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    } else if (!discordChannel) {
      ToggleRegisteredYtPlaylist(
        interaction,
        channel.id,
        channelType,
        updateFrequency
      );
      var message = "Full list of YT channels: ";
      let ytChannelDetails = await db.get("ytChannels").value();
      outer: for (var channelEntry of ytChannelDetails) {
        message += "\n > <#" + channelEntry.discordChannelId + "> - " + channelEntry.channelType;
        message = channelEntry.channelType == "spotlight" ? message : message += " - " + channelEntry.updateFrequency
      }
      await interaction
        .reply({
          content:
            "The videos in <#" +
            channel.id +
            "> will now be added to a " +
            channelType +
            " Youtube Playlist.\n\n" +
            message,
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    } else {
      ToggleRegisteredYtPlaylist(interaction, channel.id, channelType);
      var message = "Full list of YT channels: ";
      let ytChannelDetails = await db.get("ytChannels").value();
      outer: for (var channelEntry of ytChannelDetails) {
        message += "\n > <#" + channelEntry.discordChannelId + "> - " + channelEntry.channelType;
        message = channelEntry.channelType == "spotlight" ? message : message += " - " + channelEntry.updateFrequency
      }
      await interaction
        .reply({
          content:
            "The videos in <#" +
            channel.id +
            "> will no longer be added to a Youtube Playlist.\n\n" +
            message,
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    }
  },
};
