// Required Declarations
const {
  Client,
  Collection,
  RichEmbed,
  Intents,
  ActivityType,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} = require("discord.js");

const Discord = require("discord.js");
const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require("@discordjs/voice");
const ytdl = require("ytdl-core");
const csvParser = require("csv-parser");
const fs = require("fs");
const sleep = require("util").promisify(setTimeout);
const cron = require("cron");
eval(fs.readFileSync("./public/imports.js") + "");
eval(fs.readFileSync("./public/utils/messageutils.js") + "");

const nodefs = require("node:fs");
const path = require("node:path");

const QueueManager = require(path.join(
  require.main.path,
  "public",
  "ytPlayback",
  "queueManager"
));

var FileSync = require("lowdb/adapters/FileSync");
var adapter = new FileSync(".data/db.json");
var low = require("lowdb");
if (typeof db === "undefined") {
  db = new low(adapter);
}
var botAccess;
let sendDailyEmbed;

//runningTournament.updateScore(32, 40);
//runningTournament.updateScore(25, 21);

//runningTournament.checkMatch();
//runningTournament.checkMatch();

DbDefaultSetup(db);
function GetDb() {
  return db;
}

function refreshDb() {
  //db.read()
  console.log("Db's reloaded");
}

// If we want to pass this around, it needs to be in an object to pass the value by refernce, otherwise, it's just copied
global.userAlbumResults = new Map();

function CreateBot() {
  const intents = [
    //'NON_PRIVILEGED', // include all non-privileged intents, would be better to specify which ones you actually need
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // lets you request guild members (i.e. fixes the issue)
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildVoiceStates,
  ];

  const bot = new Discord.Client({
    intents: intents,
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });
  bot.setMaxListeners(0);

  //Log the Bot in
  const botKey = process.env.BOT_KEY;
  bot.login(`${botKey}`).catch(console.error);
  bot.on("ready", async () => {
    //Set bot card information
    bot.user.setPresence({
      activities: [{ name: "VGM!", type: ActivityType.Listening }],
      status: "Downloading ALL THE INTERNET!",
    });
    console.log("This bot is active!");
    // Set check chron here
  });
  botAccess = bot;
  ResetTournamentSchedule();
  //sendAprilFools.start();
  //checkTournamentBattleReactions.start();
  //checkTournamentBattleReactions2.start();
  return bot;
}

function GetBot() {
  return botAccess;
}

let sendAprilFools = new cron.CronJob("00 00 19 * * 1-5", async () => {
  CreateAprilFools();
  //await StartMatch("", GetBot(), true);
});

function ensureTournamentRoot(dbInstance) {
  const tournaments = dbInstance.get("tournaments").value() || [];
  if (tournaments.length > 0 && tournaments[0]) {
    return tournaments[0];
  }
  const base = {
    currentTournament: "N/A",
    receiptUsers: [],
    admin: [],
    adminRoles: [],
    testMode: {
      enabled: false,
      channelId: "",
      channelName: "",
    },
    tournamentPostTime: "19:00",
    tournamentIncludeWeekends: false,
  };
  dbInstance.get("tournaments").push(base).write();
  return base;
}

function normalizeScheduleTime(input) {
  if (!input) {
    return "19:00";
  }
  const trimmed = String(input).trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return "19:00";
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return "19:00";
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "19:00";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getTournamentScheduleSettings(dbInstance) {
  const tournamentRoot = ensureTournamentRoot(dbInstance);
  const normalizedTime = normalizeScheduleTime(
    tournamentRoot.tournamentPostTime
  );
  const includeWeekends = tournamentRoot.tournamentIncludeWeekends === true;
  const updates = {};
  if (tournamentRoot.tournamentPostTime !== normalizedTime) {
    updates.tournamentPostTime = normalizedTime;
  }
  if (tournamentRoot.tournamentIncludeWeekends !== includeWeekends) {
    updates.tournamentIncludeWeekends = includeWeekends;
  }
  if (Object.keys(updates).length > 0) {
    dbInstance.get("tournaments").nth(0).assign(updates).write();
  }
  return {
    time: normalizedTime,
    includeWeekends,
  };
}

function buildTournamentCronExpression(time, includeWeekends) {
  const [hour, minute] = time.split(":");
  const dayField = includeWeekends ? "*" : "1-5";
  return `00 ${minute} ${hour} * * ${dayField}`;
}

async function runDailyTournamentMatches() {
  var previousMatches = "";
  const bot = GetBot();
  if (!bot) {
    console.log("Bot not ready for tournament schedule yet.");
    return;
  }
  let guildObject = await bot.guilds.cache.get(process.env.GUILD_ID);
  previousMatches = await EndMatches();

  var db = GetDb();
  db.read();

  let currentTournamentName = await getCurrentTournament(db);
  let tournamentDetails = await db.get("tournaments").nth(0).value();

  if (tournamentDetails.currentTournament == "N/A") {
    console.log(
      "There doesn't appear to be a tournament running at this time."
    );
    return;
  }
  let tournamentName = await db.get("tournaments[0].currentTournament").value();
  console.log(tournamentName);
  let tournamentDb = await tournamentDetails[tournamentName];

  // Challonge stuff
  const urlName = replaceSpacesWithUnderlines(currentTournamentName);

  await sleep(1000);

  console.log("Finished with previous Matches");
  //await SendPreviousSingleDayResultsEmbeds(guildObject, previousMatches, []);
  const matchesPerDay = getAdjustedMatchesPerDay(tournamentDb);
  const loopCount =
    tournamentDb?.tournamentFormat === "Single Elimination" ? 1 : matchesPerDay;
  for (let matchIndex = 0; matchIndex < loopCount; matchIndex++) {
    const isSecondOfDay = matchIndex > 0;
    const shouldIncludePreviousMatches = matchIndex === 0;
    const result = await StartMatch(
      "",
      GetBot(),
      isSecondOfDay,
      shouldIncludePreviousMatches ? previousMatches : [],
      matchIndex > 0,
      matchesPerDay
    );
    if (result?.reason) {
      console.log("StartMatch halted:", result.reason);
    }
    if (result?.blocked || result?.stopForDay) {
      break;
    }
    if (matchIndex < matchesPerDay - 1) {
      // 30 Seconds to be safe
      await sleep(30000);
    }
  }
}

function ResetTournamentSchedule() {
  const schedule = getTournamentScheduleSettings(db);
  const cronExpression = buildTournamentCronExpression(
    schedule.time,
    schedule.includeWeekends
  );
  if (sendDailyEmbed) {
    sendDailyEmbed.stop();
  }
  sendDailyEmbed = new cron.CronJob(
    cronExpression,
    async () => {
      await runDailyTournamentMatches();
    },
    null,
    false,
    "Etc/UTC"
  );
  if (botAccess) {
    sendDailyEmbed.start();
  }
  return { ...schedule, cronExpression };
}

function SetupEvents(bot) {
  const eventsPath = path.join(__dirname, "public", "events");
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      bot.once(event.name, (...args) => event.execute(...args));
    } else {
      bot.on(event.name, (...args) => event.execute(...args));
    }
  }
}

function getCommandFiles(dir) {
  const files = [];

  fs.readdirSync(dir, { withFileTypes: true }).forEach((dirent) => {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...getCommandFiles(res));
    } else if (res.endsWith(".js")) {
      files.push(res);
    }
  });

  return files;
}

function AddCommandsToBot(bot) {
  bot.commands = new Collection();
  const commandsPath = path.join(__dirname, "public", "commands");

  const commandFiles = getCommandFiles(commandsPath);

  for (const filePath of commandFiles) {
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      bot.commands.set(command.data.name, command);
      console.log(`Command loaded: ${command.data.name}`);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      );
    }
  }
}

async function DeployCommands() {
  const commands = [];
  // Grab all the command files from the commands directory you created earlier
  const commandFiles = getCommandFiles("./public/commands");

  // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
  for (const file of commandFiles) {
    const command = require(file);
    commands.push(command.data.toJSON());
  }

  // Construct and prepare an instance of the REST module
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_KEY);

  // and deploy your commands!
  (async () => {
    try {
      console.log(
        `Started refreshing ${commands.length} application (/) commands.`
      );

      // The put method is used to fully refresh all commands in the guild with the current set
      const data = await rest.put(
        Routes.applicationCommands(process.env.BOT_ID),
        {
          body: commands,
        }
      );

      console.log(
        `Successfully reloaded ${data.length} application (/) commands.`
      );
    } catch (error) {
      // And of course, make sure you catch and log any errors!
      console.error(error);
    }
  })();
}

function getCommandFiles(dir) {
  const subdirs = fs.readdirSync(dir, { withFileTypes: true });
  const files = subdirs
    .map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getCommandFiles(res) : res;
    })
    .flat();

  return files.filter((file) => file.endsWith(".js"));
}
