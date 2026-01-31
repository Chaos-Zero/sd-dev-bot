const { SlashCommandBuilder } = require("discord.js");

const fs = require("fs");
eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/tournament/dmUtils.js") + "");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-toggle-dm-receipts")
    .setDescription(
      "Toggle whether you would like DM messages which track you votes in tournaments."
    ),
  async execute(interaction) {
    var db = GetDb();
    await db.read();
    let tournamentDetails = await db.get("tournaments").nth(0).value();
    var receiptUsers = tournamentDetails.receiptUsers;

    console.log("We are in the notice function");
    const user = receiptUsers.find((u) => u.id == interaction.member.id);

    if (!user) {
      RegisterUserReceipts(interaction, true);
      await interaction
        .reply({
          content: "You will now receive DM's when casting votes.",
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    } else if (!user.status) {
      RegisterUserReceipts(interaction, true);
      await interaction
        .reply({
          content: "You will now receive DM's when casting votes.",
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    } else if (user.status) {
      RegisterUserReceipts(interaction, false);
      await interaction
        .reply({
          content:
            "You will no longer receive DM's on votes cast.",
          components: [],
          ephemeral: true,
        })
        .catch(console.error);
      return;
    }
  },
};
