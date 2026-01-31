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
    .setName("tournament-edit-embeds")
    .setDescription("Edit an embed by the message ID")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel containing the message")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message-id")
        .setDescription("The ID of the message containing the embed")
        .setRequired(true)
    ),
  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");
    const messageId = interaction.options.getString("message-id");

    if (!channel) {
      return interaction.reply({
        content: "Channel not found.",
        ephemeral: true,
      });
    }

    // Fetch the message with the provided ID
    const message = await channel.messages.fetch(messageId);
    if (!message) {
      return interaction.reply({
        content: "Message not found.",
        ephemeral: true,
      });
    }

    // Ensure the message contains an embed
    if (!message.embeds.length) {
      return interaction.reply({
        content: "The specified message does not contain an embed.",
        ephemeral: true,
      });
    }

    const embed = message.embeds[0]; // The first embed in the message

    // Offer the user a choice of what part of the embed to edit (field name or field value)
    const truncate = (text, maxLength = 100) =>
      text.length > maxLength ? text.slice(0, maxLength - 3) + "..." : text;

    const options = [
      {
        label: "Title",
        description: truncate(embed.title || "No title"),
        value: "title",
      },
      {
        label: "Description",
        description: truncate(embed.description || "No description"),
        value: "description",
      },
      ...embed.fields.map((field, index) => ({
        label: truncate(`${field.name} (Field Name)`),
        description: truncate(field.name),
        value: `field_name_${index}`,
      })),
      ...embed.fields.map((field, index) => ({
        label: truncate(`${field.name} (Field Value)`),
        description: truncate(field.value),
        value: `field_value_${index}`,
      })),
    ];

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("edit-select")
      .setPlaceholder("Select part of the embed to edit")
      .addOptions(options);

    await interaction.reply({
      content: "Which part of the embed would you like to update?",
      components: [new ActionRowBuilder().addComponents(selectMenu)],
      ephemeral: true,
    });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: (i) =>
        i.isStringSelectMenu() &&
        i.customId === "edit-select" &&
        i.user.id === interaction.user.id,
      time: 60000, // 60 seconds
    });

    collector.on("collect", async (i) => {
      const selectedOption = i.values[0];
      i.deferUpdate();
      collector.stop();

      // Ask the user for the new value based on their selection
      let prompt;
      if (selectedOption === "title") {
        prompt = "Please enter the new title.";
      } else if (selectedOption === "description") {
        prompt = "Please enter the new description.";
      } else if (selectedOption.startsWith("field_name_")) {
        const fieldIndex = parseInt(selectedOption.split("_")[2], 10);
        prompt = `Please enter the new title for field \`${embed.fields[fieldIndex].name}\`.`;
      } else if (selectedOption.startsWith("field_value_")) {
        const fieldIndex = parseInt(selectedOption.split("_")[2], 10);
        prompt = `Please enter the new value for field \`${embed.fields[fieldIndex].name}\`.`;
      }

      await interaction.followUp({
        content: prompt,
        ephemeral: true,
      });

      const valueCollector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
        time: 60000, // 60 seconds
      });

      valueCollector.on("collect", async (m) => {
        const newValue = m.content;
        m.delete();

        let updatedEmbed = EmbedBuilder.from(embed); // Clone the original embed

        // Update the selected part of the embed
        if (selectedOption === "title") {
          updatedEmbed.setTitle(newValue);
        } else if (selectedOption === "description") {
          updatedEmbed.setDescription(newValue);
        } else if (selectedOption.startsWith("field_name_")) {
          const fieldIndex = parseInt(selectedOption.split("_")[2], 10);
          const updatedFields = [...embed.fields]; // Clone fields array
          updatedFields[fieldIndex].name = newValue; // Update the field name
          updatedEmbed.setFields(updatedFields); // Reapply fields
        } else if (selectedOption.startsWith("field_value_")) {
          const fieldIndex = parseInt(selectedOption.split("_")[2], 10);
          const updatedFields = [...embed.fields]; // Clone fields array
          updatedFields[fieldIndex].value = newValue; // Update the field value
          updatedEmbed.setFields(updatedFields); // Reapply fields
        }

        // Edit the message to update the embed
        await message.edit({ embeds: [updatedEmbed] });

        // Confirm the update to the user
        await interaction.followUp({
          content: "Embed updated successfully!",
          ephemeral: true,
        });

        valueCollector.stop();
      });

      valueCollector.on("end", (_, reason) => {
        if (reason === "time") {
          interaction.followUp({
            content: "No input received in time, edit cancelled.",
            ephemeral: true,
          });
        }
      });
    });
  },
};
