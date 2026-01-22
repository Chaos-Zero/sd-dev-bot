const { SlashCommandBuilder } = require("discord.js");

const fs = require("fs");
const sleep = require("util").promisify(setTimeout);
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/tournament/tournamentFunctions.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("start-match")
    .setDescription("If there is a tournament set up, we can manually start a days worth of matches using this command."),
  async execute(interaction) {
    await interaction.reply("Sending Messages");
    const previousMatches = await EndMatches(interaction);

    const db = GetDb();
    db.read();
    const currentTournamentName = await getCurrentTournament(db);
    const tournamentDetails = await db.get("tournaments").nth(0).value();
    if (!tournamentDetails || currentTournamentName === "N/A") {
      return interaction.editReply(
        "There doesn't appear to be a tournament running at this time."
      );
    }
    const tournamentDb = tournamentDetails[currentTournamentName];
    const matchesPerDay = tournamentDb?.roundsPerTurn || 1;

    for (let i = 0; i < matchesPerDay; i++) {
      const result = await StartMatch(
        interaction,
        "",
        i > 0,
        i === 0 ? previousMatches : []
      );
      if (result?.blocked) {
        break;
      }
      if (i < matchesPerDay - 1) {
        await sleep(15000);
      }
    }
    //await interaction.followup.editReply("ok!");
  },
};
