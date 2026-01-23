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

//colours for sheets cells:
const lightGreen = { red: 0.8, green: 1, blue: 0.8, alpha: 0.2 };
const lightGray = { red: 0.9, green: 0.9, blue: 0.9, alpha: 0.2 };
const lightGold = { red: 1, green: 0.9, blue: 0.5, alpha: 0.2 };
const lightBlue = { red: 0.7, green: 0.85, blue: 1, alpha: 0.2 };

async function SendTripleBattleMessage(
  interaction,
  matchData,
  bot = "",
  tripleDb,
  secondOfDay = false,
  previousMatches = []
  //interaction = ""
) {
  //,
  // populatedDb
  //)
  const numberOfContestants = tripleDb.roundsPerTurn;
  //const guildObject = bot.guilds.cache.get(process.env.GUILD_ID);
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
  if (!secondOfDay) {
    await SendPreviousTripleDayResultsEmbeds(
      guildObject,
      previousMatches,
      matchData
    );
  }
  //);

  const youtubeUrls = [
    matchData.entrant1.link,
    matchData.entrant2.link,
    matchData.entrant3.link,
  ];
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
      SendTripleDailyEmbed(
        guildObject,
        matchData,
        gifName,
        youtubeUrls,
        secondOfDay,
        previousMatches
      );
    });
    //CreateDailyEmbedContent(tournamentRoundDetails, reactionDetails);
  });
}

async function SendPreviousTripleDayResultsEmbeds(
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
  const currentTournamentName = await getCurrentTournamentNameFromDb();

  var previousEmbedsToSend = [];
  var logsEmbedsToSend = [];
  var links = [];
  let imgName = "";
  let embedImg = "";
  let imagesFolder = "public/commands/gif/input";
  let dstPath = "public/commands/gif/jpg";

  var prevWinner = "";

  for (var i = 0; i < previousMatches[0].length; i++) {
    if (previousMatches[0][i].firstPlace.name !== prevWinner) {
      var previousMatchesDetails = await GetTripleVoteResults(
        previousMatches[0][i].match
      );
      const orderedEntrants = [
        { ...previousMatchesDetails.aDetails, name: "A" },
        { ...previousMatchesDetails.bDetails, name: "B" },
        { ...previousMatchesDetails.cDetails, name: "C" },
      ];
      // We should always have a 1st place getting here so this is just for second place
      orderedEntrants.sort((entrant1, entrant2) => {
        // First, compare by points
        if (entrant1.points !== entrant2.points) {
          return entrant2.points - entrant1.points; // Descending order
        }

        // Tie-breaker logic for second and third places
        const secondVoteCount1 = calculateSecondVoteCount(
          entrant1,
          orderedEntrants
        );
        const secondVoteCount2 = calculateSecondVoteCount(
          entrant2,
          orderedEntrants
        );

        return secondVoteCount2 - secondVoteCount1;
        // Tie-breaker logic based on total amount of *second* votes
      });
      const firstPlaceEntrant = orderedEntrants[0];
      const secondPlaceEntrant = orderedEntrants[1];
      const thirdPlaceEntrant = orderedEntrants[2];

      prevWinner = firstPlaceEntrant.entrantDetails.name;
      links = [firstPlaceEntrant.entrantDetails.link];

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

        const startCell =
          bestVGM2023Cells[`match${previousMatches[0][i].match.toString()}`];
        const todaysSheetCell =
          "https://docs.google.com/spreadsheets/d/1A9eNaKBuVMycRHYZGSyidapKqqSg-fIL0RzSFL9N2_Q/edit#gid=0&range=" +
          startCell;

        var secondPlaceText =
          "2nd place: " +
          secondPlaceEntrant.entrantDetails.title +
          " - " +
          secondPlaceEntrant.entrantDetails.name;
        var thirdPlaceText =
          "3rd place: " +
          thirdPlaceEntrant.entrantDetails.title +
          " - " +
          thirdPlaceEntrant.entrantDetails.name;

        var nextRound = parseInt(3) + 1;
        prevEmbed
          .setTitle(
            "Continues into round " +
              nextRound +
              " : " +
              firstPlaceEntrant.entrantDetails.title +
              " - " +
              firstPlaceEntrant.entrantDetails.name +
              ""
          )
          .setAuthor({
            name:
              "Round " +
              parseInt(3) +
              " - Match " +
              previousMatches[0][i].match +
              " Winner",
            iconURL:
              "http://91.99.239.6/files/assets/sd_logo.png",
          })
          .addFields(
            {
              name: secondPlaceText,
              value: "Points: " + secondPlaceEntrant.points,
              inline: true,
            },
            {
              name: thirdPlaceText,
              value: "Points: " + thirdPlaceEntrant.points,
              inline: true,
            },
            {
              name: "Votes Breakdown",
              value:
                "Tally's for votes cast in match " +
                previousMatches[0][i].match,
              inline: false,
            },
            {
              name: `A>B>C`,
              value: VoteString(
                previousMatchesDetails.aDetails.abcVoters.length,
                "A>B>C"
              ),
              inline: true,
            },
            {
              name: `A>C>B`,
              value: VoteString(
                previousMatchesDetails.aDetails.acbVoters.length,
                "A>C>B"
              ),
              inline: true,
            },
            {
              name: `B>A>C`,
              value: VoteString(
                previousMatchesDetails.bDetails.bacVoters.length,
                "B>A>C"
              ),
              inline: true,
            },
            {
              name: `B>C>A`,
              value: VoteString(
                previousMatchesDetails.bDetails.bcaVoters.length,
                "B>C>A"
              ),
              inline: true,
            },
            {
              name: `C>A>B`,
              value: VoteString(
                previousMatchesDetails.cDetails.cabVoters.length,
                "C>A>B"
              ),
              inline: true,
            },
            {
              name: `C>B>A`,
              value: VoteString(
                previousMatchesDetails.cDetails.cbaVoters.length,
                "C>B>A"
              ),
              inline: true,
            } /*,
            {
              name: "Tournament Links",
              value:
                "[Tournament Bracket](" +
                todaysSheetCell +
                ") - [Tournament Playlist](https://youtube.com/playlist?list=PLaHaXWMJA7tfGylkXkwQtfWMhMpofo8TR&si=YiT1oMf3lmQASl5J)",
              inline: false,
            }*/
          )

          .setColor(0xffffff)

          .setDescription("**Points: " + firstPlaceEntrant.points + "**")
          .setImage(previousWinnerPath);
        previousEmbedsToSend.push(prevEmbed);

        ////////////////////////////////////////////////////////////////////

        var abcString = CreateUsersString(
          previousMatchesDetails.aDetails.abcVoters,
          members
        );
        var acbString = CreateUsersString(
          previousMatchesDetails.aDetails.acbVoters,
          members
        );
        var bacString = CreateUsersString(
          previousMatchesDetails.bDetails.bacVoters,
          members
        );
        var bcaString = CreateUsersString(
          previousMatchesDetails.bDetails.bcaVoters,
          members
        );
        var cabString = CreateUsersString(
          previousMatchesDetails.cDetails.cabVoters,
          members
        );
        var cbaString = CreateUsersString(
          previousMatchesDetails.cDetails.cbaVoters,
          members
        );

        var resultLogEmbed = new EmbedBuilder();

        resultLogEmbed
          //   .setColor(0x097969)
          .setTitle(
            "Round 3 - Match: " +
              previousMatches[0][i].match
          )
          .setAuthor({
            name: "Best VGM 2023 Awards",
            iconURL:
              "http://91.99.239.6/files/assets/sd_logo.png",
          })
          .setDescription(
            "**------------------------------------**\n**Battle Entries**:\n**A. " +
              previousMatchesDetails.aDetails.entrantDetails.title +
              " - " +
              previousMatchesDetails.aDetails.entrantDetails.name +
              "**\n> Score: " +
              previousMatchesDetails.aDetails.points +
              "\n**B. " +
              previousMatchesDetails.bDetails.entrantDetails.title +
              " - " +
              previousMatchesDetails.bDetails.entrantDetails.name +
              "**\n> Score: " +
              previousMatchesDetails.bDetails.points +
              "\n**C. " +
              previousMatchesDetails.cDetails.entrantDetails.title +
              " - " +
              previousMatchesDetails.cDetails.entrantDetails.name +
              "**\n> Score: " +
              previousMatchesDetails.cDetails.points +
              "\n**------------------------------------**\n\n**Breakdown**:"
          )
          //.setThumbnail(
          //  "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/domo-voting-result.gif?v=1681088448448"
          //)
          .setImage(
            "https://sd-dev-bot.glitch.me/commands/gif/output/" +
              gifName +
              ".gif"
          )
          .addFields(
            {
              //name: "<:ABC:1090369448185172028>",
              name: "<:ABC:1090369448185172028> **A>B>C**",
              value:
                "**Votes: " +
                previousMatchesDetails.aDetails.abcVoters.length +
                "**\n" +
                abcString,
              inline: false,
            },
            {
              //name: "<:ACB:1090369449422499870>",
              name: "<:ACB:1090369449422499870> **A>C>B**",
              value:
                "**Votes: " +
                previousMatchesDetails.aDetails.acbVoters.length +
                "**\n" +
                acbString,
              inline: false,
            },
            {
              //name: "<:BAC:1090369451549020321>",
              name: "<:BAC:1090369451549020321> **B>A>C**",
              value:
                "**Votes: " +
                previousMatchesDetails.bDetails.bacVoters.length +
                "**\n" +
                bacString,
              inline: false,
            },
            {
              //name: "<:BCA:1090369452874412133>",
              name: "<:BCA:1090369452874412133> **B>C>A**",
              value:
                "**Votes: " +
                previousMatchesDetails.bDetails.bcaVoters.length +
                "**\n" +
                bcaString,
              inline: false,
            },
            {
              //name: "<:CAB:1090369455533588540>",
              name: "<:CAB:1090369455533588540> **C>A>B**",
              value:
                "**Votes: " +
                previousMatchesDetails.cDetails.cabVoters.length +
                "**\n" +
                cabString,
              inline: false,
            },
            {
              //name: "<:CBA:1090369457806909571>",
              name: "<:CBA:1090369457806909571> **C>B>A**",
              value:
                "**Votes: " +
                previousMatchesDetails.cDetails.cbaVoters.length +
                "**\n" +
                cbaString,
              inline: false,
            }
          )
          .setColor(0x4dc399)
          .setFooter({
            text: "Supradarky's VGM Club",
            iconURL:
              "http://91.99.239.6/files/assets/sd-img.png",
          });
        await logsEmbedsToSend.push(resultLogEmbed);
        await AddWinnerToNextRound(firstPlaceEntrant);
      });
    }
  }

  console.log("Sending previous day stuff");
  //channel.send({ embeds: previousEmbedsToSend });
  //botLogChannel.send({ embeds: logsEmbedsToSend });

  /*for (var i = 0; i < previousEmbedsToSend.length; i++) {
    await channel.send({ embeds: [previousEmbedsToSend[i]] });
    await sleep(250);
  }*/

  for (var i = 0; i < logsEmbedsToSend.length; i++) {
    await botLogChannel.send({ embeds: [logsEmbedsToSend[i]] });
    await sleep(250);
  }
}

async function SendTripleDailyEmbed(
  guild,
  matchData,
  gifName,
  youtubeUrls,
  secondOfDay = false,
  previousMatches = []
) {
  const channel = await GetChannelByName(guild, process.env.TOURNAMENT_CHANNEL);

  const gifPath =
    "http://91.99.239.6/dev_files/output/" + gifName + ".gif";

  const d = new Date();
  let day = d.getDay();

  var timeUntilNextRound =
    day == 5 ? GetTimeInEpochStamp(72) : GetTimeInEpochStamp(24);

  var todaysSheetCell = "";

  if (previousMatches[0].length > 0) {
    const startCell =
      bestVGM2023Cells[`match${previousMatches[0][0].match.toString()}`];
    todaysSheetCell =
      "https://docs.google.com/spreadsheets/d/1A9eNaKBuVMycRHYZGSyidapKqqSg-fIL0RzSFL9N2_Q/edit#gid=0&range=" +
      startCell;
  }

  var embed = new EmbedBuilder();
  embed
    .setTitle("Round " + matchData.round + " - Match " + matchData.match)
    .setAuthor({
      name: "Best VGM 2023 Awards",
      iconURL:
        "http://91.99.239.6/files/assets/sd_logo.png",
    })
    .setColor(0xffff00)
    .addFields(
      {
        name:
          "**Next Match:** Voting for this match ends <t:" +
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
      {
        name:
          `C. ` + matchData.entrant3.title + ` - ` + matchData.entrant3.name,
        value: matchData.entrant3.link,
      } //,
      //{
      //  name: "\u200B",
      //  value: "\u200B",
      //},
      /*{
        name: `------------------------------------`,
        value: `\u200B`, //` by reacting to this post:`,
        //value: `Ranked Order for voting purposes:`,
      }*/
    )
    .setFooter({
      text: "After having listened to all tracks, vote for your ranked order of preference.",
      iconURL:
        "http://91.99.239.6/files/assets/domo_smarty_pants_face.png",
    })

    .setThumbnail(gifPath);

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
  /*if (matchData.match == "125") {
    embed.setImage(
      "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/125-A.png?v=1698857109720"
    );
  }*/

  var embedsToSend = [embed];
  var welcomeString = "Hello all and <@&1193953209019007106>";
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
        " vs " +
        entry.entrant3.name +
        "";
    }
    welcomeString +=
      "\n❗ It appears we have a tie match! ❗\nPlease vote on or reconsider these matches: " +
      roundsToCheck;
  }

  if (!secondOfDay) {
    channel.send(welcomeString);
  }

  await sleep(1500);
  channel.send({ embeds: embedsToSend }).then((embedMessage) => {
    var aButtonVotes = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`triple-A>B>C-${matchData.match}-${matchData.round}`)
          .setLabel("A>B>C")
          .setStyle("4")
      )
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`triple-A>C>B-${matchData.match}-${matchData.round}`)
          .setLabel("A>C>B")
          .setStyle("4")
      );

    var bButtonVotes = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`triple-B>A>C-${matchData.match}-${matchData.round}`)
          .setLabel("B>A>C")
          .setStyle("1")
      )
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`triple-B>C>A-${matchData.match}-${matchData.round}`)
          .setLabel("B>C>A")
          .setStyle("1")
      );
    var cButtonVotes = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`triple-C>A>B-${matchData.match}-${matchData.round}`)
          .setLabel("C>A>B")
          .setStyle("3")
      )
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`triple-C>B>A-${matchData.match}-${matchData.round}`)
          .setLabel("C>B>A")
          .setStyle("3")
      );

    embedMessage.edit({
      components: [aButtonVotes, bButtonVotes, cButtonVotes],
    });
  });

  // Add songs to YTPlaylist
  //await AddTournamentSongsToTournamentPlaylist(youtubeUrls);
  //await sleep(1500);

  const sheetUrl =
    "https://docs.google.com/spreadsheets/d/1A9eNaKBuVMycRHYZGSyidapKqqSg-fIL0RzSFL9N2_Q";
  //if round 1, we need to fill in the days match
  if (matchData.round == 1) {
    var entrantStrings = [
      matchData.entrant1.title + ` - ` + matchData.entrant1.name,
      matchData.entrant2.title + ` - ` + matchData.entrant2.name,
      matchData.entrant3.title + ` - ` + matchData.entrant3.name,
    ];

    await PopulateTournamentSheet(sheetUrl, matchData.match, entrantStrings);
    await sleep(1000);
    var nextRoundMatchindex = differenceFromLastMultipleOfThree(
      matchData.match
    );
    console.log("Prev Match count: " + previousMatches[0][0].length);
    var previousMatchIndex = previousMatches[0].length - 1;
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
    );
    await fillCells(
      sheetUrl,
      "Bracket",
      matchData.nextRoundNextMatch,
      [nextRoundStringValue],
      differenceFromLastMultipleOfThree(matchData.match) + 1
    );
    await sleep(1000);
  }
  await ColourPreviousMatches(sheetUrl, previousMatches);
  await sleep(1000);
}

async function GetTripleVoteResults(matchNum) {
  var db = GetDb();
  await db.read();
  console.log("Ending Triple Matches");
  let currentTournamentName = await getCurrentTournament(db);

  let tournamentDetails = await db.get("tournaments").nth(0).value();
  let triple = tournamentDetails[currentTournamentName];

  const match = triple.matches.find((m) => m.match == matchNum);
  var aEntrantDetails = {
    name: match.entrant1.name,
    title: match.entrant1.title,
    link: match.entrant1.link,
  };
  var bEntrantDetails = {
    name: match.entrant2.name,
    title: match.entrant2.title,
    link: match.entrant2.link,
  };
  var cEntrantDetails = {
    name: match.entrant3.name,
    title: match.entrant3.title,
    link: match.entrant3.link,
  };

  var abc = [],
    acb = [],
    bac = [],
    bca = [],
    cab = [],
    cba = [];
  var aDetails,
    bDetails = [],
    cDetails = [];
  var aPoints = 0,
    bPoints = 0,
    cPoints = 0;

  // Get the A votes
  match.entrant1.voters.first.forEach((voterId) => {
    aPoints += 2;
    if (match.entrant2.voters.second.includes(voterId)) {
      bPoints += 1;
      abc.push(voterId);
    } else {
      cPoints += 1;
      acb.push(voterId);
    }
  });
  match.entrant2.voters.first.forEach((voterId) => {
    bPoints += 2;
    if (match.entrant1.voters.second.includes(voterId)) {
      aPoints += 1;
      bac.push(voterId);
    } else {
      cPoints += 1;
      bca.push(voterId);
    }
  });
  match.entrant3.voters.first.forEach((voterId) => {
    cPoints += 2;
    if (match.entrant1.voters.second.includes(voterId)) {
      aPoints += 1;
      cab.push(voterId);
    } else {
      bPoints += 1;
      cba.push(voterId);
    }
  });
  return {
    match: matchNum,
    aDetails: {
      entrantDetails: aEntrantDetails,
      points: aPoints,
      abcVoters: abc,
      acbVoters: acb,
    },
    bDetails: {
      entrantDetails: bEntrantDetails,
      points: bPoints,
      bacVoters: bac,
      bcaVoters: bca,
    },
    cDetails: {
      entrantDetails: cEntrantDetails,
      points: cPoints,
      cabVoters: cab,
      cbaVoters: cba,
    },
  };
}

async function AddWinnerToNextRound(firstPlaceEntrant) {
  var db = GetDb();
  await db.read();
  console.log("Ending Triple Matches");
  let currentTournamentName = await getCurrentTournament(db);

  let tournamentDetails = await db.get("tournaments").nth(0).value();
  let triple = tournamentDetails[currentTournamentName];
  var nextRoundNum = (parseInt(triple.round) + 1).toString();
  var nextMatchNum = triple.nextRoundNextMatch;

  var entrantForNextRound = {
    name: firstPlaceEntrant.entrantDetails.name,
    title: firstPlaceEntrant.entrantDetails.title,
    link: firstPlaceEntrant.entrantDetails.link,
    match: parseInt(nextMatchNum),
  };

  if (!triple.rounds[nextRoundNum]) {
    triple.rounds[nextRoundNum] = [];
  }
  triple.rounds[nextRoundNum].push(entrantForNextRound);

  const matchingEntries = triple.rounds[nextRoundNum].filter(
    (entry) => entry.match === nextMatchNum
  );
  if (matchingEntries.length % 3 == 0) {
    triple.nextRoundNextMatch = nextMatchNum + 1;
  }

  db.get("tournaments")
    .nth(0)
    .assign({
      [currentTournamentName]: triple,
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

function calculateSecondVoteCount(entrant, orderedEntrants) {
  var abcVotes = orderedEntrants[0].abcVoters;
  var acbVotes = orderedEntrants[0].acbVoters;
  var bacVotes = orderedEntrants[1].bacVoters;
  var bcaVotes = orderedEntrants[1].bcaVoters;
  var cabVotes = orderedEntrants[2].cabVoters;
  var cbaVotes = orderedEntrants[2].cbaVoters;

  var abcVoteLength = abcVotes.length;
  var acbVoteLength = acbVotes.length;
  var bacVoteLength = bacVotes.length;
  var bcaVoteLength = bcaVotes.length;
  var cabVoteLength = cabVotes.length;
  var cbaVoteLength = cbaVotes.length;
  // Tie-breaker logic based on total amount of *second* votes
  // entrant.name = "A"
  switch (entrant.name) {
    case "A":
      return bacVoteLength + cabVoteLength;
    case "B":
      return abcVoteLength + cbaVoteLength;
    case "C":
      return acbVoteLength + bcaVoteLength;
    default:
      return 0;
  }
}

function differenceFromLastMultipleOfThree(number) {
  let lastMultipleOfThree = number - (number % 3);
  return number - lastMultipleOfThree;
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
