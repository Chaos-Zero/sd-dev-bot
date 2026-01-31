const { Client, ButtonBuilder, EmbedBuilder } = require("discord.js");
const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const sleep = require("util").promisify(setTimeout);
eval(fs.readFileSync("./public/utils/messageutils.js") + "");
eval(fs.readFileSync("./public/utils/reactionutils.js") + "");
eval(fs.readFileSync("./public/imageprocessing/imagebuilder.js") + "");
eval(fs.readFileSync("./public/imageprocessing/gifcreator.js") + "");
eval(fs.readFileSync("./public/database/read.js") + "");
eval(fs.readFileSync("./public/database/write.js") + "");
eval(fs.readFileSync("./public/tournament/tournamentutils.js") + "");

function normalizeTournamentNameForGif(name) {
  if (!name) {
    return "tournament";
  }
  return replaceSpacesWithUnderlines(name.replace(/-/g, " ")).toLowerCase();
}

function buildTournamentGifName(tournamentName, round, match) {
  const safeName = normalizeTournamentNameForGif(tournamentName);
  return `${safeName}-round${round}match${match}`;
}

async function getCurrentTournamentNameFromDb() {
  const db = GetDb();
  await db.read();
  return db.get("tournaments[0].currentTournament").value();
}

async function SendDoubleElimBattleMessage(
  interaction,
  matchData,
  bot = "",
  secondOfDay = false,
  previousMatches = [],
  options = {}

  //interaction = ""
) {
  //,
  // populatedDb
  //)
  const numberOfContestants = 2;
  var guildObject;
  //const guildObject = bot.guilds.cache.get(process.env.GUILD_ID);
  if (interaction == "" && bot !== "") {
    guildObject = await bot.guilds.cache.get(process.env.GUILD_ID);
  } else {
    guildObject = interaction.guild;
  }
  var sleepMultiplier =
    previousMatches.length == 0 ? 1 : previousMatches.length;
  var sleepTime = 4500 * sleepMultiplier;
  //await sleep(sleepTime);
  const skipPreviousResults = options?.skipPreviousResults === true;
  if (!secondOfDay && !skipPreviousResults) {
    await SendPreviousDayResultsEmbeds(
      guildObject,
      previousMatches,
      matchData,
      options
    );
  }
  //);

  const youtubeUrls = [matchData.entrant1.link, matchData.entrant2.link];
  const currentTournamentName = await getCurrentTournamentNameFromDb();
  let gifName = buildTournamentGifName(
    currentTournamentName,
    matchData.round,
    matchData.match
  );
  downloadImages(youtubeUrls).then(async () => {
    // Discord caches images so we have to change the name each day
    // Just going to use the date
    await sleep(sleepTime);

    const d = new Date();
    //let gifname = d.toISOString().slice(0, 10);

    console.log("Making gif");
    await createGif("neuquant", gifName).then(async () => {
      await sleep(5000);
      SendDoubleElimDailyEmbed(
        guildObject,
        matchData,
        gifName,
        secondOfDay,
        previousMatches
      );
    });
    //CreateDailyEmbedContent(tournamentRoundDetails, reactionDetails);
  });
}

async function SendPreviousDayResultsEmbeds(
  guild,
  previousMatches,
  matchData,
  options = {}
) {
  /*
    SPLIT THIS OFF INTO A DIFFERENT FUNCTION
    {
            "embedDetails = {
        round: round,
        bracket: bracket,
        match: winner.match,
        winner: {
          name: winnerEntrant.name,
          title: winnerEntrant.title,
          link: winnerEntrant.link,
          voters: winnerEntrant.voters,
          points: winnerEntrant.points,
        },
        loser:{
          name: loserEntrant.name,
          title: loserEntrant.title,
          link: loserEntrant.link,
          voters: loserEntrant.voters,
          points: loserEntrant.points,
        }
      };
    */
  console.log("We're in previous day stuff");
  if (previousMatches.length < 1 || previousMatches[0].length < 1) {
    return 0;
  }
  const channel = await GetChannelByName(guild, process.env.TOURNAMENT_CHANNEL);
  const botLogChannel = await GetChannelByName(
    guild,
    process.env.BOT_LOG_CHANEL
  );

  const members = await guild.members.fetch();
  const currentTournamentName = await getCurrentTournamentNameFromDb();

  const includeResults = options?.includeResults !== false;
  const includeLogs = options?.includeLogs !== false;
  var previousEmbedsToSend = [];
  var logsEmbedsToSend = [];
  var links = [];
  let imgName = "";
  let embedImg = "";
  let imagesFolder = "public/commands/gif/input";
  let dstPath = "public/commands/gif/jpg";

  var prevWinner = "";

  for (var i = 0; i < previousMatches[0].length; i++) {
    if (previousMatches[0][i].winner.name !== prevWinner) {
      prevWinner = previousMatches[0][i].winner.name;
      links = [previousMatches[0][i].winner.link];

      var ytLinks = await GetYtThumb(links);

      let gifName = buildTournamentGifName(
        currentTournamentName,
        matchData.round,
        previousMatches[0][i].match
      );

      embedImg = ytLinks[0][0];
      imgName = ytLinks[0][1];
      moveFiles(imagesFolder, dstPath);
      await sleep(1000);

      await downloadImages(links, imgName).then(async () => {
        var prevEmbed = new EmbedBuilder();
        const previousWinnerPath = embedImg;
        // Discord caches images so we have to change the name each day
        // Just going to use the date
        await sleep(3000);

        console.log("Link to winner image: " + previousWinnerPath);

        function VoteString(num) {
          return num == 1 ? num + " vote" : num + " votes";
        }

        var titleText =
          previousMatches[0][i].bracket == "winnersBracket"
            ? "Continues in Winners Bracket: "
            : "Continues to final: ";
        var loserText =
          previousMatches[0][i].bracket == "winnersBracket"
            ? "Moving to Losers Bracket: " +
              previousMatches[0][i].loser.title +
              " - " +
              previousMatches[0][i].loser.name
            : previousMatches[0][i].loser.title +
              " - " +
              previousMatches[0][i].loser.name +
              " has been eliminated.";

        prevEmbed
          .setTitle(
            titleText +
              previousMatches[0][i].winner.title +
              " - " +
              previousMatches[0][i].winner.name +
              ""
          )
          .setURL("https://challonge.com/Best_VGM_List_Cameo_Contest")
          .setAuthor({
            name: "Match " + previousMatches[0][i].match + " Winner",
            iconURL:
              "http://91.99.239.6/files/assets/sd_logo.png",
          })
          .addFields({
            name: loserText,
            value: "Points: " + previousMatches[0][i].loser.points,
            inline: true,
          })
          .setColor(0xffffff)

          .setDescription(
            "**Points: " + previousMatches[0][i].winner.points + "**"
          )
          .setImage(previousWinnerPath);
        if (includeResults) {
          previousEmbedsToSend.push(prevEmbed);
        }

        var resultLogEmbed = new EmbedBuilder();

        var entryA =
          previousMatches[0][i].winner.voteLetter == "A"
            ? previousMatches[0][i].winner
            : previousMatches[0][i].loser;
        var entryB =
          previousMatches[0][i].winner.voteLetter == "B"
            ? previousMatches[0][i].winner
            : previousMatches[0][i].loser;

        var aString = CreateUsersString(entryA.voters, members);
        var bString = CreateUsersString(entryB.voters, members);
        var bracketString =
          previousMatches[0][i].bracket == "winnersBracket"
            ? "Winners Bracket"
            : "Losers Bracket";
        resultLogEmbed
          //   .setColor(0x097969)
          .setTitle(
            "Round " +
              matchData.round +
              " - Bracket: " +
              bracketString +
              " - Match: " +
              previousMatches[0][i].match
          )
          .setURL("https://challonge.com/Best_VGM_List_Cameo_Contest")
          .setAuthor({
            name: "Best VGM 2022",
            iconURL:
              "http://91.99.239.6/files/assets/sd_logo.png",
          })
          .setDescription(
            "**------------------------------------**\n**Battle Entries**:\n**A. " +
              entryA.title +
              " - " +
              entryA.name +
              "**\n> Score: " +
              entryA.points +
              "\n**B. " +
              entryB.title +
              " - " +
              entryB.name +
              "**\n> Score: " +
              entryB.points +
              "\n**------------------------------------**\n\n**Breakdown**:"
          )
          //.setThumbnail(
          //  "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/domo-voting-result.gif?v=1681088448448"
          //)
          .setImage(
            "http://91.99.239.6/dev_files/output/" +
              gifName +
              ".gif"
          )
          .addFields(
            {
              //name: "<:ABC:1090369448185172028>",
              name: "<:A_:1101532684934725714> **A**",
              value: "**Votes: " + entryA.voters.length + "**\n" + aString,
              inline: false,
            },
            {
              //name: "<:ACB:1090369449422499870>",
              name: "<:B_:1101532686302052454> **B**",
              value: "**Votes: " + entryB.voters.length + "**\n" + bString,
              inline: false,
            }
          )
          .setColor(0x4dc399)
          .setFooter({
            text: "Supradarky's VGM Club",
            iconURL:
              "http://91.99.239.6/files/assets/sd-img.png",
          });
        if (includeLogs) {
          logsEmbedsToSend.push(resultLogEmbed);
        }
      });
    }
  }
  console.log("Sending previous day stuff");

  if (includeResults) {
    for (var i = 0; i < previousEmbedsToSend.length; i++) {
      await channel.send({ embeds: [previousEmbedsToSend[i]] });
      await sleep(250);
    }
  }

  if (includeLogs) {
    for (var i = 0; i < logsEmbedsToSend.length; i++) {
      await botLogChannel.send({ embeds: [logsEmbedsToSend[i]] });
      await sleep(250);
    }
  }
}

async function SendDoubleElimDailyEmbed(
  guild,
  matchData,
  gifName,
  secondOfDay = false,
  previousMatches = []
) {
  const channel = await GetChannelByName(guild, process.env.TOURNAMENT_CHANNEL);

  const gifPath =
    "http://91.99.239.6/dev_files/output/" + gifName + ".gif";

  var timeUntilNextRound = GetNextTournamentScheduleEpoch();

  var embed = new EmbedBuilder();

  var bracket =
    matchData.braket == "winnersBracket" ? "Winners Bracket" : "Losers Bracket";
  embed
    .setTitle(
      "Final" +
        //matchData.round +
        " - " +
        //bracket +
        "Match " +
        matchData.match
    )
    .setAuthor({
      name: "Best VGM List Cameo Contest",
      iconURL:
        "http://91.99.239.6/files/assets/sd_logo.png",
    })
    .setColor(0xffff00)
    .addFields(
      {
        name:
          "**Next Match:** Voting for this battle ends <t:" +
          timeUntilNextRound +
          ":R>",
        value: "------------------------------------", //"\u200B",
      },
      {
        name:
          `A. ` + matchData.entrant1.title + ` - ` + matchData.entrant1.name,
        value: matchData.entrant1.link,
      },
      {
        name:
          `B. ` + matchData.entrant2.title + ` - ` + matchData.entrant2.name,
        value: matchData.entrant2.link,
      },
      //{
      //  name: "\u200B",
      //  value: "\u200B",
      //},
      {
        name: `------------------------------------`,
        value: `\u200B`, //` by reacting to this post:`,
        //value: `Ranked Order for voting purposes:`,
      }
    )
    .setFooter({
      text: "< Please listen to the tracks in full and then place your vote!",
      iconURL:
        "http://91.99.239.6/files/assets/domo_smarty_pants_face.png",
    })

    .setThumbnail(gifPath);
  //}

      embed.setImage('https://cdn.glitch.global/bc159225-9a66-409e-9e5f-5467f5cfd19b/Tetrace.png?v=1698940221642')
    
      
  const db = GetDb();
  await db.read();
  const currentTournamentName = await getCurrentTournamentNameFromDb();
  const tournamentDetails = db.get("tournaments").nth(0).value();
  const tournament = tournamentDetails?.[currentTournamentName];
  const roleId = tournament?.roleId;
  const rolePing = roleId ? `<@&${roleId}>` : "";

  var embedsToSend = [embed];
  const baseGreeting = roleId ? `Hello all and ${rolePing}` : "Hello all!";
  var welcomeString =
    `${baseGreeting}`;
  if (previousMatches.length > 0 && previousMatches[1].length > 0) {
    var roundsToCheck = "";
    for (var entry of previousMatches[1]) {
      roundsToCheck +=
        "\n**Match " +
        entry.match +
        "**: " +
        entry.entrant1.name +
        " vs " +
        entry.entrant2.name +
        "";
    }
    welcomeString +=
      "\n❗ It appears we have a tie match! ❗\nPlease vote on or reconsider these matches: " +
      roundsToCheck;
  }

  if (!secondOfDay) {
    channel.send(welcomeString);
  }

  channel.send({ embeds: embedsToSend }).then((embedMessage) => {
    var buttonVotes = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`doubleElim-A-${matchData.match}`)
          .setLabel("A")
          .setStyle("4")
      )
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`doubleElim-B-${matchData.match}`)
          .setLabel("B")
          .setStyle("1")
      );
    embedMessage.edit({
      components: [buttonVotes],
    });
  });

  // populatedDb.map((item) => {
  //    if (item.round == tournamentRoundDetails[3]) {
  //      item.votedToday = [];
  //    }
  //  });
}

function GetTallysFromDailyVotes(populatedDb, round, voteString) {
  var count = 0;

  for (var item of populatedDb) {
    if (item.round == round) {
      for (var vote of item.votedToday) {
        if (vote.vote == voteString) {
          count++;
        }
      }
    }
  }
  return count;
}

function moveFiles(sourceFolderPath, targetFolderPath) {
  if (!fs.existsSync(targetFolderPath)) {
    console.log("Target folder does not exist, creating...");
    fs.mkdirSync(targetFolderPath);
  }

  fs.readdir(sourceFolderPath, (err, files) => {
    if (err) {
      console.error("Error reading source directory:", err);
      return;
    }

    files.forEach((file) => {
      const sourceFilePath = path.join(sourceFolderPath, file);
      const targetFilePath = path.join(targetFolderPath, file);

      fs.rename(sourceFilePath, targetFilePath, (err) => {
        if (err) {
          console.error(`Error moving file: ${file}`, err);
        } else {
          console.log(`Moved file: ${file}`);
        }
      });
    });
  });
}

async function SendUpdateToLogs(guild, db) {
  var channel = await GetChannelByName(guild, "majordomo-logs");
  db.read();
  var votedTodayCollection = "";

  let currentRound = await db
    .get("bestvgm2022awards")
    .find({ isCurrentRound: true })
    .value();

  if (currentRound) {
    votedTodayCollection = currentRound.votedToday;
  }

  var votedTodayCollection = await GetCurrentBattlesVotes(db);
  console.log(votedTodayCollection);

  if (votedTodayCollection == "") {
    await channel.send(
      `There doesn't appear to be a battle running at this current time.`
    );
  } else {
    var outputMessage = "Here is todays list of Voters and Votes cast:\n\n| ";
    const members = await guild.members.fetch();
    for (var user of votedTodayCollection) {
      var discordMember = members.find((member) => member.id == user.memberId);

      var username =
        discordMember == undefined ? "" : discordMember.displayName;
      outputMessage += "**" + username + "**: `" + user.vote + "` | ";
    }
    console.log(outputMessage);
    channel.send(outputMessage);
  }
}

async function GetCurrentBattlesVotes(db) {
  var votedTodayCollection = "";

  const currentRound = await db
    .get("bestvgm2022awards")
    .find({ isCurrentRound: true })
    .value();

  if (currentRound) {
    votedTodayCollection = currentRound.votedToday;
  }

  return votedTodayCollection;
}
