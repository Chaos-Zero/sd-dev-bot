const { Events } = require("discord.js");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    console.log(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`
      );
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}`);
      console.error(error);
      const content = String(error && error.message).includes("410")
        ? "The requested content is no longer available, has been age restricted, or is region locked.\nPlease try a different link."
        : "Something went wrong running that command. It has been logged -- please try again.";
      // Without this a command that fails after deferring leaves the caller
      // looking at "thinking..." for ever.
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content, embeds: [], components: [] });
        } else {
          await interaction.reply({ content, ephemeral: true });
        }
      } catch (replyError) {
        console.error("Could not report the failure to the user:", replyError);
      }
    }
  },
};
