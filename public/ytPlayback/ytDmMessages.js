const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const fs = require("fs");
eval(fs.readFileSync("./public/collections/roles.js") + "");

const domoHelpThumb = "http://91.99.239.6/files/assets/bowtie.png";

const domoHelpCategoryColors = {
  tournamentAdmin: 0x8e44ad,
  tournamentAnalytics: 0x2ecc71,
  tracks: 0x8b0000,
  youtube: 0xFF0000,
  guessingGame: 0xffd700,
  misc: 0xffffff,
};

const domoHelpCategoryThumbs = {
  tournamentAdmin: "http://91.99.239.6/files/assets/guess/admin2.png",
  tournamentAnalytics: "http://91.99.239.6/files/assets/guess/ggplaying.png",
  tracks: "http://91.99.239.6/files/assets/guess/ggstarted.png",
  youtube: "http://91.99.239.6/files/assets/guess/ggame.png",
  guessingGame: "http://91.99.239.6/files/assets/guess/ggpoints.png",
  misc: "http://91.99.239.6/files/assets/guess/misc.png",
};

const domoHelpFoot = {
  text: "Supradarky's VGM Club",
  iconURL: "http://91.99.239.6/files/assets/sd-img.png",
};

function getDomoHelpCategories() {
  return [
    {
      id: "tournament-admin",
      title: "Tournament Setup & Admin",
      summary: "Create, manage, and resend tournament matches.",
      color: domoHelpCategoryColors.tournamentAdmin,
      thumbnail: domoHelpCategoryThumbs.tournamentAdmin,
      commands: [
        {
          name: "/tournament-register",
          desc: "Register a new tournament using a CSV file.\n If you would like step by step instructios on how to set up a tournament, you can send `tournament-help` in a DM to the bot.",
          args:
            "tournament-name*, tournament-format*, matches-per-day*, csv-file*, post-time (UTC hourly, confirm with timezone prompt), include-weekends, randomise-tournament, create-challonge-bracket, set-challonge-hidden, participant-role-id, notes: <fill-in>",
        },
        {
          name: "/tournament-start-match",
          desc: "Manually start a day's worth of matches for the current tournament.",
          args: "none",
        },
        {
          name: "/tournament-change-match-per-round",
          desc: "Change matches-per-day for the current tournament.",
          args: "matches-per-day* (1/2/4)",
        },
        {
          name: "/tournament-resend-current-matches",
          desc: "Resend currently active matches without DB changes.",
          args: "include-results, include-logs",
        },
        {
          name: "/tournament-remove-tournament",
          desc: "Remove a tournament from the DB (confirmation required).",
          args: "tournament-name*",
        },
        {
          name: "/tournament-set-test-mode",
          desc: "Route all tournament messages/logs to a test channel.",
          args: "channel*",
        },
        {
          name: "/tournament-clear-test-mode",
          desc: "Disable test mode routing.",
          args: "none",
        },
        {
          name: "/tournament-add-match-art",
          desc: "Upload artwork for a match embed.",
          args: "match-number*, artist-name*, image*",
        },
        {
          name: "/tournament-edit-embeds",
          desc: "Edit an embed by message ID.",
          args: "channel*, message-id*",
        },
        {
          name: "/tournament-update-entrant",
          desc: "Interactively update an entrant field.",
          args: "interactive prompts",
        },
        {
          name: "/tournament-toggle-dm-receipts",
          desc: "Toggle DM vote receipts.",
          
        },
        {
          name: "/tournament-manage-admin",
          desc: "Add or remove Domo Admins (owner/admin only).",
          args: "action* (add-user/remove-user/add-role/remove-role), user (required for add-user), role (required for add-role)",
        },
        {
          name: "/tournament-set-time",
          desc: "Set the daily tournament post time (UTC, 24-hour).",
          args: "time* (UTC hourly)",
        },
        {
          name: "/tournament-set-weekends",
          desc: "Enable or disable weekend tournament posting.",
          args: "include-weekends*",
        },
      ],
    },
    {
      id: "tournament-analytics",
      title: "Tournament Analytics",
      summary: "Compatibility and voting insights.",
      color: domoHelpCategoryColors.tournamentAnalytics,
      thumbnail: domoHelpCategoryThumbs.tournamentAnalytics,
      commands: [
        {
          name: "/tournament-most-compatible",
          desc: "Find your most compatible voter based on shared votes.",
          args: "make-public, specify-participation-percentage, search-all-tournaments",
        },
        {
          name: "/tournament-user-compatibility",
          desc: "Compare your votes with another user.",
          args: "other-member*, make-public, search-all-tournaments",
        },
        {
          name: "/tournament-taste-makers",
          desc: "Find who most often voted for winners.",
          args: "make-public, include-low-participation",
        },
        {
          name: "/tournament-iconoclast",
          desc: "Find who most often voted against winners.",
          args: "make-public, include-low-participation",
        },
      ],
    },
    {
      id: "tracks",
      title: "Tracks & Playlists",
      summary: "Pull tracks or generate playlists.",
      color: domoHelpCategoryColors.tracks,
      thumbnail: domoHelpCategoryThumbs.tracks,
      commands: [
        {
          name: "/sd-track",
          desc: "Get a SupraDarky track (random or filtered).",
          args: "track-number, series, year, make-public",
        },
        {
          name: "/community-track",
          desc: "Get a community track (random or filtered).",
          args: "contributor, track-number, series, year, include-supra, make-public",
        },
        {
          name: "/generate-playlist",
          desc: "Generate a 10-track playlist.",
          args: "contributor, series, year, make-public",
        },
      ],
    },
    {
      id: "youtube",
      title: "YouTube & Playlist Tracking",
      summary: "Manage playlist tracking and user themes.",
      color: domoHelpCategoryColors.youtube,
      thumbnail: domoHelpCategoryThumbs.youtube,
      commands: [
        {
          name: "/toggle-playlist-channel",
          desc: "Toggle a channel for playlist tracking.",
          args: "channel-name*, channel-type* (permanent/spotlight), new-playlist-frequency",
        },
        {
          name: "/list-yt-channels",
          desc: "List registered playlist tracking channels.",
          
        },
        {
          name: "/yt-register-user-theme",
          desc: "Set your personal listening party theme song.",
          args: "youtube-url*",
        },
      ],
    },
    {
      id: "guessing-game",
      title: "Guessing Game",
      summary: "Host and manage guessing games.",
      color: domoHelpCategoryColors.guessingGame,
      thumbnail: domoHelpCategoryThumbs.guessingGame,
      commands: [
        {
          name: "/gg-host-guessing-game",
          desc: "Start a guessing game session.",
          args: "add-cohosts",
        },
        {
          name: "/gg-register-cohost",
          desc: "Add cohosts to the current game.",
          args: "cohosts*",
        },
        {
          name: "/gg-show-guessing-game-scores",
          desc: "Show current guessing game scores.",
          
        },
        {
          name: "/gg-end-guessing-game",
          desc: "End the guessing game and post results.",
          
        },
      ],
    },
    {
      id: "misc",
      title: "Misc",
      summary: "Utility commands.",
      color: domoHelpCategoryColors.misc,
      thumbnail: domoHelpCategoryThumbs.misc,
      commands: [
        {
          name: "/ping",
          desc: "Check if the bot is alive.",
          
        },
        {
          name: "/echo",
          desc: "Have the bot repeat a message.",
          args: "input*",
        },
        {
          name: "/help",
          desc: "Show this help menu.",
          args: "topic",
        },
      ],
    },
  ];
}

function buildHelpTopicSelectMenu() {
  const categories = getDomoHelpCategories();
  const options = categories.map((category) => ({
    label: category.title,
    description: category.summary.slice(0, 100),
    value: category.id,
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("domo-help-topic")
      .setPlaceholder("Select a help topic")
      .addOptions(options)
  );
}

function normalizeHelpTopic(input) {
  if (!input) return "";
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function findHelpCategory(topic) {
  const normalized = normalizeHelpTopic(topic);
  if (!normalized) return null;

  const categories = getDomoHelpCategories();
  for (const category of categories) {
    if (
      normalized === category.id ||
      normalized === category.title.toLowerCase()
    ) {
      return category;
    }
  }

  const aliases = {
    "tournaments": "tournament-admin",
    "tournament": "tournament-admin",
    "tournament admin": "tournament-admin",
    "tournament setup": "tournament-admin",
    "tournament analytics": "tournament-analytics",
    "analytics": "tournament-analytics",
    "compatibility": "tournament-analytics",
    "tracks": "tracks",
    "playlists": "tracks",
    "youtube": "youtube",
    "playlist tracking": "youtube",
    "guessing game": "guessing-game",
    "guessing games": "guessing-game",
    "misc": "misc",
  };

  const alias = aliases[normalized];
  if (!alias) return null;
  return categories.find((category) => category.id === alias) || null;
}

function findHelpCommand(topic) {
  const normalized = normalizeHelpTopic(topic).replace(/\//g, "");
  if (!normalized) return null;
  const categories = getDomoHelpCategories();
  for (const category of categories) {
    for (const command of category.commands) {
      const commandName = command.name.replace("/", "").toLowerCase();
      if (normalized === commandName) {
        return { command, category };
      }
    }
  }
  return null;
}

function buildHelpIntroEmbed() {
  const categories = getDomoHelpCategories();
  const descriptionLines = [
    "Hi! Here are the command categories available:",
    "",
    ...categories.map(
      (category) => `• **${category.title}** — ${category.summary}`
    ),
    "",
    "Reply with **`Domo help <category>`** or **`Domo help /command`** to see details.",
    "Example: `Domo help tournament setup` or `Domo help /tournament-register`",
  ];

  return new EmbedBuilder()
    .setTitle("MajorDomo Help")
    .setColor(0x5865f2)
    .setThumbnail(domoHelpThumb)
    .setDescription(descriptionLines.join("\n"))
    .setFooter(domoHelpFoot);
}

function buildHelpCategoryEmbed(category) {
  const lines = category.commands.map((command) => {
    const args = command.args || "none";
    return `**${command.name}** — ${command.desc}\nOptions: \`${args}\``;
  });

  return new EmbedBuilder()
    .setTitle(category.title)
    .setColor(category.color || 0x4aa3df)
    .setThumbnail(category.thumbnail || domoHelpThumb)
    .setDescription(lines.join("\n\n"))
    .setFooter(domoHelpFoot);
}

function buildHelpCommandEmbed(command, category) {
  return new EmbedBuilder()
    .setTitle(`${command.name} — ${category.title}`)
    .setColor(category.color || 0x43b581)
    .setThumbnail(category.thumbnail || domoHelpThumb)
    .setDescription(
      `**What it does:** ${command.desc}\n**Options:** \`${command.args || "none"}\``
    )
    .setFooter(domoHelpFoot);
}

async function SendDomoHelpIntroDm(user) {
  const embed = buildHelpIntroEmbed();
  const row = buildHelpTopicSelectMenu();
  return await user
    .send({ embeds: [embed], components: [row] })
    .catch(console.error);
}

async function SendDomoHelpDetailsDm(user, topic) {
  const category = findHelpCategory(topic);
  if (category) {
    const embed = buildHelpCategoryEmbed(category);
    return await user.send({ embeds: [embed] }).catch(console.error);
  }

  const commandMatch = findHelpCommand(topic);
  if (commandMatch) {
    const embed = buildHelpCommandEmbed(
      commandMatch.command,
      commandMatch.category
    );
    return await user.send({ embeds: [embed] }).catch(console.error);
  }

  const fallbackEmbed = new EmbedBuilder()
    .setTitle("Help Topic Not Found")
    .setColor(0xffc107)
    .setThumbnail(domoHelpThumb)
    .setDescription(
      "I couldn't find that category or command. Try **`Domo help`** to see the available categories."
    )
    .setFooter(domoHelpFoot);

  return await user.send({ embeds: [fallbackEmbed] }).catch(console.error);
}

async function SendTournamentHelpDm(message) {
  const introEmbed = new EmbedBuilder()
    .setTitle("Tournament Setup — Quick Start")
    .setColor(0x8e44ad)
    .setThumbnail(
      "http://91.99.239.6/files/assets/domo_smarty_pants_face.png"
    )
    .setDescription(
      [
        "**Welcome!** This is a quick guide to getting an automated tournament running using the options available with the `/tournament-register` slash command.",
        "",
        "",
      ].join("\n")
    )
    .setFooter(domoHelpFoot);

  const csvEmbed = new EmbedBuilder()
    .setTitle("Step 1 — Prepare Your CSV")
    .setColor(0x8e44ad)
    .setThumbnail("http://91.99.239.6/files/assets/sd_logo.png")
    .setDescription(
      [
        "Tournaments require a CSV file uplodaed with columns `title`, `name`, and `link` to read correctly. This can be easily achieved by exporting any type of spreadsheet to the CSV format.",
        "",
        "Below is an exmaple using Google Sheets",
      ].join("\n")
    )
    .setFooter(domoHelpFoot);

  const registerEmbed = new EmbedBuilder()
    .setTitle("Step 2 — Register the Tournament")
    .setColor(0x8e44ad)
    .setThumbnail("http://91.99.239.6/files/assets/bowtie.png")
    .setDescription(
      [
        "Use **`/tournament-register`** with your CSV.",
        "_TODO: Describe options and best practices._",
        "",
        "Notes: <fill-in>",
      ].join("\n")
    )
    .setFooter(domoHelpFoot);

  const runEmbed = new EmbedBuilder()
    .setTitle("Step 3 — Run Daily Matches")
    .setColor(0x8e44ad)
    .setThumbnail("http://91.99.239.6/files/assets/Next.png")
    .setDescription(
      [
        "Use **`/tournament-start-match`** each day to post new matches.",
        "_TODO: Explain timing, tie behavior, and resends._",
      ].join("\n")
    )
    .setFooter(domoHelpFoot);

  const adminEmbed = new EmbedBuilder()
    .setTitle("Tips & Admin Tools")
    .setColor(0x8e44ad)
    .setThumbnail("http://91.99.239.6/files/assets/album_art.png")
    .setDescription(
      [
        "_TODO: Add tips about test mode, resending, match art, and edits._",
        "",
        "Useful commands: `/tournament-set-test-mode`, `/tournament-resend-current-matches`, `/tournament-add-match-art`.",
      ].join("\n")
    )
    .setFooter(domoHelpFoot);

  const embeds = [
    introEmbed,
    csvEmbed,
    registerEmbed,
    runEmbed,
    adminEmbed,
  ];

  return await message.author.send({ embeds }).catch(console.error);
}

async function HandleDomoHelpTopicSelect(interaction) {
  const selected = interaction.values?.[0];
  if (!selected) {
    return interaction.reply({
      content: "Please choose a valid help topic.",
      ephemeral: true,
    });
  }
  const category = getDomoHelpCategories().find(
    (item) => item.id === selected
  );
  if (!category) {
    return interaction.reply({
      content: "That help topic is no longer available.",
      ephemeral: true,
    });
  }
  const embed = buildHelpCategoryEmbed(category);
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

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
    `Starting a game (/gg-host-guessing-game) is simple and when underway guessing game followers will have been alerted in the **"#guessing-games"** channel.\n\n` +
    
`When using \`/gg-host-guessing-game\`, there is an option called \`add-cohosts\` that will allow other users the same permissions as the main host. Cohosts can also be added at any time using \`gg-register-cohost\`.\n\n` + 
"**Once you are finished with your guessing game, please ensure you run `/end-guessing-game` to send totals and allow users to use the bot again**!";

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

  var embeds = [startEmbed, pointsTrackerEmbed];

  await message.author.send({ embeds: embeds });
}
