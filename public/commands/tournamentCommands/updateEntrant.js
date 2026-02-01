const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");

const PAGE_SIZE = 25;

function getActiveTournament(dbInstance) {
  dbInstance.read();
  const tournamentRoot = ensureTournamentRoot(dbInstance);
  const currentTournament = tournamentRoot.currentTournament || "N/A";
  if (currentTournament === "N/A") {
    return null;
  }
  const tournament = tournamentRoot[currentTournament];
  if (!tournament) {
    return null;
  }
  return { name: currentTournament, tournament };
}

function getEntrants(tournament) {
  const round1 = (tournament.rounds && tournament.rounds["1"]) || [];
  return [...round1].sort((a, b) => {
    const seedA = a?.challongeSeed ?? Number.MAX_SAFE_INTEGER;
    const seedB = b?.challongeSeed ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) {
      return seedA - seedB;
    }
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

function buildEntrantKey(entry, index) {
  if (entry?.challongeSeed !== undefined && entry?.challongeSeed !== null) {
    return `seed|${entry.challongeSeed}`;
  }
  return `idx|${index}`;
}

function findEntrantByKey(entrants, key) {
  if (!key) return null;
  const [type, value] = key.split("|");
  if (type === "seed") {
    const seed = parseInt(value, 10);
    return entrants.find((entry) => entry?.challongeSeed === seed) || null;
  }
  if (type === "idx") {
    const idx = parseInt(value, 10);
    return entrants[idx] || null;
  }
  return null;
}

function buildEntrantMenu(entrants, page) {
  const totalPages = Math.max(1, Math.ceil(entrants.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pageEntries = entrants.slice(start, start + PAGE_SIZE);

  const options = pageEntries.map((entry, idx) => {
    const globalIndex = start + idx;
    const value = buildEntrantKey(entry, globalIndex);
    const label = (entry?.name || "Unknown Entrant").slice(0, 100);
    const description = entry?.title
      ? entry.title.slice(0, 100)
      : "No title set";
    return new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setValue(value)
      .setDescription(description);
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("update-entrant-select")
    .setPlaceholder(`Select an entrant (page ${safePage + 1}/${totalPages})`)
    .addOptions(options);

  const rows = [new ActionRowBuilder().addComponents(selectMenu)];

  if (totalPages > 1) {
    const prevButton = new ButtonBuilder()
      .setCustomId(`update-entrant-page:${safePage - 1}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Prev")
      .setDisabled(safePage === 0);

    const nextButton = new ButtonBuilder()
      .setCustomId(`update-entrant-page:${safePage + 1}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Next")
      .setDisabled(safePage >= totalPages - 1);

    rows.push(new ActionRowBuilder().addComponents(prevButton, nextButton));
  }

  return { rows, page: safePage, totalPages };
}

function updateEntriesInTournament(tournament, entryKey, field, newValue) {
  const entrants = getEntrants(tournament);
  const selectedEntrant = findEntrantByKey(entrants, entryKey);
  if (!selectedEntrant) {
    return 0;
  }
  const seed =
    selectedEntrant.challongeSeed !== undefined &&
    selectedEntrant.challongeSeed !== null
      ? selectedEntrant.challongeSeed
      : null;
  const originalName = selectedEntrant.name;

  const shouldUpdate = (entry) => {
    if (!entry) return false;
    if (seed !== null && entry.challongeSeed === seed) {
      return true;
    }
    if (seed === null && entry.name === originalName) {
      return true;
    }
    return false;
  };

  const updateEntry = (entry) => {
    if (!entry || typeof entry !== "object") {
      return 0;
    }
    entry[field] = newValue;
    return 1;
  };

  let updated = 0;
  const matches = Array.isArray(tournament.matches) ? tournament.matches : [];
  matches.forEach((match) => {
    ["entrant1", "entrant2", "entrant3"].forEach((key) => {
      if (match && shouldUpdate(match[key])) {
        updated += updateEntry(match[key]);
      }
    });
  });

  const rounds = tournament.rounds || {};
  Object.values(rounds).forEach((roundEntries) => {
    if (!Array.isArray(roundEntries)) return;
    roundEntries.forEach((entry) => {
      if (shouldUpdate(entry)) {
        updated += updateEntry(entry);
      }
    });
  });

  ["thirdPlaceEntrants", "final", "eliminated"].forEach((listKey) => {
    const list = tournament[listKey];
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      if (shouldUpdate(entry)) {
        updated += updateEntry(entry);
      }
    });
  });

  return updated;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-update-entrant")
    .setDescription("Update an entrant in the tournament."),

  async execute(interaction) {
    const dbInstance = GetDb();
    await dbInstance.read();
    const active = getActiveTournament(dbInstance);
    if (!active) {
      await interaction.reply({
        content: "No active tournament found.",
        ephemeral: true,
      });
      return;
    }

    const entrants = getEntrants(active.tournament);
    if (!entrants.length) {
      await interaction.reply({
        content: "No entrants found for the current tournament.",
        ephemeral: true,
      });
      return;
    }

    const { rows, page, totalPages } = buildEntrantMenu(entrants, 0);
    await interaction.reply({
      content: `Choose an entrant (page ${page + 1}/${totalPages}):`,
      components: rows,
      ephemeral: true,
    });
  },
};

module.exports.handleEntrantPage = async (interaction) => {
  const dbInstance = GetDb();
  await dbInstance.read();
  const active = getActiveTournament(dbInstance);
  if (!active) {
    await interaction.reply({
      content: "No active tournament found.",
      ephemeral: true,
    });
    return;
  }

  const entrants = getEntrants(active.tournament);
  const targetPage = parseInt(interaction.customId.split(":")[1], 10) || 0;
  const { rows, page, totalPages } = buildEntrantMenu(entrants, targetPage);
  await interaction.update({
    content: `Choose an entrant (page ${page + 1}/${totalPages}):`,
    components: rows,
  });
};

module.exports.handleEntrantSelect = async (interaction) => {
  const entryKey = interaction.values[0];
  const dbInstance = GetDb();
  await dbInstance.read();
  const active = getActiveTournament(dbInstance);
  if (!active) {
    await interaction.reply({
      content: "No active tournament found.",
      ephemeral: true,
    });
    return;
  }
  const entrants = getEntrants(active.tournament);
  const selectedEntrant = findEntrantByKey(entrants, entryKey);
  if (!selectedEntrant) {
    await interaction.reply({
      content: "That entrant could not be found. Please try again.",
      ephemeral: true,
    });
    return;
  }

  const fields = ["name", "title", "link", "type"];
  const fieldOptions = fields.map((field) =>
    new StringSelectMenuOptionBuilder().setLabel(field).setValue(field)
  );
  const fieldMenu = new StringSelectMenuBuilder()
    .setCustomId(`update-entrant-field:${entryKey}`)
    .setPlaceholder("Select field to update")
    .addOptions(fieldOptions);

  const row = new ActionRowBuilder().addComponents(fieldMenu);
  await interaction.update({
    content: `Updating: **${selectedEntrant.name}**. Select field:`,
    components: [row],
  });
};

module.exports.handleFieldSelect = async (interaction) => {
  const entryKey = interaction.customId.split(":")[1];
  const selectedField = interaction.values[0];
  const modal = new ModalBuilder()
    .setCustomId(`update-entrant-modal:${entryKey}:${selectedField}`)
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

module.exports.handleModalSubmit = async (interaction) => {
  const [, entryKey, selectedField] = interaction.customId.split(":");
  const newValue = interaction.fields.getTextInputValue("new_value");

  const dbInstance = GetDb();
  await dbInstance.read();
  const active = getActiveTournament(dbInstance);
  if (!active) {
    await interaction.reply({
      content: "No active tournament found.",
      ephemeral: true,
    });
    return;
  }

  const updatedCount = updateEntriesInTournament(
    active.tournament,
    entryKey,
    selectedField,
    newValue
  );
  await dbInstance.write();

  if (!updatedCount) {
    await interaction.reply({
      content:
        "I couldn't find that entrant to update. Please try again.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `Updated **${selectedField}** to **${newValue}** (${updatedCount} entries).`,
    ephemeral: true,
  });
};
