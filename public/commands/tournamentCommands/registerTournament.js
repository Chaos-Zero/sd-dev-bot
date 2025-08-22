const {
  SlashCommandBuilder,
  MessageAttachment,
  MessageCollector,
} = require("discord.js");
const { setTimeout } = require("timers/promises");

const fs = require("fs");
const fetch = require("node-fetch");

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
        .addChoices({ name: "One", value: "1" }, { name: "Two", value: "2" })
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
    ),

  async execute(interaction) {
    const tournamentName = interaction.options.getString("tournament-name");
    const tournamentFormat = interaction.options.getString("tournament-format");
    const matchesPerDay = interaction.options.getString("matches-per-day");
    const isRandom =
      interaction.options.getBoolean("randomise-tournament") || false;
    const isChallonge =
      interaction.options.getBoolean("create-challonge-bracket") || false;
    const isHiddenBracket =
      interaction.options.getBoolean("set-challonge-hidden") || false;

    // Ask for a CSV file
    await interaction.reply({
      content: "Please upload the CSV file for the tournament.",
      ephemeral: true,
    });
    // Wait for the next message (you can implement a proper way to get the next message)
    const collected = await interaction.channel.awaitMessages({
      filter: (m) => m.attachments.first(),
      max: 1,
      time: 60000,
      errors: ["time"],
    });

    // Process the message and get the CSV file
    const attachment = collected.first().attachments.first().url;
    console.log(attachment);
    if (attachment && attachment.includes(".csv")) {
      var currentTournament = db
        .get("tournaments[0].currentTournament")
        .value();

      if (currentTournament == "N/A") {
        // Respond that the tournament has started successfully
        await interaction.editReply(
          `Tournament "${tournamentName}" of type "${tournamentFormat}" started successfully.`
        );
        // Delete the user's last message after the CSV file has been loaded
        registerTournament(
           tournamentName,
          tournamentFormat,
          isRandom,
          isChallonge,
          isHiddenBracket,
          attachment,
          parseInt(matchesPerDay)
        );
        await collected.first().delete();
      } else {
        await interaction.editReply(
          `There appears to already be a tournament running. Please wait until "${currentTournament}" is complete.`
        );
        await collected.first().delete();
      }
    } else {
      await interaction.editReply(
        "Sorry, a CSV file must be the next thing you send. Please try the process again."
      );
    }
  },
};
