const { SlashCommandBuilder } = require("discord.js");
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const fs = require("fs");
eval(fs.readFileSync("./public/utils/messageutils.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("edit-battle-urls")
    .setDescription("Edit an urls in a battle by the message id")
    .addStringOption((option) =>
      option
        .setName("channel-name")
        .setDescription(
          "The name of the channel where the battle is taking place"
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message-id")
        .setDescription("The ID of the message containing the battle embed")
        .setRequired(true)
    ),
  async execute(interaction) {
    const channelName = interaction.options.getString("channel-name");
    const messageId = interaction.options.getString("message-id");

    // Retrieve the message containing the embed
    const channel = await GetChannelByName(
      interaction.member.guild,
      process.env.TOURNAMENT_CHANNEL
    );
    const message = await channel.messages.fetch(messageId);

    // Make sure the message contains an embed
    if (!message.embeds.length || message.embeds.length < 2) {
      return interaction.reply(
        "This message does not contain an embed we can edit."
      );
    }

    // Retrieve the first embed in the message
    var embeds = message;
    const editedEmbed = message.embeds[1];

    console.log(embeds.embeds[1].data.fields);

    // Break the embed into categories
    var fields = editedEmbed.data.fields;
    const categories = [];
    for (var i = 0; i < fields.length; i++) {
      if (i > 0 && i < fields.length - 1) {
        categories.push({ name: fields[i].name, url: fields[i].value });
      }
    }

    var stringSelect = [];

    for (var i = 0; i < categories.length; i++) {
      stringSelect.push({
        label: categories[i].name,
        description: categories[i].url,
        value: categories[i].name,
      });
    }

    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId("entry-select")
      .setPlaceholder("Select an entry")
      .addOptions(stringSelect);

    await interaction.reply({
      content: "Which entry would you like to update?",
      components: [new ActionRowBuilder().addComponents(categorySelect)],
      ephemeral: true,
    });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: (i) =>
        i.isStringSelectMenu() &&
        i.customId === "entry-select" &&
        i.user.id === interaction.user.id,
      time: 60000, // time in ms
    });

    // Listen for user input and ask for new value
    collector.on("collect", async (i) => {
      const category = i.values[0];
      const currentValue = categories[category];
      i.deferUpdate();
      collector.stop();

      // Ask the user for the new value
      await interaction.followUp({
        content:
          "What URL would you like to set for `" +
          category +
          "`?\nSend a message to the channel to enter your new URL.",
        ephemeral: true,
      });

      const valueCollector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
        time: 60000, // time in ms
      });

      // Listen for user input and update the embed accordingly
      valueCollector.on("collect", async (m) => {
        const newValue = m.content;
        m.delete();
        console.log(newValue);
        console.log(embeds.embeds[1].data.fields);
        for (var entry of editedEmbed.data.fields) {
          if (entry.name == category) {
            entry.value = newValue;
            break;
          }
        }
        console.log(editedEmbed.data.fields);

        // // Update the embed with the new value
        // embed[category.toLowerCase()] = newValue;
        //
        // // Send the updated embed
        var toSendEmbeds = [
          new EmbedBuilder(message.embeds[0]),
          new EmbedBuilder(editedEmbed),
        ];
        await message.edit({ embeds: toSendEmbeds });
        //
        // Confirm the update to the user
        await interaction.followUp({
          content:
            "Embed field `" + category + "` updated to `" + newValue + "`",
          ephemeral: true,
        });
        collector.stop();
        valueCollector.stop();
      });

      valueCollector.on("end", (_, reason) => {
        if (reason === "time") {
          interaction.followUp({
            content: "No input received in 60 seconds, command cancelled.",
            ephemeral: true,
          });
        }
      });
    });
  },
};
