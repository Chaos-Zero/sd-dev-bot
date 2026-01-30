//HAS CHANGED
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

function getSingleTotalRounds(startingMatchCount) {
  let matchesThisRound = parseInt(startingMatchCount);
  if (isNaN(matchesThisRound) || matchesThisRound < 1) {
    return 0;
  }
  let rounds = 0;
  while (matchesThisRound >= 1) {
    rounds += 1;
    if (matchesThisRound === 1) {
      break;
    }
    matchesThisRound = Math.ceil(matchesThisRound / 2);
  }
  return rounds;
}

function getSingleFinalRoundNumber(single) {
  const baseRounds = getSingleTotalRounds(single.startingMatchCount);
  if (!baseRounds) {
    return 0;
  }
  return single.hasThirdPlaceMatch ? baseRounds + 1 : baseRounds;
}

function getSingleBaseFinalMatchNumber(startingMatchCount) {
  const baseFinalMatchNumber = parseInt(startingMatchCount) * 2 - 1;
  if (isNaN(baseFinalMatchNumber) || baseFinalMatchNumber < 1) {
    return 0;
  }
  return baseFinalMatchNumber;
}

function getSingleThirdPlaceMatchNumber(single) {
  if (single.hasThirdPlaceMatch === false) {
    return null;
  }
  return getSingleBaseFinalMatchNumber(single.startingMatchCount);
}

function getChallongeMatchNumberForSingle(single, matchNumber, isThirdPlace) {
  if (!single?.isChallonge) {
    return matchNumber;
  }
  const thirdPlaceMatchNumber = getSingleThirdPlaceMatchNumber(single);
  if (!thirdPlaceMatchNumber) {
    return matchNumber;
  }
  const finalMatchNumber = thirdPlaceMatchNumber + 1;
  if (isThirdPlace || matchNumber === thirdPlaceMatchNumber) {
    return finalMatchNumber;
  }
  if (matchNumber === finalMatchNumber) {
    return thirdPlaceMatchNumber;
  }
  return matchNumber;
}

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

function getEntrantTypePrefix(type) {
  return type ? type + " wins!\n" : "";
}

function getSingleRoundLabel(single, roundNum, isThirdPlace) {
  if (isThirdPlace) {
    return "Match for Third Place";
  }
  const baseRounds = getSingleTotalRounds(single.startingMatchCount);
  const finalRoundNumber = getSingleFinalRoundNumber(single);
  if (!baseRounds || isNaN(roundNum)) {
    return "";
  }
  if (roundNum === finalRoundNumber) {
    return "Final";
  }
  if (roundNum === baseRounds - 1) {
    return "Semifinal";
  }
  return "";
}

async function SendSingleBattleMessage(
  interaction,
  matchData,
  bot = "",
  singleDb,
  secondOfDay = false,
  previousMatches = [],
  options = {}
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
  const skipPreviousResults = options?.skipPreviousResults === true;
  if (previousMatches != "" && !skipPreviousResults) {
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
  const db = GetDb();
  db.read();
  const currentTournamentName = await getCurrentTournament(db);
  let gifName = buildTournamentGifName(
    currentTournamentName,
    matchData.round,
    matchData.match
  );

  await downloadImages(youtubeUrls);
  console.log("Making gif");
  //  await createGif("neuquant", gifName).then(async () => {
  await createGif("neuquant", gifName);

  await SendSingleDailyEmbed(
    guildObject,
    matchData,
    gifName,
    youtubeUrls,
    secondOfDay,
    previousMatches,
    options
  );
}

async function SendPreviousSingleDayResultsEmbeds(
  guild,
  previousMatches,
  matchData,
  includeTieWarning = true,
  options = {}
) {
  console.log("We're in previous day stuff");
  if (
    previousMatches.length < 1 ||
    (previousMatches[0].length < 1 && previousMatches[1].length < 1)
  ) {
    return 0;
  }
  const channel = await GetChannelByName(guild, process.env.TOURNAMENT_CHANNEL);
  const botLogChannel = await GetChannelByName(
    guild,
    process.env.BOT_LOG_CHANEL
  );

  let members = [];
  try {
    members = await guild.members.fetch();
  } catch (error) {
    console.log("Failed to fetch guild members for results:", error);
  }

  var db = GetDb();
  db.read();

  let currentTournamentName = await getCurrentTournament(db);
  let tournamentDetails = await db.get("tournaments").nth(0).value();

  console.log(matchData.round + " " + tournamentDetails.isChallonge);

  let single = tournamentDetails[currentTournamentName];
  const challongeTournamentUrlName = replaceSpacesWithUnderlines(
    currentTournamentName.replace(/-/g, " ")
  );
  const baseRounds = getSingleTotalRounds(single.startingMatchCount);
  const finalRoundNumber = getSingleFinalRoundNumber(single);

  var previousEmbedsToSend = [];
  var logsEmbedsToSend = [];
  var links = [];
  let imgName = "";
  let embedImg = "";
  let imagesFolder = "public/commands/gif/input";
  let dstPath = "public/commands/gif/jpg";

  var prevWinner = "";

  const includeResults = options?.includeResults !== false;
  const includeLogs = options?.includeLogs !== false;
  const advanceWinners = options?.advanceWinners !== false;
  const allowCompletion = options?.allowCompletion !== false;

  for (var i = 0; i < previousMatches[0].length; i++) {
    if (previousMatches[0][i].firstPlace.name !== prevWinner) {
      prevWinner = previousMatches[0][i].firstPlace.name;
      links = [previousMatches[0][i].firstPlace.link];

      var ytLinks = await GetYtThumb(links);

      let gifName = buildTournamentGifName(
        currentTournamentName,
        previousMatches[0][i].round,
        previousMatches[0][i].match
      );

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

      var nextRound = 6;
      const roundLabel = getSingleRoundLabel(
        single,
        parseInt(previousMatches[0][i].round),
        previousMatches[0][i].isThirdPlace
      );
      const isThirdPlaceMatch = previousMatches[0][i].isThirdPlace === true;
      const isFinalMatch = roundLabel === "Final" && !isThirdPlaceMatch;
      const winnerPlaceLabel = isThirdPlaceMatch
        ? "3rd Place"
        : isFinalMatch
        ? "1st Place"
        : null;
      const runnerUpLabel = isThirdPlaceMatch
        ? "4th Place"
        : isFinalMatch
        ? "2nd Place"
        : "Runner-up";
      var secondPlaceText =
        "**" +
        runnerUpLabel +
        ": " +
        previousMatches[0][i].secondPlace.name +
        " - " +
        previousMatches[0][i].secondPlace.title +
        "**";
      prevEmbed
        .setTitle(
          (winnerPlaceLabel ? "" : roundLabel ? roundLabel + " - " : "") +
            (winnerPlaceLabel ? winnerPlaceLabel + ": " : "") +
            getEntrantTypePrefix(previousMatches[0][i].firstPlace.type) +
            previousMatches[0][i].firstPlace.name +
            " - " +
            previousMatches[0][i].firstPlace.title +
            ""
        )
        .setAuthor({
          name: "Match " + previousMatches[0][i].match + " Results",
          iconURL:
            "http://91.99.239.6/files/assets/sd_logo.png",
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
        includeResults &&
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
          (roundLabel ? roundLabel + " - " : "") +
            "Round " +
            previousMatches[0][i].round +
            " -  Match: " +
            previousMatches[0][i].match
        )
        .setAuthor({
          name: currentTournamentName,
          iconURL:
            "http://91.99.239.6/files/assets/sd_logo.png",
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
          "http://91.99.239.6/dev_files/output/" + gifName + ".gif"
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
            "http://91.99.239.6/files/assets/sd-img.png",
        });
      if (
        includeLogs &&
        previousMatches[0][i].firstPlace.points !==
          previousMatches[0][i].secondPlace.points
      ) {
        await logsEmbedsToSend.push(resultLogEmbed);
      }
      if (advanceWinners) {
        await AddSingleWinnerToNextRound(
          previousMatches[0][i].firstPlace,
          previousMatches[0][i].round,
          previousMatches[0][i].isThirdPlace,
          previousMatches[0][i].match
        );
      }
      //resultLogEmbed;
    }
  }

  console.log("Sending previous day stuff");  
  await sleep(500);
    
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

  if (allowCompletion) {
    const tournamentIsOver =
      finalRoundNumber > 0 &&
      previousMatches[1].length === 0 &&
      previousMatches[0].some(
        (match) =>
          parseInt(match.round) === finalRoundNumber &&
          match.isThirdPlace !== true
      );
    if (tournamentIsOver) {
      const finalMatch = previousMatches[0].find(
        (match) =>
          parseInt(match.round) === finalRoundNumber &&
          match.isThirdPlace !== true
      );
      if (finalMatch?.firstPlace?.link) {
        await channel.send(finalMatch.firstPlace.link);
      }
      const thankYouEmbed = new EmbedBuilder()
        .setDescription("Thank you for participating!")
        .setColor(0x4dc399)
        .setFooter({
          text: "Supradarky's VGM Club",
          iconURL:
            "http://91.99.239.6/files/assets/sd-img.png",
        });
      await channel.send({ embeds: [thankYouEmbed] });
      if (single.isChallonge) {
        try {
          await completeChallongeTournament(challongeTournamentUrlName);
          console.log("Challonge tournament marked complete.");
        } catch (error) {
          console.warn("Failed to complete Challonge tournament:", error);
        }
      }
      await db
        .get("tournaments")
        .nth(0)
        .assign({
          currentTournament: "N/A",
        })
        .write();
    }
  }
}

async function SendSingleDailyEmbed(
  guild,
  matchData,
  gifName,
  youtubeUrls,
  secondOfDay = false,
  previousMatches = [],
  options = {}
) {
  const channel = await GetChannelByName(guild, process.env.TOURNAMENT_CHANNEL);

  var db = GetDb();
  db.read();

  let currentTournamentName = await getCurrentTournament(db);
  let tournamentDetails = await db.get("tournaments").nth(0).value();

  console.log(matchData.round + " " + tournamentDetails.isChallonge);

  let single = tournamentDetails[currentTournamentName];
  const challongeTournamentUrlName = replaceSpacesWithUnderlines(
    currentTournamentName.replace(/-/g, " ")
  );
  const roundLabel = getSingleRoundLabel(
    single,
    parseInt(matchData.round),
    matchData.isThirdPlace
  );
  const currentChallongeUrl =
    "https://challonge.com/" + challongeTournamentUrlName;
  const gifPath =
    "http://91.99.239.6/dev_files/output/" + gifName + ".gif";
  const matchArtEntry = single?.matchArt?.[matchData.match?.toString()];
  const matchArtUrl = matchArtEntry?.filename
    ? "http://91.99.239.6/dev_files/userImages/" + matchArtEntry.filename
    : "";

  const scheduleTime = tournamentDetails?.tournamentPostTime || "19:00";
  const includeWeekends =
    tournamentDetails?.tournamentIncludeWeekends === true;
  var timeUntilNextRound = GetNextScheduleEpochFromSettings(
    scheduleTime,
    includeWeekends
  );
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
  const isTieResend = options?.isTieResend === true;
  embed
    .setTitle(
      (roundLabel ? roundLabel + " - " : "") +
        "Round " +
        matchData.round +
        " - Match " +
        matchData.match
    )
    .setAuthor({
      name: currentTournamentName,
      iconURL:
        "http://91.99.239.6/files/assets/sd_logo.png",
    })
    .setColor(isTieResend ? 0xff3b30 : 0xffff00)
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
        value:
          (matchData.entrant1.type
            ? "Faction: " + matchData.entrant1.type + "\n"
            : "") + matchData.entrant1.link,
      },
      {
        name:
          `B. ` + matchData.entrant2.name + ` - ` + matchData.entrant2.title,
        value:
          (matchData.entrant2.type
            ? "Faction: " + matchData.entrant2.type + "\n"
            : "") + matchData.entrant2.link,
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
      text:
        "< Please listen to both tracks before voting for your favourite." +
        (matchArtEntry?.username
          ? "\nArt submitted by " + matchArtEntry.username
          : ""),
      iconURL:
        "http://91.99.239.6/files/assets/domo_smarty_pants_face.png",
    })

    .setThumbnail(gifPath);

  if (matchArtUrl) {
    embed.setImage(matchArtUrl);
  }

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
  const roleId = single?.roleId;
  const rolePing = roleId ? `<@&${roleId}>` : "<@&1326256775262896290>";
  var welcomeString = `Hello all and ${rolePing}`;
  if (
    Array.isArray(previousMatches) &&
    Array.isArray(previousMatches[1]) &&
    previousMatches[1].length > 0
  ) {
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
  } else if (Array.isArray(single?.matches)) {
    const tiedMatches = single.matches.filter(
      (match) => match.progress === "tie"
    );
    if (tiedMatches.length > 0) {
      let roundsToCheck = "";
      for (const match of tiedMatches) {
        const entrant1Name = match?.entrant1?.name || "TBD";
        const entrant2Name = match?.entrant2?.name || "TBD";
        roundsToCheck +=
          "\n**Match " +
          match.match +
          "**: " +
          entrant2Name +
          " vs " +
          entrant1Name +
          "";
      }
      welcomeString +=
        "\n❗ It appears we have a tie match! ❗\nPlease vote on or reconsider these matches: " +
        roundsToCheck;
    }
  }

  if (!secondOfDay) {
    channel.send(welcomeString);
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
  if (
    matchData.round == 1 &&
    single.isChallonge &&
    options?.skipChallongeUpdates !== true
  ) {
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
  if (single.isChallonge) {
    const thirdPlaceMatchNumber = getSingleThirdPlaceMatchNumber(single);
    const finalMatchNumber = thirdPlaceMatchNumber
      ? thirdPlaceMatchNumber + 1
      : null;
    let matchType = null;
    if (matchData.isThirdPlace || matchData.match === thirdPlaceMatchNumber) {
      matchType = "third_place";
    } else if (finalMatchNumber && matchData.match === finalMatchNumber) {
      matchType = "final";
    }
    await startMatchByNumber(
      challongeTournamentUrlName,
      matchData.match,
      matchType ? { matchType } : {}
    );
  }

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

function getRoundStartMatchNumber(startingMatchCount, roundNum) {
  let start = 1;
  let matchesThisRound = startingMatchCount;
  for (let r = 1; r < roundNum; r++) {
    start += matchesThisRound;
    matchesThisRound = Math.ceil(matchesThisRound / 2);
  }
  return start;
}

function getNextRoundMatchNumber(startingMatchCount, roundNum, matchNum) {
  const roundStart = getRoundStartMatchNumber(startingMatchCount, roundNum);
  const nextRoundStart = getRoundStartMatchNumber(startingMatchCount, roundNum + 1);
  const position = matchNum - roundStart;
  return nextRoundStart + Math.floor(position / 2);
}

function dedupeRoundEntries(single) {
  if (!single || !single.rounds) {
    return;
  }
  for (const roundNum of Object.keys(single.rounds)) {
    const entries = single.rounds[roundNum];
    if (!Array.isArray(entries)) {
      continue;
    }
    const seen = new Set();
    const deduped = [];
    for (const entry of entries) {
      const key = [
        roundNum,
        entry?.match,
        entry?.name,
        entry?.fromMatch,
      ].join("|");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(entry);
    }
    single.rounds[roundNum] = deduped;
  }
}

async function AddSingleWinnerToNextRound(
  firstPlaceEntrant,
  matchRound,
  isThirdPlace,
  matchNumber
) {
  var db = GetDb();
  await db.read();
  console.log("Ending single Matches");
  let currentTournamentName = await getCurrentTournament(db);

  let tournamentDetails = await db.get("tournaments").nth(0).value();
  let single = tournamentDetails[currentTournamentName];
  dedupeRoundEntries(single);
  if (isThirdPlace) {
    return;
  }
  if (single.hasThirdPlaceMatch === undefined) {
    single.hasThirdPlaceMatch = true;
  }
  var roundNum = parseInt(matchRound);
  if (isNaN(roundNum)) {
    roundNum = parseInt(single.round);
  }
  var nextRoundNum = (roundNum + 1).toString();
  var nextMatchNum = single.nextRoundNextMatch;
  var startingMatchCount = parseInt(single.startingMatchCount);
  const baseRounds = getSingleTotalRounds(single.startingMatchCount);
  const finalRoundNumber = getSingleFinalRoundNumber(single);
  const thirdPlaceRoundNumber = baseRounds;
  const thirdPlaceMatchNumber = getSingleThirdPlaceMatchNumber(single);
  const resolvedMatchNumber = !isNaN(parseInt(matchNumber))
    ? parseInt(matchNumber)
    : parseInt(firstPlaceEntrant.match);
  const sourceMatch = single.matches?.find(
    (match) => parseInt(match.match) === parseInt(resolvedMatchNumber)
  );
  if (sourceMatch && sourceMatch.progress !== "complete") {
    return;
  }
  if (
    !isNaN(startingMatchCount) &&
    !isNaN(roundNum) &&
    !isNaN(resolvedMatchNumber)
  ) {
    nextMatchNum = getNextRoundMatchNumber(
      startingMatchCount,
      roundNum,
      resolvedMatchNumber
    );
  }
  if (
    single.hasThirdPlaceMatch &&
    thirdPlaceMatchNumber &&
    baseRounds > 0 &&
    roundNum === baseRounds - 1
  ) {
    nextMatchNum = parseInt(thirdPlaceMatchNumber) + 1;
    nextRoundNum = finalRoundNumber.toString();
  }

  var entrantForNextRound = {
    name: firstPlaceEntrant.name,
    title: firstPlaceEntrant.title,
    link: firstPlaceEntrant.link,
    type: firstPlaceEntrant.type,
    challongeSeed: firstPlaceEntrant.challongeSeed,
    challongeParticipantId: firstPlaceEntrant.challongeParticipantId,
    match: parseInt(nextMatchNum),
    fromMatch: resolvedMatchNumber,
  };

  if (!single.rounds[nextRoundNum]) {
    single.rounds[nextRoundNum] = [];
  }
  const existingNextRoundEntry = single.rounds[nextRoundNum].some(
    (entry) =>
      parseInt(entry.match) === parseInt(nextMatchNum) &&
      (entry.fromMatch === resolvedMatchNumber ||
        entry.name === firstPlaceEntrant.name)
  );
  if (existingNextRoundEntry) {
    return;
  }
  single.rounds[nextRoundNum].push(entrantForNextRound);

  const matchingEntries = single.rounds[nextRoundNum].filter(
    (entry) => parseInt(entry.match) === parseInt(nextMatchNum)
  );
  if (roundNum === parseInt(single.round) && matchingEntries.length % 2 == 0) {
    single.nextRoundNextMatch = parseInt(nextMatchNum) + 1;
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
