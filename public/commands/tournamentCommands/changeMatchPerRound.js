const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/tournament/tournamentFunctions.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-set-matches-per-day")
    .setDescription("Change the matches-per-round setting for the current tournament.")
    .addIntegerOption((option) =>
      option
        .setName("matches-per-day")
        .setDescription("Number of matches to run each round.")
        .setRequired(true)
        .addChoices(
          { name: "One", value: 1 },
          { name: "Two", value: 2 },
          { name: "Four", value: 4 }
        )
    ),
  async execute(interaction) {
    const matchesPerDay = interaction.options.getInteger("matches-per-day");
    const db = GetDb();
    await db.read();
    const currentTournamentName = await getCurrentTournament(db);
    const tournamentDetails = await db.get("tournaments").nth(0).value();
    if (!tournamentDetails || currentTournamentName === "N/A") {
      return interaction.reply({
        content:
          "There doesn't appear to be a tournament running at this time.",
        ephemeral: true,
      });
    }
    const tournament = tournamentDetails[currentTournamentName];
    tournament.roundsPerTurn = matchesPerDay;
    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: tournament,
      })
      .write();

    return interaction.reply({
      content: `Matches per round updated to ${matchesPerDay}.`,
      ephemeral: true,
    });
  },
};
