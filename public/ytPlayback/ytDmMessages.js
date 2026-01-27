const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
eval(fs.readFileSync("./public/collections/roles.js") + "");

async function SendGuessingGameHelpDmMessage(user) {
  const description =
    `Hello and thanks for taking the time to host a guessing game for the server!\n\n` +
    `If you've used MajorDomo before then have a great time and just remember to use \`/gg-end-guessing-game\` when you're finished.\n\n` +
    `If this is your first time using MajorDomo for a guessing game, or you just want a refresher, reply "\`gghelp\`" in my DM's to get some more information on what I offer and how commands change during your game.\n`;

  var initalHelpEmbed = new EmbedBuilder()
    .setTitle(`So it looks like you're hosting a guessing game!`)
    .setColor(0xff0000)
    .setThumbnail(
      "http://91.99.239.6/files/assets/guess/ggame.png"
    )
    .setDescription(description)
    .setFooter({
      text: "Supradarky's VGM Club",
      iconURL:
        "http://91.99.239.6/files/assets/guess/sd-img.png",
    });

  return await user.send({ embeds: [initalHelpEmbed] }).catch(console.error);
}

async function SendGuessingGameInstructionDm(message) {
  const startDescription =
    `Starting a game is already underway and guessing game followers will have been alerted in the **"#guessing-games"** channel.\n\n` +
    `Once you\'re ready to start playing, join the **"VGM Station"** voice channel and then use the \`/yt-play\` slash command in the **"#listening-parties-host"** text channel.\n\n**All playback commands should be used in the **"#listening-parties-host"** channel**.\n\n` +
    `Paste your **YouTube playlist url** into the \`song-url\` option which appears automatically once the \`/yt-play\` slash command is selected.\n\n` +
    `**This will start MajorDomo-Bot playback automatically** and your pre-game or main game can start!\n\n` +
    `You can start playlists and wait until completion or continue to use the \`/yt-play\` slash command to queue up more music.\n\n` + 
`When using \`/gg-host-guessing-game\`, there is an option called \`add-cohosts\` that will allow other users the same permissions as the main host. Cohosts can also be added at any time using \`gg-register-cohost\`.\n\n`;

  var startEmbed = new EmbedBuilder()
    .setTitle(`How to start your list`)
    .setColor(0xed8947)
    .setThumbnail(
      "http://91.99.239.6/files/assets/guess/ggstarted.png"
    )
    .setDescription(startDescription)
    .setFooter({
      text: "Supradarky's VGM Club",
      iconURL:
        "http://91.99.239.6/files/assets/sd-img.png",
    });

  const changesDescription =
    "When the bot is in '*Guessing Game Mode*', the following changes in normal usage will occur:1\n\n" +
    "- When using `/yt-play`, the length of song and number of songs will be shown to be added to the queue without any identifying information \n" +
    " - This means there will be no names, playlist titles or links shown to the server\n" +
    " - Even with information stripped, the messages will only be sent to you\n" +
    "- The `/current-track` option will show the progress and duration of the current track playing, but no name or link will be shown\n" +
    " - This is the only slash command others will be able to use when you (and cohost) are hosting the guessing games.\n";
  "- Other users **will not** be able to add, move, or edit songs in any way\n" +
    " - You will be still be able to use all commands.\n" +
    "- '/yt-show-queue` will show you **the name of what's currently playing** and the names of what's to come.\n" +
    " - '/yt-show-queue` will only show queue to only you. The message received will only be sent to you, and nobody else will be able to use the command.\n\n" +
    "You can run `/yt-play` at any time meaning you do not have to queue up all you songs at once. Playlists can be added during playback or after the current lot has ended (such as running a pre-game playlist, ending playback, then adding your main list). While you are in *guessing game mode*, nobody else will be able to add songs.\n\n" +
    "**Once you are finished with your guessing game, please ensure you run `/end-guessing-game` to allow users to use the bot again**!\nWe hope this has been informative and that you have fun!";

  var changeEmbed = new EmbedBuilder()
    .setTitle(`Bot behavior during guessing games`)
    .setColor(0x07d074)
    .setThumbnail(
      "http://91.99.239.6/files/assets/guess/ggplaying.png"
    )
    .setDescription(changesDescription)
    .setFooter({
      text: "Supradarky's VGM Club",
      iconURL:
        "http://91.99.239.6/files/assets/sd-img.png",
    });

  const pointsTrackerDescription =
    `While playing a game, you can award points by reacting to users messages in the **\"#guessing-games\"** channel!\n\n` +
    `Points can be awarded by hosts using the following reaction emojiis on messages:\n\n ` +
    `> <:twopoint:${pointEmotes["two"]}>: Grants the player 2 full points\n` +
    `> <:onepoint:${pointEmotes["one"]}>: Grants the player 1 full point\n` +
    `> <:halfpoint:${pointEmotes["half"]}>: Grants the player half a point (0.5)\n` +
    `> <:quarterpoint:${pointEmotes["quarter"]}>: Grants the player a quarter of a point (0.25)\n` +
    `> <:tenthpoint:${pointEmotes["tenth"]}>: Grants the player a tenth of a point (0.1)\n\n` +
    `**If you wish to remove any points, just remove the reaction!**\n\nEven if other players react with these emojiis, only the hosts can award points.` +
    `If any points are awarded using reactions throughout the game, a message with the participant scores will be sent to the **\"#guessing-games\"** channel after using the \`/gg-end-guessing-game\` command!\n` +
    ` As a note, the final message will show the point totals of each player, but not where they have scored the points.\n\n` +
    `Hosts can also use the \`/gg-show-guessing-game-scores\` at any time to check standings during a game.\n\n` +
    "This is a completely optional feature and we hope it helps out in future games.";

  var pointsTrackerEmbed = new EmbedBuilder()
    .setTitle(`Domo can keep score for you!`)
    .setColor(0xffd700)
    .setThumbnail(
      "http://91.99.239.6/files/assets/guess/ggpoints.png"
    )
    .setDescription(pointsTrackerDescription)
    .setFooter({
      text: "Supradarky's VGM Club",
      iconURL:
        "http://91.99.239.6/files/assets/sd-img.png",
    });

  var embeds = [startEmbed, changeEmbed, pointsTrackerEmbed];

  await message.author.send({ embeds: embeds });
}
