const { SlashCommandBuilder } = require("discord.js");

const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");
fs.readFileSync("./public/tournament/tournamentFunctions.js") + "";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("register-tournament")
    .setDescription("Register a new tournament using a CSV file.")
    .addStringOption((option) =>
      option
        .setName("tournament-name")
        .setDescription("Name of the tournament")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("tournament-format")
        .setDescription("Format of the tournament")
        .setRequired(true)
        .addChoices(
          { name: "Single Elimination", value: "Single Elimination" },
          { name: "Double Elimination", value: "Double Elimination" },
          { name: "3v3 Ranked", value: "3v3 Ranked" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("matches-per-day")
        .setDescription("The ammount of matches run at any given time")
        .setRequired(true)
        .addChoices(
          { name: "One", value: "1" },
          { name: "Two", value: "2" },
          { name: "Four", value: "4" }
        )
    )
    .addAttachmentOption((option) =>
      option
        .setName("csv-file")
        .setDescription("CSV file used to register the tournament.")
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("randomise-tournament")
        .setDescription("Randomise the order for the player matches.")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("create-challonge-bracket")
        .setDescription("Creates a challonge bracket.")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("set-challonge-hidden")
        .setDescription(
          "Has entries on challonge hidden in first round until match."
        )
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("participant-role-id")
        .setDescription("Role ID to ping for match updates (optional).")
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const tournamentName = interaction.options.getString("tournament-name");
    const tournamentFormat = interaction.options.getString("tournament-format");
    const matchesPerDay = interaction.options.getString("matches-per-day");
    const isRandom =
      interaction.options.getBoolean("randomise-tournament") || false;
    const isChallonge =
      interaction.options.getBoolean("create-challonge-bracket") || false;
    const isHiddenBracket =
      interaction.options.getBoolean("set-challonge-hidden") || false;
    const csvAttachment = interaction.options.getAttachment("csv-file");
    const rawRoleId = interaction.options.getString("participant-role-id");
    const participantRoleId = rawRoleId
      ? rawRoleId.replace(/\D/g, "")
      : "";

    const dbInstance = GetDb();
    await dbInstance.read();
    const tournamentDetails = dbInstance.get("tournaments").nth(0).value();
    if (tournamentDetails?.[tournamentName]) {
      await interaction.editReply({
        content:
          `A tournament named "${tournamentName}" already exists. ` +
          "Please use a different name.",
      });
      return;
    }

    const attachment = csvAttachment?.url;
    console.log(attachment);
    if (attachment && attachment.toLowerCase().includes(".csv")) {
      let currentTournament = dbInstance
        .get("tournaments[0].currentTournament")
        .value();
      if (!currentTournament) {
        currentTournament = "N/A";
        dbInstance
          .get("tournaments")
          .nth(0)
          .assign({ currentTournament })
          .write();
      }

      if (currentTournament === "N/A") {
        const result = await registerTournament(
          tournamentName,
          tournamentFormat,
          isRandom,
          isChallonge,
          isHiddenBracket,
          attachment,
          parseInt(matchesPerDay),
          participantRoleId
        );
        if (!result?.ok) {
          await interaction.editReply(
            result?.message ||
              "Tournament setup failed. Please check the CSV and try again."
          );
          return;
        }
        await interaction.editReply(
          `Tournament "${tournamentName}" of type "${tournamentFormat}" started successfully.`
        );
      } else {
        await interaction.editReply(
          `There appears to already be a tournament running. Please wait until "${currentTournament}" is complete.`
        );
      }
    } else {
      await interaction.editReply(
        "Sorry, the CSV file attachment is missing or invalid. Please try again."
      );
    }
  },
};
