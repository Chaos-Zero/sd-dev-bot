const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
eval(fs.readFileSync("./public/utils/messageutils.js") + "");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("reactions")
    .setDescription("Test command."),
  async execute(interaction) {
    // interaction.user is the object representing the User who ran the command
    // interaction.member is the GuildMember object, which represents the user in the specific guild

    var prevEmbed = new EmbedBuilder();
    prevEmbed
      .setAuthor({
        name: "Previous Battle Update",
        iconURL:
          "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
      })
      .setTitle(
        ":warning: The previous battle has resulted in a draw! :warning:"
      )
      .setDescription(
        "Please reconsider your votes for our previous round if you have voted for third place.\n" +
          "The Previous round has had a further 24 hours added. Thank you for your cooperation.\n" +
          "-The SupraDarky Team"
      )
      .setColor(0xFF0000);

    var timeForRound = GetTimeInEpochStamp(24);

    var channel = await GetChannelByName(
      interaction.member.guild,
      process.env.TOURNAMENT_CHANNEL
    );

    channel.messages.fetch(`1080902116350103552`).then((message) => {
      console.log(message.embeds);
      console.log(message.embeds[1].fields);
      message.embeds[0] = prevEmbed;
      message.edit({ embeds: message.embeds });
    });

    var channelMessage = await interaction.reply("Constructing Embed");

    //SendDailyEmbed(channel);
  },
};
