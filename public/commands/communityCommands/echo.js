const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("echo")
    .setDescription("Make the bot speak for you")
    .addStringOption((option) =>
      option
        .setName("input")
        .setDescription("What you want the bot to say.")
        .setRequired(true)
    ),
  async execute(interaction) {
    let inputString = interaction.options.getString("input") || "";
    //use %$ for return
    inputString = inputString.replace(/%\$/g, "\n");
    console.log(inputString)
    
    if (inputString == ""){
      return await interaction.reply({
        content:
          "You need to write something for the me to echo back out",
        ephemeral: true,
      });
    }
      
    
     return await interaction.reply({
        content: inputString,
        ephemeral: false,
      });
  },
};
