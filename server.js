// server.js
// where your node app starts

//FFMPG imports fop package.json (not using currently)

    //"fluent-ffmpeg": "^2.1.2",
    //"ffmpeg-static": "^5.2.0",

// we've started you off with Express (https://expressjs.com/)
// but feel free to use whatever libraries or frameworks you'd like through `package.json`.
require('dotenv').config()
const express = require("express");
const session = require("express-session");
const { google } = require("googleapis");
const OAuth2 = google.auth.OAuth2;
const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require("@discordjs/voice");
const fs = require("fs");
const { Events, EmbedBuilder } = require("discord.js");
const cron = require("cron");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/api/openai/chat.js") + "");
eval(fs.readFileSync("./public/utils/messageutils.js") + "");
eval(fs.readFileSync("./public/tournament/single/buttonfunctions.js") + "");
eval(fs.readFileSync("./public/tournament/triple/buttonfunctions.js") + "");
eval(fs.readFileSync("./public/tournament/doubleElim/buttonfunctions.js") + "");
//eval(fs.readFileSync("./public/api/vgmdb/buttonfunctions.js") + "");
//eval(fs.readFileSync("./public/api/vgmdb/vgmdb.js") + "");
eval(fs.readFileSync("./public/api/google/youtubeConnector.js") + "");
//eval(fs.readFileSync("./public/ytPlayback/ytPlayback.js") + "");
eval(fs.readFileSync("./public/ytPlayback/pointsHandler.js") + "");
eval(fs.readFileSync("./public/collections/roles.js") + "");
eval(fs.readFileSync("./public/ytPlayback/ytDmMessages.js") + "");
eval(fs.readFileSync("./public/utils/aprilbuttonfunctions.js") + "");

const app = express();

//Set up bot
const bot = CreateBot();

var db = GetDb();

PopulateSdVgmLinks();

const aiPrefix = "hey domo";

AddCommandsToBot(bot);

SetupEvents(bot);

DeployCommands();

var count = 10;

// Goolge auth //////////////////////

const oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_SECRET,
  process.env.REDIRECT_URI // Redirect URL you set in Google Cloud Console
);

const oauth2ClientSheets = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_SECRET,
  process.env.REDIRECT_URI // Redirect URL you set in Google Cloud Console
);

google.options({ auth: oauth2Client });

const tokenPath = process.env.TOKEN_PATH;
const sheetTokenPath = process.env.SHEETS_TOKEN_PATH;

app.get("/authyt", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/youtube"],
    state: "service=youtube", // Include the service as a state parameter
  });
  res.redirect(authUrl);
});

app.get("/authsheets", (req, res) => {
  const authUrl = oauth2ClientSheets.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/spreadsheets"],
    state: "service=sheets", // Include the service as a state parameter
  });
  res.redirect(authUrl);
});

app.get("/oauth2callback", (req, res) => {
  const code = req.query.code;
  const service = new URLSearchParams(req.query.state).get("service"); // Retrieve the service from the state parameter
  if (service == "youtube") {
    oauth2Client.getToken(code, async (err, token) => {
      if (err) {
        return res.status(400).send("Error getting token.");
      }
      oauth2Client.setCredentials(token);
      saveTokens(token, service);
      res.send("Authentication successful! You can now close this page.");
    });
  } else if (service == "sheets") {
    oauth2ClientSheets.getToken(code, async (err, token) => {
      if (err) {
        return res.status(400).send("Error getting token.");
      }
      oauth2ClientSheets.setCredentials(token);
      saveTokens(token, service);
      res.send("Authentication successful! You can now close this page.");
    });
  }
});

/*oauth2Client.on("tokens", (tokens) => {
  if (tokens.refresh_token) {
    console.log("Received a new refresh token:", tokens.refresh_token);
    saveTokens(tokens); // Save the new tokens
  }
  if (tokens.access_token) {
    console.log("Received a new access token:", tokens.access_token);
    saveTokens(tokens); // Save the new tokens
  }
});*/
///////////////////////////////////////

// Deal with Discord Messages
bot.on("messageCreate", async (message) => {
  //console.log(message)
  if (message.author.bot) return;
  let thisChannel = message.channel;
  if (
    thisChannel.name == "hey-domo" &&
    message.content.toLowerCase().startsWith(aiPrefix)
  ) {
    aiRespond(bot, message, aiPrefix);
    return;
  }

  db.read();
  let ytChannelDetails = await db.get("ytChannels").value();
  outer: for (var channelEntry of ytChannelDetails) {
    if (channelEntry.discordChannelId == thisChannel.id) {
      let messageContent = message.content;
      let messageWords = messageContent.split(/[\s\n]+/);
      var linkIds = [];

      var formattedPlaylistName = formatPlaylistTitle(thisChannel.name);
      if (channelEntry.channelType == "permanent") {
        formattedPlaylistName =
          channelEntry.updateFrequency == "monthly"
            ? formatPlaylistTitle(thisChannel.name) + " - " + getMonthAndYear()
            : formatPlaylistTitle(thisChannel.name) + " - " + getYear();
      }

      var sectionName =
        channelEntry.channelType == "spotlight"
          ? "Spotlights"
          : "Community VGM";

      for (var word of messageWords) {
        // Check if embed is a YouTube video using a regex
        // && embed.url.includes('youtube.com/watch?v=')) {

        const youtubeRegex =
          /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\/?\?(?:\S*?&?v=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/;
        const match = word.match(youtubeRegex);
        if (match) {
          console.log("Found a YouTube video embed:", match);
          // Extract video ID
          linkIds.push(match[1]);
        } else if (word.includes("youtube.com/watch?v=")) {
          // Extract video ID
          linkIds.push(word.split("v=")[1].split("&")[0]);
        }
      }
      if (linkIds.length > 0) {
        for (var i = 0; i < linkIds.length; i++) {
          setCredentials()
            .then(async () => {
              await checkOrCreatePlaylistAndAddSong(
                formattedPlaylistName,
                linkIds[i],
                sectionName
              )
                .then(async () => {
                  console.log("Operation completed successfully");
                })
                .catch((error) => {
                  console.error("Error during operation:", error);
                });
            })
            .catch((err) => {
              console.error("Error during credentials setting:", err);
            });
          await sleep(3000);
        }
      }
      break outer;
    }
  }
});

bot.on("messageReactionAdd", async (reaction, user) => {
  if (reaction.partial) {
    // If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
    try {
      let thisChannel = reaction.message.channel;
      const reactionId = reaction.emoji.id
        ? reaction.emoji.id
        : reaction.emoji.name;

      const messageAuthorId = reaction.message.author.id;

      await db.read();
      let gamesDetails = await db.get("guessingGame").nth(0).value();

      await reaction.fetch().then((reaction) => {
        let thisChannel = reaction.message.channel;
        if (
          user.id !== bot.user.id &&
          thisChannel.name == "guessing-games" &&
          gamesDetails.isGameRunning &&
          gamesDetails.currentHosts.includes(user.id)
        ) {
          if (
            reactionId == pointEmotes["two"] ||
            reactionId == pointEmotes["one"] ||
            reactionId == pointEmotes["half"] ||
            reactionId == pointEmotes["quarter"] ||
            reactionId == pointEmotes["tenth"]
          ) {
            HandleAddPointsReactions(reactionId, messageAuthorId);
          }
        }
      });
    } catch (error) {
      console.error(
        "This message was posted before the bot came online, so reaction will be ignored"
      );
      // Return as `reaction.message.author` may be undefined/null
      return;
    }
  } else {
    let thisChannel = reaction.message.channel;
    const reactionId = reaction.emoji.id
      ? reaction.emoji.id
      : reaction.emoji.name;
    const messageAuthorId = reaction.message.author.id;
    await db.read();
    let gamesDetails = await db.get("guessingGame").nth(0).value();

    if (
      user.id !== bot.user.id &&
      thisChannel.name == "guessing-games" &&
      gamesDetails.isGameRunning &&
      gamesDetails.currentHosts.includes(user.id)
    ) {
      if (
        reactionId == pointEmotes["two"] ||
        reactionId == pointEmotes["one"] ||
        reactionId == pointEmotes["half"] ||
        reactionId == pointEmotes["quarter"] ||
        reactionId == pointEmotes["tenth"]
      ) {
        console.log("Points Added");
        HandleAddPointsReactions(reactionId, messageAuthorId);
      }
    }
  }
});

bot.on("messageReactionRemove", async (reaction, user) => {
  if (reaction.partial) {
    // If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
    try {
      let thisChannel = reaction.message.channel;
      const reactionId = reaction.emoji.id
        ? reaction.emoji.id
        : reaction.emoji.name;

      const messageAuthorId = reaction.message.author.id;

      await db.read();
      let gamesDetails = await db.get("guessingGame").nth(0).value();

      await reaction.fetch().then((reaction) => {
        let thisChannel = reaction.message.channel;
        if (
          user.id !== bot.user.id &&
          thisChannel.name == "guessing-games" &&
          gamesDetails.isGameRunning &&
          gamesDetails.currentHosts.includes(user.id)
        ) {
          if (
            reactionId == pointEmotes["two"] ||
            reactionId == pointEmotes["one"] ||
            reactionId == pointEmotes["half"] ||
            reactionId == pointEmotes["quarter"] ||
            reactionId == pointEmotes["tenth"]
          ) {
            HandleRemovePointsReactions(reactionId, messageAuthorId);
          }
        }
      });
    } catch (error) {
      console.error(
        "This message was posted before the bot came online, so reaction will be ignored"
      );
      // Return as `reaction.message.author` may be undefined/null
      return;
    }
  } else {
    let thisChannel = reaction.message.channel;
    const reactionId = reaction.emoji.id
      ? reaction.emoji.id
      : reaction.emoji.name;
    const messageAuthorId = reaction.message.author.id;
    await db.read();
    let gamesDetails = await db.get("guessingGame").nth(0).value();

    if (
      user.id !== bot.user.id &&
      thisChannel.name == "guessing-games" &&
      gamesDetails.isGameRunning &&
      gamesDetails.currentHosts.includes(user.id)
    ) {
      if (
        reactionId == pointEmotes["two"] ||
        reactionId == pointEmotes["one"] ||
        reactionId == pointEmotes["half"] ||
        reactionId == pointEmotes["quarter"] ||
        reactionId == pointEmotes["tenth"]
      ) {
        console.log("Points removed");
        HandleRemovePointsReactions(reactionId, messageAuthorId);
      }
    }
  }
});

// Deal with DMs
bot.on("messageCreate", function (msg) {
  // No Guild means DM
  if (msg.guild == null) {
    console.log("It's recognised as a DM");
    const content = msg.content.trim();
    const lowerContent = content.toLowerCase();
    if (lowerContent === "gghelp") {
      SendGuessingGameInstructionDm(msg);
      return;
    }
    if (lowerContent === "tournament-help") {
      SendTournamentHelpDm(msg);
      return;
    }
  }
});

const throwEmbed = new EmbedBuilder().setImage(
  "http://91.99.239.6/files/assets/domo-stuffed-animal.gif"
);

// make all the files in 'public' available
// https://expressjs.com/en/starter/static-files.html
app.use(express.static("public"));

// https://expressjs.com/en/starter/basic-routing.html
app.get("/", (request, response) => {
  response.sendFile("/public/index.html");
});

app.get("/oauth2callback", (req, res) => {
  // Handle OAuth2 code here.
  // This is where you'll handle the code parameter Google sends after user authorization
  res.send("OAuth2 Callback Received");
});

// listen for requests :)
const listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});

bot.on(Events.InteractionCreate, (interaction) => {
  console.log(interaction.customId);
  if (interaction.isStringSelectMenu() && interaction.customId === "domo-help-topic") {
    const requesterId = interaction.user?.id;
    if (requesterId) {
      return HandleDomoHelpTopicSelect(interaction);
    }
  }
  var isUserMatch =
    new String(interaction.customId).trim() ==
    new String("album-dropdown-" + String(interaction.user.id)).trim();

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId.includes("album-dropdown-")
  ) {
    if (isUserMatch) {
      (async () => {
        console.log("Running through Event coordinator");
        await handleVgmdbDropdownSelection(interaction);
      })().catch(console.error);
    } else {
      (async () => {
        await interaction.reply({
          content:
            "Sorry, this dropdown is reserved for the user who spawned the message.",
          ephemeral: true,
        });
      })().catch(console.error);
    }
  } else {
    if (!interaction.isButton()) return;
    // We need to catch the error coming back when a user reacts twice when revoting
    (async () => {
      //console.log(interaction)
      const splitButtonName = interaction.customId.split("-");
      if (splitButtonName[0] == "album") {
        await handleVgmdbButtonPress(interaction);
      } else if (splitButtonName[0] === "single") {
        handleSingleElimButtonPress(interaction, db);
      } else if (splitButtonName[0] === "doubleElim") {
        handleDoubleElimButtonPress(interaction, db);
      } else if (splitButtonName[0] == "triple") {
        await HandleTripleButtonPress(interaction, db);
      } else if (splitButtonName[0] === "fool") {
        handleFoolButtonPress(interaction);
      }
    })().catch(console.error);
  }
});

function saveTokens(tokens, service) {
  // Choose the correct file path based on the service
  const filePath = service == "youtube" ? tokenPath : sheetTokenPath;

  fs.writeFile(filePath, JSON.stringify(tokens), (err) => {
    if (err) {
      console.error(`Error writing tokens for ${service}:`, err);
    } else {
      console.log(`Tokens for ${service} updated and saved to:`, filePath);
    }
  });
}

function extractNumberAfterSubstring(inputString, substring) {
  // Find the index where the substring ends
  const indexAfterSubstring = inputString.indexOf(substring) + substring.length;

  // Get the rest of the string after the substring
  const restOfString = inputString.slice(indexAfterSubstring);

  // Use a regular expression to find the first sequence of digits
  const match = restOfString.match(/\d+/);

  return match ? match[0] : null;
}
