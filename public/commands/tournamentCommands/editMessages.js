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
    if (!message.embeds.length) {
      return interaction.reply(
        "This message does not contain an embed we can edit."
      );
    }

    // Retrieve the first embed in the message
    var embeds = message;
    const editedEmbed = message.embeds[0];

    console.log(embeds.embeds[0].data.fields);

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
        console.log(embeds.embeds[0].data.fields);
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
//module.exports = {
//    data: new SlashCommandBuilder()
//        .setName('edit-embed')
//        .setDescription('Edit an existing embed message')
//        .addStringOption(option =>
//            option
//                .setName('message_id')
//                .setDescription('The ID of the message with the embed you want to edit')
//                .setRequired(true)),
//    async execute(interaction, client) {
//        // Get the provided message ID
//        const messageId = interaction.options.getString('message_id');
//        const channel = interaction.channel;
//
//        try {
//            // Fetch the message with the provided ID
//            const message = await channel.messages.fetch(messageId);
//
//            // Check if the message has an embed
//            if (!message.embeds || message.embeds.length === 0) {
//                await interaction.reply('No embed found in the specified message.');
//                return;
//            }
//
//            // Get the embed
//            const embed = message.embeds.length > 1 ? message.embeds[1] : message.embeds[0];
//
//            // Break the embed into categories (title, description, fields, etc.)
//            const categories = {
//                title: embed.title || '',
//                description: embed.description || '',
//                fields: embed.fields || [],
//            };
//
//            // Ask the user which fields they would like to change
//            const question = 'Which fields would you like to change? (title, description, fields)';
//            await interaction.reply(question);
//            const filter = m => m.author.id === interaction.user.id;
//            const collected = await channel.awaitMessages({ filter, max: 1, time: 30000 });
//
//            if (collected.size === 0) {
//                await interaction.followUp('No response received. Aborting the edit process.');
//                return;
//            }
//
//            const response = collected.first().content;
//
//            // Update the selected fields
//            const updatedCategories = await updateCategories(response, categories, interaction, channel);
//
//            // Update the embed
//            const updatedEmbed = new MessageEmbed(embed)
//                .setTitle(updatedCategories.title)
//                .setDescription(updatedCategories.description)
//                .setFields(updatedCategories.fields);
//
//            // Edit the message with the updated embed
//            await message.edit({ embeds: [updatedEmbed] });
//
//            // Notify the user that the embed was updated
//            await interaction.followUp('Embed updated successfully!');
//        } catch (err) {
//            console.error(err);
//            await interaction.reply('An error occurred while trying to edit the embed.');
//        }
//    },
//};
//
//async function updateCategories(response, categories, interaction, channel) {
//    // Here you should implement your logic to update the selected categories.
//    // You can use a series of if-else statements or a switch statement to handle
//    // different user inputs and ask for new values for the selected fields.
//    // Make sure to return the updated categories object.
//}
