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
eval(fs.readFileSync("./public/collections/tournamentCells.js") + "");
eval(fs.readFileSync("./public/api/google/sheetsfunctions.js") + "");

//colours for sheets cells:
const lightGreen = { red: 0.8, green: 1, blue: 0.8, alpha: 0.2 };
const lightGray = { red: 0.9, green: 0.9, blue: 0.9, alpha: 0.2 };
const lightGold = { red: 1, green: 0.9, blue: 0.5, alpha: 0.2 };
const lightBlue = { red: 0.7, green: 0.85, blue: 1, alpha: 0.2 };

const challongeBaseUrl = "https://challonge.com/";

async function SendSingleBattleMessage(
  interaction,
  matchData,
  bot = "",
  singleDb,
  secondOfDay = false,
  previousMatches = []
  //interaction = ""
) {
  //,
  // populatedDb
  //)
  const numberOfContestants = singleDb.roundsPerTurn;
  //const guildObject = bot.guilds.cache.get(process.env.GUILD_ID);
  var guildObject;
  //const guildObject = bot.guilds.cache.get(process.env.GUILD_ID);
  if (interaction == "" && bot !== "") {
    guildObject = await bot.guilds.cache.get(process.env.GUILD_ID);
  } else {
    guildObject = interaction.guild;
  }
  if (previousMatches != "") {
    var sleepMultiplier =
      previousMatches.length == 0 ? 1 : previousMatches.length;
    var sleepTime = 4500 * sleepMultiplier;
    if (!secondOfDay) {
      await SendPreviousSingleDayResultsEmbeds(
        guildObject,
        previousMatches,
        matchData
      );
    }
  }
  //);

  const youtubeUrls = [matchData.entrant1.link, matchData.entrant2.link];
  let gifName = "round" + matchData.round + "match" + matchData.match;

  await downloadImages(youtubeUrls);
  console.log("Making gif");
  //  await createGif("neuquant", gifName).then(async () => {
  await createGif("neuquant", gifName);

  SendSingleDailyEmbed(
    guildObject,
    matchData,
    gifName,
    youtubeUrls,
    secondOfDay,
    previousMatches
  );
}

async function SendPreviousSingleDayResultsEmbeds(
  guild,
  previousMatches,
  matchData
) {
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

  var db = GetDb();
  db.read();

  let currentTournamentName = await getCurrentTournament(db);
  let tournamentDetails = await db.get("tournaments").nth(0).value();

  console.log(matchData.round + " " + tournamentDetails.isChallonge);

  let single = tournamentDetails[currentTournamentName];
  const challongeTournamentUrlName = replaceSpacesWithUnderlines(
    currentTournamentName
  );

  var previousEmbedsToSend = [];
  var logsEmbedsToSend = [];
  var links = [];
  let imgName = "";
  let embedImg = "";
  let imagesFolder = "public/commands/gif/input";
  let dstPath = "public/commands/gif/jpg";
    
  var welcomeString = "Hello all and <@&1326256775262896290>\nFollow along with this contest here: https://challonge.com/Technology_vs_Nature";

  var prevWinner = "";

  for (var i = 0; i < previousMatches[0].length; i++) {
    if (previousMatches[0][i].firstPlace.name !== prevWinner) {
      prevWinner = previousMatches[0][i].firstPlace.name;
      links = [previousMatches[0][i].firstPlace.link];

      var ytLinks = await GetYtThumb(links);

      let gifName =
        "round" +
        previousMatches[0][i].round +
        "match" +
        previousMatches[0][i].match;

      embedImg = ytLinks[0][0];
      imgName = ytLinks[0][1];
      moveFiles(imagesFolder, dstPath);
      await sleep(1000);

      await downloadImages(links, imgName);
      var prevEmbed = new EmbedBuilder();
      const previousWinnerPath = embedImg;
      // Discord caches images so we have to change the name each day
      // Just going to use the date
      await sleep(3000);

      console.log("Link to winner image: " + previousWinnerPath);

      function VoteString(num) {
        return num == 1 ? num + " vote" : num + " votes";
      }
      const currentChallongeUrl =
        "https://challonge.com/" + challongeTournamentUrlName;
      // SHEET CODE
      /* const startCell =
          bestVGM2023Cells[`match${previousMatches[0][i].match.toString()}`];
        const todaysSheetCell =
          "https://docs.google.com/spreadsheets/d/1A9eNaKBuVMycRHYZGSyidapKqqSg-fIL0RzSFL9N2_Q/edit#gid=0&range=" +
          startCell;
        */

      var secondPlaceText =
        //"**2nd Place:" +
        "**Runner-up: " +
        previousMatches[0][i].secondPlace.name +
        " - " +
        previousMatches[0][i].secondPlace.title + "**";

      var nextRound = 6;
      prevEmbed
        .setTitle(
          //"Winner: 1st Place:" +
          previousMatches[0][i].firstPlace.type + " wins!\n" + 
          //"Match Winner: " +
          //  "1st Place:" +
            previousMatches[0][i].firstPlace.name +
            " - " +
            previousMatches[0][i].firstPlace.title +
            ""
        )
        .setAuthor({
          name: "Match " + previousMatches[0][i].match + " Results",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        })
        .addFields({
          name: secondPlaceText,
          value: "Points: " + previousMatches[0][i].secondPlace.points,
          inline: false,
        })

        .setColor(0xffffff)

        .setDescription(
          "**Points: " + previousMatches[0][i].firstPlace.points + "**"
        )
        .setImage(previousWinnerPath);

      if (
        previousMatches[0][i].firstPlace.points !==
        previousMatches[0][i].secondPlace.points
      ) {
        previousEmbedsToSend.push(prevEmbed);
      }
      ////////////////////////////////////////////////////////////////////

      var entryA =
        previousMatches[0][i].firstPlace.voteLetter == "A"
          ? previousMatches[0][i].firstPlace
          : previousMatches[0][i].secondPlace;
      var entryB =
        previousMatches[0][i].firstPlace.voteLetter == "B"
          ? previousMatches[0][i].firstPlace
          : previousMatches[0][i].secondPlace;

      var aString = CreateUsersString(entryA.voters, members);
      var bString = CreateUsersString(entryB.voters, members);

      var resultLogEmbed = new EmbedBuilder();

      var challongeLink = challongeBaseUrl + challongeTournamentUrlName;

      resultLogEmbed
        .setColor(0x097969)
        .setTitle(
          "Round " +
            previousMatches[0][i].round +
            " -  Match: " +
            previousMatches[0][i].match 
        )
        .setAuthor({
          name: "Technology Vs Nature",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        })
        .setDescription(
          "\n**------------------------------------**\n**Match Participants**:\n**A. " +
            entryA.name +
            " - " +
            entryA.title +
            "**\n> Score: **" +
            entryA.points +
            "**\n**B. " +
            entryB.name +
            " - " +
            entryB.title +
            "**\n> Score: **" +
            entryB.points +
            "**\n**------------------------------------**\n\n**Breakdown**:"
        )
        //.setThumbnail(
        //  "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/domo-voting-result.gif?v=1681088448448"
        //)
        .setImage(
          "http://91.99.239.6/files/output/" + gifName + ".gif"
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
          },
          {
            name: "------------------------------------\nTournament Links",
            value:
              "[Tournament Bracket](" +
              currentChallongeUrl +
              ") - [Tournament Playlist](https://youtube.com/playlist?list=PLaHaXWMJA7tdOKEvLDRj_gkosnD3FGQWC&si=nbIBmK4cO2zqQpXp)",
            inline: false,
          }
        )
        .setColor(0x4dc399)
        .setFooter({
          text: "Supradarky's VGM Club",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016",
        });
      if (
        previousMatches[0][i].firstPlace.points !==
        previousMatches[0][i].secondPlace.points
      ) {
        await logsEmbedsToSend.push(resultLogEmbed);
      }
      await AddSingleWinnerToNextRound(previousMatches[0][i].firstPlace);
      //resultLogEmbed;
    }
  }

  console.log("Sending previous day stuff");
    channel.send(welcomeString);
  
  await sleep(500);
    
  for (var i = 0; i < previousEmbedsToSend.length; i++) {
    await channel.send({ embeds: [previousEmbedsToSend[i]] });
    await sleep(250);
  }

  for (var i = 0; i < logsEmbedsToSend.length; i++) {
    await botLogChannel.send({ embeds: [logsEmbedsToSend[i]] });
    await sleep(250);
  }
}

async function SendSingleDailyEmbed(
  guild,
  matchData,
  gifName,
  youtubeUrls,
  secondOfDay = false,
  previousMatches = []
) {
  const channel = await GetChannelByName(guild, process.env.TOURNAMENT_CHANNEL);

  var db = GetDb();
  db.read();

  let currentTournamentName = await getCurrentTournament(db);
  let tournamentDetails = await db.get("tournaments").nth(0).value();

  console.log(matchData.round + " " + tournamentDetails.isChallonge);

  let single = tournamentDetails[currentTournamentName];
  const challongeTournamentUrlName = replaceSpacesWithUnderlines(
    currentTournamentName
  );
  const currentChallongeUrl =
    "https://challonge.com/" + challongeTournamentUrlName;
  const gifPath =
    "http://91.99.239.6/files/output/" + gifName + ".gif";

  const d = new Date();
  let day = d.getDay();

  var timeUntilNextRound =
    day == 5 ? GetTimeInEpochStamp(71.75) : GetTimeInEpochStamp(24);
  var todaysSheetCell = "";

  if (!secondOfDay) {
    if (previousMatches[0].length > 0) {
      const startCell =
        bestVGM2023Cells[`match${previousMatches[0][0].match.toString()}`];
      todaysSheetCell =
        "https://docs.google.com/spreadsheets/d/1A9eNaKBuVMycRHYZGSyidapKqqSg-fIL0RzSFL9N2_Q/edit#gid=0&range=" +
        startCell;
    }
  }

  var embed = new EmbedBuilder();
  embed
    .setTitle("Round " + matchData.round + " - Match " + matchData.match)
    .setAuthor({
      name: currentTournamentName,
      iconURL:
        "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
    })
    .setColor(0xffff00)
    .addFields(
      {
        name:
          //matchData.match +
          "**Voting for this match ends <t:" + timeUntilNextRound + ":R>**",
        value: "------------------------------------", //"\u200B",
      },
      {
        name:
          `A. ` + matchData.entrant1.name + ` - ` + matchData.entrant1.title,
        value: "Faction: " + matchData.entrant1.type + "\n" + matchData.entrant1.link,
      },
      {
        name:
          `B. ` + matchData.entrant2.name + ` - ` + matchData.entrant2.title,
        value: "Faction: " + matchData.entrant2.type + "\n" + matchData.entrant2.link,
      },
      {
        name: "------------------------------------\nTournament Links",
        value:
          "[Tournament Bracket](" +
          currentChallongeUrl + ")",// +
         // ") - [Tournament Playlist](https://youtube.com/playlist?list=PLaHaXWMJA7tdOKEvLDRj_gkosnD3FGQWC&si=nbIBmK4cO2zqQpXp)",
        inline: false,
      }
      // {
      //  name: "\u200B",
      //  value: "\u200B",
      // }
    )
    //.setImage(
    //  "https://cdn.discordapp.com/attachments/998517698881400843/1362350834406527016/Untitled78_20250416225429.png?ex=68021396&is=6800c216&hm=fe929cecae3c018bd5572b9c60d572ad2a5e659de31dfbd7819acc335047e6f5&"
    //)
    .setFooter({
      text: "< Please listen to both tracks before voting for your favourite.",
      iconURL:
        "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Domo%20Smarty%20pants%20face.png?v=1691064432062",
    })

    .setThumbnail(gifPath);

  embed.setURL("https://imgur.com/a/u46xSwV");

  /*
  console.log("todaysSheetCell: " + todaysSheetCell);
  if (todaysSheetCell != "") {
    embed.addFields({
      name: `------------------------------------`,
      value:
        "[Tournament Bracket](" +
        todaysSheetCell +
        ") - [Tournament Playlist](https://youtube.com/playlist?list=PLaHaXWMJA7tfGylkXkwQtfWMhMpofo8TR&si=YiT1oMf3lmQASl5J)",
      inline: false,
    });
  } else {
    embed.addFields({
      name: `------------------------------------`,
      value: `\u200B`, //` by reacting to this post:`,
      //value: `Ranked Order for voting purposes:`,
    });
  }
  //}

  //For Finals
  if (matchData.match == "125") {
    embed.setImage(
      "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/125-A.png?v=1698857109720"
    );
  }*/

  var embedsToSend = [embed];
  var welcomeString = "Hello all and <@&1326256775262896290>";
  //  var welcomeString = "Thank you, all and <@&828707504363274261>, for participating.\nSee you in the next tournament!";
  if (previousMatches.length > 0 && previousMatches[1].length > 0) {
    var roundsToCheck = "";
    for (var entry of previousMatches[1]) {
      roundsToCheck +=
        "\n**Match " +
        entry.match +
        "**: " +
        entry.entrant2.name +
        " vs " +
        entry.entrant1.name +
        "";
    }
    welcomeString +=
      "\n❗ It appears we have a tie match! ❗\nPlease vote on or reconsider these matches: " +
      roundsToCheck;
  }

  if (!secondOfDay) {
    //channel.send(welcomeString);
  }
  await sleep(1500);
  channel.send({ embeds: embedsToSend }).then((embedMessage) => {
    var buttonVotes = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`single-A-${matchData.match}`)
          .setLabel("A")
          .setStyle("4")
      )
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`single-B-${matchData.match}`)
          .setLabel("B")
          .setStyle("1")
      );
    embedMessage.edit({
      components: [buttonVotes],
    });
  }); 
  //const sheetUrl =
  //  "https://docs.google.com/spreadsheets/d/14R4XTkML8aoDx8ENPPWPyaWE_hhUPDlzYX6mqsytoX4/";
  //if round 1, we need to fill in the days match
  if (matchData.round == 1 && single.isChallonge) {
    var entrantString1 =
      matchData.entrant1.title + ` - ` + matchData.entrant1.name;
    var entrantString2 =
      matchData.entrant2.title + ` - ` + matchData.entrant2.name;

    if (matchData.match == 1) {
      startTournament(challongeTournamentUrlName);
    }
    await updateParticipantNameBySeed(
      challongeTournamentUrlName,
      matchData.entrant1.challongeSeed,
      entrantString1
    );
    await updateParticipantNameBySeed(
      challongeTournamentUrlName,
      matchData.entrant2.challongeSeed,
      entrantString2
    );

    // await PopulateTournamentSheet(sheetUrl, matchData.match, entrantStrings);
    // await sleep(1000);
    // var nextRoundMatchindex = differenceFromLastMultipleOfThree(
    //   matchData.match
    // );

    //console.log("Prev Match count: " + previousMatches[0][0].length);

    /* var previousMatchIndex = previousMatches[0].length - 1;
    var nextRoundStringValue =
      previousMatches[0][previousMatchIndex].firstPlace.title +
      " - " +
      previousMatches[0][previousMatchIndex].firstPlace.name;

     console.log(
      "Cell stuff:\n   matchData.nextRoundNextMatch:" +
        matchData.nextRoundNextMatch +
        "\n  differenceFromLastMultipleOfThree(matchData.match) + 1:" +
        differenceFromLastMultipleOfThree(matchData.match) +
        1
    );*/
    //  await fillCells(
    //   sheetUrl,
    //  "Bracket",
    //  matchData.nextRoundNextMatch,
    //  [nextRoundStringValue],
    //  differenceFromLastMultipleOfThree(matchData.match) + 1
    //);
    //await sleep(1000);
  }
  await startMatchByNumber(challongeTournamentUrlName, matchData.match);

  //await ColourPreviousMatches(sheetUrl, previousMatches);
  //await sleep(1000);*/

  // ONLY FOR MAIN BOT
  //await AddTournamentSongsToTournamentPlaylist(youtubeUrls);

  // populatedDb.map((item) => {
  //    if (item.round == tournamentRoundDetails[3]) {
  //      item.votedToday = [];
  //    }
  //  });
}

async function AddSingleWinnerToNextRound(firstPlaceEntrant) {
  var db = GetDb();
  await db.read();
  console.log("Ending single Matches");
  let currentTournamentName = await getCurrentTournament(db);

  let tournamentDetails = await db.get("tournaments").nth(0).value();
  let single = tournamentDetails[currentTournamentName];
  var nextRoundNum = (parseInt(single.round) + 1).toString();
  var nextMatchNum = single.nextRoundNextMatch;

  var entrantForNextRound = {
    name: firstPlaceEntrant.name,
    title: firstPlaceEntrant.title,
    link: firstPlaceEntrant.link,
    type: firstPlaceEntrant.type,
    match: parseInt(nextMatchNum),
  };

  if (!single.rounds[nextRoundNum]) {
    single.rounds[nextRoundNum] = [];
  }
  single.rounds[nextRoundNum].push(entrantForNextRound);

  const matchingEntries = single.rounds[nextRoundNum].filter(
    (entry) => entry.match === nextMatchNum
  );
  if (matchingEntries.length % 2 == 0) {
    single.nextRoundNextMatch = nextMatchNum + 1;
  }

  db.get("tournaments")
    .nth(0)
    .assign({
      [currentTournamentName]: single,
    })
    .write();
}

async function PopulateTournamentSheet(
  url,
  matchNum,
  entrantStrings,
  startIndex = 0
) {
  // Fill round1 entries for match

  await fillCells(url, "Bracket", matchNum, entrantStrings, startIndex);
  await sleep(1000);

  const startCell = bestVGM2023Cells[`match${matchNum.toString()}`];
  const baseColumn = startCell.substring(0, 1); // Assuming single-letter column names
  const startRow = parseInt(startCell.substring(1), 10);

  var entrant = baseColumn + startRow.toString();
  var entrant2 = baseColumn + (startRow + 1).toString();
  var entrant3 = baseColumn + (startRow + 2).toString();

  await colourCells(url, [
    { [entrant]: lightBlue },
    { [entrant2]: lightBlue },
    { [entrant3]: lightBlue },
  ]);
}

async function ColourPreviousMatches(url, previousMatches) {
  //var firstPlace = previousMatches[0].firstPlace. [0][0].firstPlace.voteLetter
  var colours = [];
  for (var i = 0; i < previousMatches[0].length; i++) {
    var previousMatchNum = previousMatches[0][i].match;

    const previousStartCell =
      bestVGM2023Cells[`match${previousMatchNum.toString()}`];

    if (!previousStartCell) {
      throw new Error("Invalid match number or cell mapping.");
    }

    const prevBaseColumn = previousStartCell.substring(0, 1); // Assuming single-letter column names
    const prevstartRow = parseInt(previousStartCell.substring(1), 10);
    console.log(
      "Previous cell:\nprevBaseColumn: " +
        prevBaseColumn +
        "\nprevstartRow: " +
        prevstartRow
    );

    var prevEntrant = prevBaseColumn + prevstartRow.toString();
    var prevEntrant2 = prevBaseColumn + (prevstartRow + 1).toString();
    var prevEntrant3 = prevBaseColumn + (prevstartRow + 2).toString();

    switch (previousMatches[0][i].firstPlace.voteLetter) {
      case "A":
        colours.push({ [prevEntrant]: lightGreen });
        colours.push({ [prevEntrant2]: lightGray });
        colours.push({ [prevEntrant3]: lightGray });
        break;
      case "B":
        colours.push({ [prevEntrant]: lightGray });
        colours.push({ [prevEntrant2]: lightGreen });
        colours.push({ [prevEntrant3]: lightGray });
        break;
        break;
      case "C":
        colours.push({ [prevEntrant]: lightGray });
        colours.push({ [prevEntrant2]: lightGray });
        colours.push({ [prevEntrant3]: lightGreen });
        break;
        break;
    }
  }
  await colourCells(url, colours);
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

function switchFullName(shortName) {
  // Define an array of objects with the shortened names and their corresponding full names
  const nameMappings = [
    { short: "2023", full: "2023 Main Contest" },
    { short: "2022", full: "2022 Main Contest" },
    { short: "2021", full: "2021 Main Contest" },
    { short: "2020", full: "2020 Main Contest" },
    { short: "Discovery", full: "Discovery Contest" },
    { short: "Forest", full: "Forest Contest" },
    { short: "BSINH", full: "Best Song I Never Heard Contest" },
    { short: "BVGM", full: "Best VGM List Song Contest" },
    { short: "BVGM 2", full: "Best VGM List Song Contest 2" },
    { short: "Cameo", full: "Cameo Contest" },
    { short: "Pokémon", full: "Pokémon Contest" },
    { short: "Hindsight 2023", full: "Hindsight 2023" },
    { short: "Hindsight 2022", full: "Hindsight 2022" },

    // Add more mappings as needed
  ];

  // Find the matching object in the array
  const match = nameMappings.find((mapping) => mapping.short === shortName);

  // Return the full name if a match is found, otherwise return the input string
  return match ? match.full : shortName;
}

function replaceSpacesWithUnderlines(str) {
  return str.replace(/ /g, "_");
}
