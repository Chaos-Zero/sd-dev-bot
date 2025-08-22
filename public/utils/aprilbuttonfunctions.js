const {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
} = require("discord.js");
const fs = require("fs");

eval(fs.readFileSync("./public/tournament/dmUtils.js") + "");

async function handleFoolButtonPress(interaction) {
  db.read();
  const guildObject = await bot.guilds.cache.get(process.env.GUILD_ID);

  const splitButtonName = interaction.customId.split("-");
  console.log(splitButtonName);

  console.log("Entering fool");
  //Button -> doubleElim-a-matchNumber
  var selection;

  await interaction
    .reply({
      content:
        "**GOTEM**\n\n**April fools!**\n\nHahaha. Aw, just look at your face! Egg all over it!\nIn all seriousness, you **can still vote for matches 97-100**, which end <t:1743537600:R>.\nPlease vote on them if you have not done so yet.",
      ephemeral: true,
    })
    .then(() => console.log("Reply sent."))
    .catch((_) => null);
  return;
}
