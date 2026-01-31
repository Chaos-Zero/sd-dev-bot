const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const adapter = new FileSync("db.json");
const db = low(adapter);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-update-entrant")
    .setDescription("Update an entrant in the tournament."),

  async execute(interaction) {
    await db.read();
    let entrants = db.data.tournaments.find((t) => t.currentTournament).rounds[
      "1"
    ];

    const entrantOptions = entrants.map((e) =>
      new StringSelectMenuOptionBuilder().setLabel(e.name).setValue(e.name)
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("select_entrant")
      .setPlaceholder("Select an entrant to update")
      .addOptions(entrantOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({
      content: "Choose an entrant:",
      components: [row],
      ephemeral: true,
    });
  },
};

// Interaction Handler for Selecting Entrant
module.exports.selectEntrant = async (interaction) => {
  let selectedEntrant = interaction.values[0];
  const fields = ["name", "title", "link"];

  const fieldOptions = fields.map((field) =>
    new StringSelectMenuOptionBuilder().setLabel(field).setValue(field)
  );

  const fieldMenu = new StringSelectMenuBuilder()
    .setCustomId("select_field")
    .setPlaceholder("Select field to update")
    .addOptions(fieldOptions);

  const row = new ActionRowBuilder().addComponents(fieldMenu);
  await interaction.update({
    content: `Updating: **${selectedEntrant}**. Select field:`,
    components: [row],
    ephemeral: true,
  });
};

// Interaction Handler for Selecting Field
module.exports.selectField = async (interaction) => {
  let selectedField = interaction.values[0];
  const modal = new ModalBuilder()
    .setCustomId("update_value")
    .setTitle("Update Entrant Field")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("new_value")
          .setLabel(`Enter new ${selectedField}`)
          .setStyle(TextInputStyle.Short)
      )
    );

  await interaction.showModal(modal);
};

// Modal Handler for Updating the Value
module.exports.updateValue = async (interaction) => {
  let newValue = interaction.fields.getTextInputValue("new_value");
  await db.read();
  let tournament = db.data.tournaments.find((t) => t.currentTournament);

  tournament.rounds["1"].forEach((entry) => {
    if (entry.name === interaction.customId) {
      entry[selectedField] = newValue;
    }
  });

  await db.write();
  await interaction.reply({
    content: `Successfully updated **${selectedField}** to **${newValue}**.`,
    ephemeral: true,
  });
};
