const { SlashCommandBuilder } = require("discord.js");

const fs = require("fs");
const sleep = require("util").promisify(setTimeout);
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/tournament/challonge/challongeClient.js") + "");
eval(
  fs.readFileSync("./public/tournament/tournamentFunctions.js") + ""
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("end-matches")
    .setDescription("Backend Test."),
  async execute(interaction) {
    await interaction.reply({
      content: "Sending Messages...",
      components: [],
      ephemeral: true,
    });
    var previousMatches = await EndMatches(interaction);

    var db = GetDb();
    db.read();

    let currentTournamentName = await getCurrentTournament(db);
    let tournamentDetails = await db.get("tournaments").nth(0).value();

    if (tournamentDetails.currentTournament == "N/A") {
      await interaction.editReply({
        content:
          "There doesn't appear to be a tournament running at this time.",
        ephemeral: true,
      });
      return;
    }
    let doubleEliminationName = await db
      .get("tournaments[0].currentTournament")
      .value();
    console.log(doubleEliminationName);
    let tournamentDb = await tournamentDetails[doubleEliminationName];

    const urlName = replaceSpacesWithUnderlines(currentTournamentName);

    await saveTournamentStructure(urlName, tournamentDb, db)
      .then((response) => {
        //console.log("Users ordered:", response);
      })
      .catch((error) => {
        console.error("Error: ", error);
      });

    await sleep(10000);

    console.log("Finished with previous Matches");
    await interaction.editReply("Sending Messages");
    const matchesPerDay = tournamentDb?.roundsPerTurn || 1;
    await StartMatch(interaction, "", false, previousMatches, false, matchesPerDay);
    // 30 Seconds to be safe
    //await sleep(30000);
    //await startMatch(interaction, "", true);

    //await interaction.followup.editReply("ok!");

    //await interaction.followup.editReply("ok!");
  },
};

function replaceSpacesWithUnderlines(str) {
  return str.replace(/ /g, "_");
}
