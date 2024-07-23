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

async function ReturnReactionTotals(bot, interaction) {
  // Would pass in tournament name from this slash command in the future
  // Example Access for first entry in current round:
  //    tournamentRoundDetails[0][0].name
  var guildObject;
  if (interaction == "") {
    guildObject = await bot.guilds.cache.get(process.env.GUILD_ID);
  } else {
    guildObject = await interaction.member.guild;
  }
  let reactionDetails = [];
  await GetLastMessageDetailsFromChannelName(
    process.env.TOURNAMENT_CHANNEL,
    guildObject,
    reactionDetails
  );
  await sleep(10000);
  console.log(reactionDetails);
  return reactionDetails;
  // await createGif("neuquant", youtubeImages);
}

async function ProcessReactionData(
  tournamentRoundDetails,
  previousDaysPoints,
  reactionDetails
) {
  console.log("Previous days points: " + previousDaysPoints);
  /*
    tournamentRoundDetails
    todaysContestants, lastContestants, currentRound, startingRound
    */
  /* 
    previousDaysPoints: 
    [{ 0: entry1Tally, 1: entry2Tally, 2: entry3Tally }, votesPerGame];
          votesPerGame: [votesForA, votesForB, votesForC];
          votesForX = { first: votedXFirst,
                        second: votedXSecond,
                        last: didNotVoteX,
                      }
    */
  var promise = new Promise((resolve) => {
    var previousDaysEntries = [
      {
        name: tournamentRoundDetails[1][0].name,
        points: Object.values(previousDaysPoints[0])[0],
        songId: 0,
      },
      {
        name: tournamentRoundDetails[1][1].name,
        points: Object.values(previousDaysPoints[0])[1],
        songId: 1,
      },
      {
        name: tournamentRoundDetails[1][2].name,
        points: Object.values(previousDaysPoints[0])[2],
        songId: 2,
      },
    ];

    var sortedPreviousDays = previousDaysEntries.sort(
      (a, b) => b.points - a.points
    );

    console.log(
      "Our sorted array 1st entry: " +
        sortedPreviousDays[0].name +
        " | Points: " +
        sortedPreviousDays[0].points +
        "\nOur sorted array 2nd entry: " +
        sortedPreviousDays[1].name +
        " | Points: " +
        sortedPreviousDays[1].points +
        "\nOur sorted array 3rd entry: " +
        sortedPreviousDays[2].name +
        " | Points: " +
        sortedPreviousDays[2].points
    );
    //sortedPreviousDays = sortedPreviousDays.reverse();

    var isATie = sortedPreviousDays[0].points == sortedPreviousDays[1].points;

    if (isATie) {
      var fistPlaceSecondVotesFromThirdPlace = 0;
      var secondPlaceSecondVotesFromThirdPlace = 0;
      console.log(
        "Trying to get object: " +
          previousDaysPoints[1][sortedPreviousDays[2].id]
      );
      for (const user of previousDaysPoints[1][sortedPreviousDays[2].songId]
        .first)
        if (
          previousDaysPoints[1][sortedPreviousDays[0].songId].second.includes(
            user
          )
        ) {
          fistPlaceSecondVotesFromThirdPlace += 1;
        } else if (
          previousDaysPoints[1][sortedPreviousDays[1].songId].second.includes(
            user
          )
        ) {
          secondPlaceSecondVotesFromThirdPlace += 1;
        }
      var firstPlace =
        fistPlaceSecondVotesFromThirdPlace >
        secondPlaceSecondVotesFromThirdPlace
          ? sortedPreviousDays[0]
          : sortedPreviousDays[1];
      var secondPlace =
        fistPlaceSecondVotesFromThirdPlace >
        secondPlaceSecondVotesFromThirdPlace
          ? sortedPreviousDays[1]
          : sortedPreviousDays[0];
      sortedPreviousDays[0] = firstPlace;
      sortedPreviousDays[1] = secondPlace;
    }
    console.log("Our sorted array 1st entry: " + sortedPreviousDays[0]);
    resolve(sortedPreviousDays);
  });
  return promise;
}

function SortPreviousDaysEntries(entries) {
  /*
     {
       name: "Freedom Planet 2 - Dragon Valley (Stage 1)",
       link: "https://youtu.be/49mVLN8OJSo",
       battle: 1,
       points: 0,
       hasTakenPlace: true,
       usersFirstPick: [],
       usersSecondPick: [],
       usersDidNotPlace: [],
     }
 */

  var sortedEntries = entries.sort((a, b) => b.points - a.points);
  console.log("Sorted Round = " + sortedEntries[0].name);

  var isATie = sortedEntries[0].points == sortedEntries[1].points;
  if (isATie) {
    var fistPlaceSecondVotesFromThirdPlace = 0;
    var secondPlaceSecondVotesFromThirdPlace = 0;

    for (const user of sortedEntries[2].usersFirstPick)
      if (sortedEntries[0].usersSecondPick.includes(user)) {
        fistPlaceSecondVotesFromThirdPlace += 1;
      } else if (sortedEntries[1].usersSecondPick.includes(user)) {
        secondPlaceSecondVotesFromThirdPlace += 1;
      }
    var firstPlace =
      fistPlaceSecondVotesFromThirdPlace > secondPlaceSecondVotesFromThirdPlace
        ? sortedEntries[0]
        : sortedEntries[1];
    var secondPlace =
      fistPlaceSecondVotesFromThirdPlace > secondPlaceSecondVotesFromThirdPlace
        ? sortedEntries[1]
        : sortedEntries[0];
    sortedEntries[0] = firstPlace;
    sortedEntries[1] = secondPlace;
  }
  return sortedEntries;
}

async function SendDailyEmbed(
  guild,
  db,
  populatedDb,
  tournamentRoundDetails,
  gifName
) {
  // tournamentRoundDetails = [todaysContestants, lastContestants, currentRound, startingRound];
  /*
     {
       name: "Freedom Planet 2 - Dragon Valley (Stage 1)",
       link: "https://youtu.be/49mVLN8OJSo",
       battle: 1,
       points: 0,
       hasTakenPlace: true,
       usersFirstPick: [],
       usersSecondPick: [],
       usersDidNotPlace: [],
     }
 */
  //SendUpdateToLogs(guild, db);
  const channel = await GetChannelByName(guild, process.env.TOURNAMENT_CHANNEL);
  var links = [];
  var imgName = "";
  let embedImg = "";
  var sortedPreviousDaysEntries = [];
  //let previousMessage = await GetLastMessageInChannel(channel);

  if (tournamentRoundDetails[1].length > 0) {
    sortedPreviousDaysEntries = SortPreviousDaysEntries(
      tournamentRoundDetails[1]
    );
    links = [sortedPreviousDaysEntries[0].link];
    //imgName = (Math.random() + 1).toString(36).substring(7);
    var ytLink = await GetYtThumb(links);
    console.log("This is the ytLink: " + ytLink[0]);
    embedImg = ytLink[0][0];
    imgName = ytLink[0][1];
    console.log("imgName here: " + imgName);
  }

  let imagesFolder = "/app/public/commands/gif/input";
  let dstPath = "/app/public/commands/gif/jpg";

  moveFiles(imagesFolder, dstPath);
  await sleep(1000);

  downloadImages(links, imgName).then(async () => {
    if (sortedPreviousDaysEntries.length > 0) {
      var prevEmbed = new EmbedBuilder();
      const previousWinnerPath = embedImg;
      // Discord caches images so we have to change the name each day
      // Just going to use the date
      await sleep(3000);

      console.log("Link to winner image: " + previousWinnerPath);

      function VoteString(num) {
        return num == 1 ? num + " vote" : num + " votes";
      }

      prevEmbed
        //.setTimestamp(Date.now() + 1)
        .setTitle("1st Place: " + sortedPreviousDaysEntries[0].name + "")
        .setAuthor({
          name: "Previous Battle Winner",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        })
        .addFields(
          {
            name: "2nd Place: " + sortedPreviousDaysEntries[1].name,
            value: "Points: " + sortedPreviousDaysEntries[1].points,
            inline: true,
          },
          {
            name: "3rd Place: " + sortedPreviousDaysEntries[2].name,
            value: "Points: " + sortedPreviousDaysEntries[2].points,
            inline: true,
          },
          {
            name: "Votes Breakdown",
            value: "Tally's for votes cast in todays battle",
            inline: false,
          },
          {
            name: `A>B>C`,
            value: VoteString(
              GetTallysFromDailyVotes(
                populatedDb,
                tournamentRoundDetails[3],
                "A>B>C"
              )
            ),
            inline: true,
          },
          {
            name: `A>C>B`,
            value: VoteString(
              GetTallysFromDailyVotes(
                populatedDb,
                tournamentRoundDetails[3],
                "A>C>B"
              )
            ),
            inline: true,
          },
          {
            name: `B>A>C`,
            value: VoteString(
              GetTallysFromDailyVotes(
                populatedDb,
                tournamentRoundDetails[3],
                "B>A>C"
              )
            ),
            inline: true,
          },
          {
            name: `B>C>A`,
            value: VoteString(
              GetTallysFromDailyVotes(
                populatedDb,
                tournamentRoundDetails[3],
                "B>C>A"
              )
            ),
            inline: true,
          },
          {
            name: `C>A>B`,
            value: VoteString(
              GetTallysFromDailyVotes(
                populatedDb,
                tournamentRoundDetails[3],
                "C>A>B"
              )
            ),
            inline: true,
          },
          {
            name: `C>B>A`,
            value: VoteString(
              GetTallysFromDailyVotes(
                populatedDb,
                tournamentRoundDetails[3],
                "C>B>A"
              )
            ),
            inline: true,
          }
        )
        .setColor(0xffffff)

        .setDescription(
          "**Points: " + sortedPreviousDaysEntries[0].points + "**"
        )
        .setImage(previousWinnerPath);
      //.setFooter({
      //  text:
      //    "2nd Place: " +
      //    sortedPreviousDaysEntries[1].name +
      //    " | Points: " +
      //    sortedPreviousDaysEntries[1].points +
      //    "\n3rd Place: " +
      //    sortedPreviousDaysEntries[2].name +
      //    " | Points: " +
      //    sortedPreviousDaysEntries[2].points,
      //});
    }

    const gifPath =
      "https://major-domo.glitch.me/commands/gif/output/" + gifName + ".gif";

    // var title =
    //   "*Previous Battle Results*:\n**1st place: " +
    //   tournamentRoundDetails[1][parseInt(previousWinner)].name +
    //   " - " +
    //   Object.values(previousDaysPoints[0])[0] +
    //   " points\n2nd place Blah points\n3rd place blash points\n";
    const d = new Date();
    let day = d.getDay();

    var timeUntilNextRound =
      day == 5 ? GetTimeInEpochStamp(72) : GetTimeInEpochStamp(24);

    var isATie =
      sortedPreviousDaysEntries[0].points ==
      sortedPreviousDaysEntries[1].points;

    var embed = new EmbedBuilder();

    if (isATie) {
      embed
        .setTitle(
          "Round " +
            tournamentRoundDetails[2] +
            " - Battle " +
            (parseInt(tournamentRoundDetails[0][0].battle) - 1) +
            " - TIEBREAKER"
        )
        .setAuthor({
          name: "Best VGM 2022",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        })
        .setColor(0xffff00)
        .addFields(
          {
            name:
              "**TODAY'S TIEBREAKER BATTLE:** Voting for this battle ends <t:" +
              timeUntilNextRound +
              ":R>",
            value: "------------------------------------", //"\u200B",
          },
          {
            name: `A. ` + sortedPreviousDaysEntries[0].name,
            value: sortedPreviousDaysEntries[0].link,
          },
          {
            name: `B. ` + sortedPreviousDaysEntries[1].name,
            value: sortedPreviousDaysEntries[1].link,
          },
          //{
          //  name: "\u200B",
          //  value: "\u200B",
          //},
          {
            name: `------------------------------------`,
            value: `After having listened to all tracks, vote for your ranked order of preference.`, //` by reacting to this post:`,
            //value: `Ranked Order for voting purposes:`,
          }
        );

      // .setThumbnail(
      //   gifPath
      //"https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016"
      // );
    } else {
      embed
        .setTitle(
          "Round " +
            tournamentRoundDetails[2] +
            " - Battle " +
            tournamentRoundDetails[0][0].battle
        )
        .setAuthor({
          name: "Best VGM 2022",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        })
        .setColor(0xffff00)
        .addFields(
          {
            name:
              "**TODAY'S BATTLE:** Voting for this battle ends <t:" +
              timeUntilNextRound +
              ":R>",
            value: "------------------------------------", //"\u200B",
          },
          {
            name: `A. ` + tournamentRoundDetails[0][0].name,
            value: tournamentRoundDetails[0][0].link,
          },
          {
            name: `B. ` + tournamentRoundDetails[0][1].name,
            value: tournamentRoundDetails[0][1].link,
          },
          {
            name: `C. ` + tournamentRoundDetails[0][2].name,
            value: tournamentRoundDetails[0][2].link,
          },
          //{
          //  name: "\u200B",
          //  value: "\u200B",
          //},
          {
            name: `------------------------------------`,
            value: `After having listened to all tracks, vote for your ranked order of preference.`, //` by reacting to this post:`,
            //value: `Ranked Order for voting purposes:`,
          }
        )
        .setThumbnail(
          gifPath
          //"https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016"
        );
    }

    var embedsToSend =
      sortedPreviousDaysEntries.length > 0 ? [prevEmbed, embed] : [embed];

    if (isATie) {
      embedsToSend = [embed];
    }

    //channel.send({
    //  content: "Hello all and <@&1077345571221807244>",
    //  components: [row],
    //});
    //RemoveBotReactions(previousMessage);
    channel
      .send({
        content: "Hello all and <@&1070816463209898024>",
        embeds: embedsToSend,
      })
      .then((embedMessage) => {
        if (isATie) {
          var tieButtonVotes = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `A-${tournamentRoundDetails[2]}-${
                    parseInt(tournamentRoundDetails[0][0].battle) - 1
                  }-tie`
                )
                .setLabel("A")
                .setStyle("4")
            )
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `B-${tournamentRoundDetails[2]}-${
                    parseInt(tournamentRoundDetails[0][0].battle) - 1
                  }-tie`
                )
                .setLabel("B")
                .setStyle("1")
            );
          embedMessage.edit({
            components: [tieButtonVotes],
          });
        } else {
          var aButtonVotes = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `A>B>C-${tournamentRoundDetails[2]}-${tournamentRoundDetails[0][0].battle}`
                )
                .setLabel("A>B>C")
                .setStyle("4")
            )
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `A>C>B-${tournamentRoundDetails[2]}-${tournamentRoundDetails[0][0].battle}`
                )
                .setLabel("A>C>B")
                .setStyle("4")
            );

          var bButtonVotes = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `B>A>C-${tournamentRoundDetails[2]}-${tournamentRoundDetails[0][0].battle}`
                )
                .setLabel("B>A>C")
                .setStyle("1")
            )
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `B>C>A-${tournamentRoundDetails[2]}-${tournamentRoundDetails[0][0].battle}`
                )
                .setLabel("B>C>A")
                .setStyle("1")
            );
          var cButtonVotes = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `C>A>B-${tournamentRoundDetails[2]}-${tournamentRoundDetails[0][0].battle}`
                )
                .setLabel("C>A>B")
                .setStyle("3")
            )
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `C>B>A-${tournamentRoundDetails[2]}-${tournamentRoundDetails[0][0].battle}`
                )
                .setLabel("C>B>A")
                .setStyle("3")
            );

          embedMessage.edit({
            components: [aButtonVotes, bButtonVotes, cButtonVotes],
          });
        }
      });

    console.log(
      "Round before: " +
        tournamentRoundDetails[3] +
        "\nRound now: " +
        tournamentRoundDetails[2]
    );

    populatedDb.map((item) => {
      if (item.round == tournamentRoundDetails[3]) {
        item.votedToday = [];
      }
    });

    if (
      parseInt(tournamentRoundDetails[2]) !==
      parseInt(tournamentRoundDetails[3])
    ) {
      console.log("Moving up a round");
      UpdateRoundCompleted(populatedDb, tournamentRoundDetails[3]);
    }
    UpdateTable(db, populatedDb);

    if (sortedPreviousDaysEntries.length > 0) {
      //  await CreateAndSendBattleVotesEmbed(
      //    tournamentRoundDetails[3],
      //    parseInt(tournamentRoundDetails[1][0].battle),
      //    true
      //  );

      await sleep(4000);
      if (isATie) {
        UpdatePreviousBattleToFalse(populatedDb, tournamentRoundDetails[2]);
      }
      UpdateTable(db, populatedDb);
    }

    db.read();
    populatedDb = GetDbTable(db, process.env.TOURNAMENT_NAME);
  });
}

async function CreateAndSendDailyBattleMessages(
  bot,
  db,
  passedPopulatedDb,
  interaction = ""
) {
  var populatedDb = passedPopulatedDb;
  const numberOfContestants = 3;
  const guildObject = bot.guilds.cache.get(process.env.GUILD_ID);
  //);
  var currentRound;
  populatedDb.every(function (round) {
    if (round.isCurrentRound == true) {
      currentRound = parseInt(round.round);
      //console.log(currentRound);
      return false;
    }
    return true;
  });

  UpdateCurrentBattleToTrue(populatedDb, currentRound);

  let tournamentRoundDetails = GetNextTournamentRound(
    populatedDb,
    numberOfContestants,
    currentRound
  );

  console.log("Are we getting here");
  //[todaysContestants, lastContestants, currentRound, startingRound]
  //console.log(tournamentRoundDetails[1][1]);

  const youtubeUrls = [
    tournamentRoundDetails[0][0].link,
    tournamentRoundDetails[0][1].link,
    tournamentRoundDetails[0][2].link,
  ];
  let gifName = "round" + "3" + "battle" + tournamentRoundDetails[0][0].battle;
  downloadImages(youtubeUrls).then(async () => {
    // Discord caches images so we have to change the name each day
    // Just going to use the date

    await sleep(5000);

    const d = new Date();
    //let gifname = d.toISOString().slice(0, 10);

    console.log("Making gif");
    await createGif("neuquant", gifName).then(async () => {
      await sleep(2000);
      SendDailyEmbed(
        guildObject,
        db,
        populatedDb,
        tournamentRoundDetails,
        gifName
      );

      var sortedPreviousDaysEntries = [];
      //let previousMessage = await GetLastMessageInChannel(channel);

      if (tournamentRoundDetails[1].length > 0) {
        sortedPreviousDaysEntries = SortPreviousDaysEntries(
          tournamentRoundDetails[1]
        );
        if (
          sortedPreviousDaysEntries[0].points !==
          sortedPreviousDaysEntries[1].points
        );
        {
          InsertWinnerIntoNextRound(
            populatedDb,
            tournamentRoundDetails,
            sortedPreviousDaysEntries
          );
        }
      }
    });
    //CreateDailyEmbedContent(tournamentRoundDetails, reactionDetails);
  });
}

async function CreateAndSendFinalsBattleMessages(
  bot,
  db,
  populatedDb,
  interaction = ""
) {
  const numberOfContestants = 2;
  const guildObject = bot.guilds.cache.get(process.env.GUILD_ID);
  //);
  var currentRound;
  populatedDb.every(function (round) {
    if (round.isCurrentRound == true) {
      currentRound = parseInt(round.round);
      //console.log(currentRound);
      return false;
    }
    return true;
  });

  console.log("The current round is " + currentRound);
  UpdateCurrentBattleToTrue(populatedDb, currentRound, numberOfContestants);

  let tournamentRoundDetails = GetNextFinalsTournamentRound(
    populatedDb,
    numberOfContestants,
    currentRound
  );

  console.log("Are we getting here");
  console.log(tournamentRoundDetails[0]);
  //[todaysContestants, lastContestants, currentRound, startingRound]
  //console.log(tournamentRoundDetails[1][1]);

  const youtubeUrls = [
    tournamentRoundDetails[0][0].link,
    tournamentRoundDetails[0][1].link,
  ];
  let gifName =
    "round" +
    tournamentRoundDetails[2] +
    "battle" +
    tournamentRoundDetails[0][0].battle;
  downloadImages(youtubeUrls).then(async () => {
    // Discord caches images so we have to change the name each day
    // Just going to use the date
    await sleep(5000);

    const d = new Date();
    //let gifname = d.toISOString().slice(0, 10);

    console.log("Making gif");
    await createGif("neuquant", gifName).then(async () => {
      await sleep(3000);
      SendFinalsDailyEmbed(
        guildObject,
        db,
        populatedDb,
        tournamentRoundDetails,
        gifName
      );

      var sortedPreviousDaysEntries = [];
      //let previousMessage = await GetLastMessageInChannel(channel);

      if (tournamentRoundDetails[1].length > 0) {
        sortedPreviousDaysEntries = SortPreviousDaysEntries(
          tournamentRoundDetails[1]
        );
        //if (
        //  sortedPreviousDaysEntries[0].points !==
        //  sortedPreviousDaysEntries[1].points
        //);
        //{
        //  InsertWinnerIntoNextRound(
        //    populatedDb,
        //    tournamentRoundDetails,
        //    sortedPreviousDaysEntries
        //  );
        //}
      }
    });
    //CreateDailyEmbedContent(tournamentRoundDetails, reactionDetails);
  });
}

async function SendFinalsDailyEmbed(
  guild,
  db,
  populatedDb,
  tournamentRoundDetails,
  gifName
) {
  const channel = await GetChannelByName(guild, process.env.TOURNAMENT_CHANNEL);
  var links = [];
  let imgName = "";
  let embedImg = "";
  var sortedPreviousDaysEntries = [];
  //let previousMessage = await GetLastMessageInChannel(channel);

  if (tournamentRoundDetails[1].length > 0) {
    sortedPreviousDaysEntries = SortPreviousDaysEntries(
      tournamentRoundDetails[1]
    );
    console.log(
      "sortedPreviousDaysEntries[0].link: " + sortedPreviousDaysEntries[0].link
    );
    links = [sortedPreviousDaysEntries[0].link];

    //imgName = (Math.random() + 1).toString(36).substring(7);
    var ytLink = await GetYtThumb(links);
    console.log("This is the ytLink: " + ytLink[0]);
    embedImg = ytLink[0][0];
    imgName = ytLink[0][1];
    console.log("imgName here: " + imgName);
  }

  let imagesFolder = "/app/public/commands/gif/input";
  let dstPath = "/app/public/commands/gif/jpg";

  moveFiles(imagesFolder, dstPath);
  await sleep(1000);

  downloadImages(links, imgName).then(async () => {
    if (sortedPreviousDaysEntries.length > 0) {
      var prevEmbed = new EmbedBuilder();
      const previousWinnerPath = embedImg;
      // Discord caches images so we have to change the name each day
      // Just going to use the date
      await sleep(3000);

      console.log("Link to winner image: " + previousWinnerPath);

      function VoteString(num) {
        return num == 1 ? num + " vote" : num + " votes";
      }

      prevEmbed
        //.setTimestamp(Date.now() + 1)
        //.setTitle("1st Place: " + sortedPreviousDaysEntries[0].name + "")
        //.setAuthor({
        //  name: "Previous Battle Winner",
        //  iconURL:
        //    "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        //})
        //.addFields(
        //  {
        //    name: "2nd Place: " + sortedPreviousDaysEntries[1].name,
        //    value: "Points: " + sortedPreviousDaysEntries[1].points,
        //    inline: true,
        //  },
        //  {
        //    name: "3rd Place: " + sortedPreviousDaysEntries[2].name,
        //    value: "Points: " + sortedPreviousDaysEntries[2].points,
        //    inline: true,
        //  },
        //  {
        //    name: "Votes Breakdown",
        //    value: "Tally's for votes cast in todays battle",
        //    inline: false,
        //  },
        //  {
        //    name: "Votes Breakdown",
        //    value: "Tally's for votes cast in todays battle",
        //    inline: false,
        //  },
        //  {
        //    name: `A>B>C`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "A>B>C"
        //      )
        //    ),
        //    inline: true,
        //  },
        //  {
        //    name: `A>C>B`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "A>C>B"
        //      )
        //    ),
        //    inline: true,
        //  },
        //  {
        //    name: `B>A>C`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "B>A>C"
        //      )
        //    ),
        //    inline: true,
        //  },
        //  {
        //    name: `B>C>A`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "B>C>A"
        //      )
        //    ),
        //    inline: true,
        //  },
        //  {
        //    name: `C>A>B`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "C>A>B"
        //      )
        //    ),
        //    inline: true,
        //  },
        //  {
        //    name: `C>B>A`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "C>B>A"
        //      )
        //    ),
        //    inline: true,
        //  }
        //)
        //.setColor(0xffffff)
        //
        //.setDescription(
        //  "**Points: " + sortedPreviousDaysEntries[0].points + "**"
        //)
        //.setImage(previousWinnerPath);

        //.setTimestamp(Date.now() + 1)
        .setTitle("3rd Place: " + sortedPreviousDaysEntries[0].name + "")
        .setAuthor({
          name: "Previous Battle Winner",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        })
        .addFields({
          name: "4th Place: " + sortedPreviousDaysEntries[1].name,
          value: "Points: " + sortedPreviousDaysEntries[1].points,
          inline: true,
        })
        .setColor(0xffffff)

        .setDescription(
          "**Points: " + sortedPreviousDaysEntries[0].points + "**"
        )
        .setImage(previousWinnerPath);
    }

    const gifPath =
      "https://major-domo.glitch.me/commands/gif/output/" + gifName + ".gif";

    const d = new Date();
    let day = d.getDay();

    var timeUntilNextRound =
      day == 5 ? GetTimeInEpochStamp(72) : GetTimeInEpochStamp(24);

    var isATie =
      sortedPreviousDaysEntries[0].points ==
      sortedPreviousDaysEntries[1].points;

    var embed = new EmbedBuilder();

    if (isATie) {
      embed
        .setTitle(
          "Round " +
            tournamentRoundDetails[2] +
            " - Battle " +
            (parseInt(tournamentRoundDetails[0][0].battle) - 1) +
            " - TIEBREAKER"
        )
        .setAuthor({
          name: "Best VGM 2022",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        })
        .setColor(0xffff00)
        .addFields(
          {
            name:
              "**TODAY'S TIEBREAKER BATTLE:** Voting for this battle ends <t:" +
              timeUntilNextRound +
              ":R>",
            value: "------------------------------------", //"\u200B",
          },
          {
            name: `A. ` + sortedPreviousDaysEntries[0].name,
            value: sortedPreviousDaysEntries[0].link,
          },
          {
            name: `B. ` + sortedPreviousDaysEntries[1].name,
            value: sortedPreviousDaysEntries[1].link,
          },
          //{
          //  name: "\u200B",
          //  value: "\u200B",
          //},
          {
            name: `------------------------------------`,
            value: `After having listened to all tracks, vote for your ranked order of preference.`, //` by reacting to this post:`,
            //value: `Ranked Order for voting purposes:`,
          }
        );

      // .setThumbnail(
      //   gifPath
      //"https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016"
      // );
    } else {
      //.setTimestamp(Date.now() + 1)
      //embed
      //  .setTitle(
      //    "Round " +
      //      tournamentRoundDetails[2] +
      //      " - Battle " +
      //      tournamentRoundDetails[0][0].battle
      //  )
      //  .setAuthor({
            embed
        .setTitle(
          "Round 5 - The Final battle!"
        )
        .setAuthor({
          name: "Best VGM 2022",
      //    name: "Best VGM 2022",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        })
        .setColor(0xffff00)
        .addFields(
          {
            name:
              "**TODAY'S BATTLE:** Voting for this battle ends <t:" +
              timeUntilNextRound +
              ":R>",
            value: "------------------------------------", //"\u200B",
          },
          {
            name: `A. ` + tournamentRoundDetails[0][0].name,
            value: tournamentRoundDetails[0][0].link,
          },
          {
            name: `B. ` + tournamentRoundDetails[0][1].name,
            value: tournamentRoundDetails[0][1].link,
          },
          //{
          //  name: "\u200B",
          //  value: "\u200B",
          //},
          {
            name: `------------------------------------`,
            value: `After having listened to all tracks, vote for your ranked order of preference.`, //` by reacting to this post:`,
            //value: `Ranked Order for voting purposes:`,
          }
        )

        .setThumbnail(
          //gifPath
          "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/The%20end.png?v=1683038915455"
        )
        .setImage(
          "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/round5battle1-A.png?v=1683038955855"
        );
    }

    var embedsToSend =
      sortedPreviousDaysEntries.length > 0 ? [prevEmbed, embed] : [embed];

    if (isATie) {
      embedsToSend = [embed];
    }

    channel
      .send({
        content: "Hello all and <@&1070816463209898024>",
        embeds: embedsToSend,
      })
      .then((embedMessage) => {
        if (isATie) {
          var tieButtonVotes = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `A-${tournamentRoundDetails[2]}-${
                    parseInt(tournamentRoundDetails[0][0].battle) - 1
                  }-tie`
                )
                .setLabel("A")
                .setStyle("4")
            )
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `B-${tournamentRoundDetails[2]}-${
                    parseInt(tournamentRoundDetails[0][0].battle) - 1
                  }-tie`
                )
                .setLabel("B")
                .setStyle("1")
            );
          embedMessage.edit({
            components: [tieButtonVotes],
          });
        } else {
          var buttonVotes = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `A-${tournamentRoundDetails[2]}-${parseInt(
                    tournamentRoundDetails[0][0].battle
                  )}`
                )
                .setLabel("A")
                .setStyle("4")
            )
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `B-${tournamentRoundDetails[2]}-${parseInt(
                    tournamentRoundDetails[0][0].battle
                  )}`
                )
                .setLabel("B")
                .setStyle("1")
            );
          embedMessage.edit({
            components: [buttonVotes],
          });
        }
      });

    console.log(
      "Round before: " +
        tournamentRoundDetails[3] +
        "\nRound now: " +
        tournamentRoundDetails[2]
    );

    populatedDb.map((item) => {
      if (item.round == tournamentRoundDetails[3]) {
        item.votedToday = [];
      }
    });

    UpdateTable(db, populatedDb);

    if (
      parseInt(tournamentRoundDetails[2]) !==
      parseInt(tournamentRoundDetails[3])
    ) {
      console.log("Moving up a round");
      UpdateRoundCompleted(populatedDb, tournamentRoundDetails[3]);
    }

    if (sortedPreviousDaysEntries.length > 0) {
      //   await CreateAndSendBattleVotesEmbed(
      //     tournamentRoundDetails[3],
      //     parseInt(tournamentRoundDetails[1][0].battle),
      //     true
      //   );

      await sleep(4000);
      if (isATie) {
        UpdatePreviousBattleToFalse(populatedDb, tournamentRoundDetails[2]);
      }
      UpdateTable(db, populatedDb);
    }
  });
}

async function CreateAndSendLastBattleMessages(
  bot,
  db,
  populatedDb,
  interaction = ""
) {
  const numberOfContestants = 2;
  const guildObject = bot.guilds.cache.get(process.env.GUILD_ID);
  //);
  var currentRound;
  populatedDb.every(function (round) {
    if (round.isCurrentRound == true) {
      currentRound = parseInt(round.round);
      //console.log(currentRound);
      return false;
    }
    return true;
  });

  console.log("The current round is " + currentRound);
  UpdateCurrentBattleToTrue(populatedDb, currentRound, numberOfContestants);

  let tournamentRoundDetails = GetLastTournamentRound(
    populatedDb,
    numberOfContestants,
    currentRound
  );

  console.log("Are we getting here");
  //[todaysContestants, lastContestants, currentRound, startingRound]
  //console.log(tournamentRoundDetails[1][1]);

  //const youtubeUrls = [
  //  tournamentRoundDetails[0][0].link,
  //  tournamentRoundDetails[0][1].link,
  //];
  //let gifName =
  //  "round" +
  //  tournamentRoundDetails[2] +
  //  "battle" +
  //  tournamentRoundDetails[0][0].battle;

  const d = new Date();
  //let gifname = d.toISOString().slice(0, 10);

  SendLastDailyEmbed(guildObject, db, populatedDb, tournamentRoundDetails);

  //CreateDailyEmbedContent(tournamentRoundDetails, reactionDetails);
}

async function SendLastDailyEmbed(
  guild,
  db,
  populatedDb,
  tournamentRoundDetails
) {
  const channel = await GetChannelByName(guild, process.env.TOURNAMENT_CHANNEL);
  var links = [];
  let imgName = "";
  let embedImg = "";
  var sortedPreviousDaysEntries = [];
  //let previousMessage = await GetLastMessageInChannel(channel);

  console.log(
    "The Entrants: " + tournamentRoundDetails[0][0].name,
    tournamentRoundDetails[0][1].name,
    tournamentRoundDetails[0][2].name
  );

  if (tournamentRoundDetails.length > 0) {
    links = [tournamentRoundDetails[0][0].link];

    //imgName = (Math.random() + 1).toString(36).substring(7);
    var ytLink = await GetYtThumb(links);
    console.log("This is the ytLink: " + ytLink[0]);
    embedImg = ytLink[0][0];
    imgName = ytLink[0][1];
    console.log("imgName here: " + imgName);
  }

  let imagesFolder = "/app/public/commands/gif/input";
  let dstPath = "/app/public/commands/gif/jpg";

  moveFiles(imagesFolder, dstPath);
  await sleep(1000);

  downloadImages(links, imgName).then(async () => {
    if (tournamentRoundDetails.length > 0) {
      var prevEmbed = new EmbedBuilder();
      const previousWinnerPath = embedImg;
      // Discord caches images so we have to change the name each day
      // Just going to use the date
      await sleep(3000);

      //console.log("Link to winner image: " + previousWinnerPath);

      function VoteString(num) {
        return num == 1 ? num + " vote" : num + " votes";
      }

      prevEmbed
        //.setTimestamp(Date.now() + 1)
        //.setTitle("1st Place: " + sortedPreviousDaysEntries[0].name + "")
        //.setAuthor({
        //  name: "Previous Battle Winner",
        //  iconURL:
        //    "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        //})
        //.addFields(
        //  {
        //    name: "2nd Place: " + sortedPreviousDaysEntries[1].name,
        //    value: "Points: " + sortedPreviousDaysEntries[1].points,
        //    inline: true,
        //  },
        //  {
        //    name: "3rd Place: " + sortedPreviousDaysEntries[2].name,
        //    value: "Points: " + sortedPreviousDaysEntries[2].points,
        //    inline: true,
        //  },
        //  {
        //    name: "Votes Breakdown",
        //    value: "Tally's for votes cast in todays battle",
        //    inline: false,
        //  },
        //  {
        //    name: "Votes Breakdown",
        //    value: "Tally's for votes cast in todays battle",
        //    inline: false,
        //  },
        //  {
        //    name: `A>B>C`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "A>B>C"
        //      )
        //    ),
        //    inline: true,
        //  },
        //  {
        //    name: `A>C>B`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "A>C>B"
        //      )
        //    ),
        //    inline: true,
        //  },
        //  {
        //    name: `B>A>C`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "B>A>C"
        //      )
        //    ),
        //    inline: true,
        //  },
        //  {
        //    name: `B>C>A`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "B>C>A"
        //      )
        //    ),
        //    inline: true,
        //  },
        //  {
        //    name: `C>A>B`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "C>A>B"
        //      )
        //    ),
        //    inline: true,
        //  },
        //  {
        //    name: `C>B>A`,
        //    value: VoteString(
        //      GetTallysFromDailyVotes(
        //        populatedDb,
        //        tournamentRoundDetails[3],
        //        "C>B>A"
        //      )
        //    ),
        //    inline: true,
        //  }
        //)
        //.setColor(0xffffff)
        //
        //.setDescription(
        //  "**Points: " + sortedPreviousDaysEntries[0].points + "**"
        //)
        //.setImage(previousWinnerPath);
        //.setTimestamp(Date.now() + 1)
        .setTitle(
          "CONGRATULATIONS, 1ST PLACE: " + tournamentRoundDetails[0][0].name + ""
        )
        .setAuthor({
          name: "Tournament Finale",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        })
        .addFields({
          name: "2nd Place: " + tournamentRoundDetails[0][1].name,
          value: "Points: " + tournamentRoundDetails[0][1].points,
          inline: true,
        })
        .addFields({
          name: "3rd Place: " + tournamentRoundDetails[0][2].name,
          value: "Previous Battle Points: " + tournamentRoundDetails[0][2].points,
          inline: true,
        })
        .setColor(0xffff00)

        .setDescription(
          "**Points: " + tournamentRoundDetails[0][0].points + "**"
        )
        .setImage(previousWinnerPath);
    }

    // const gifPath =
    //  "https://sd-dev-bot.glitch.me/commands/gif/output/" + gifName + ".gif";

    const d = new Date();
    let day = d.getDay();

    var timeUntilNextRound =
      day == 5 ? GetTimeInEpochStamp(72) : GetTimeInEpochStamp(24);

    var isATie =
      tournamentRoundDetails[0][0].points ==
      tournamentRoundDetails[0][1].points;

    var embed = new EmbedBuilder();

    if (isATie) {
      embed
        .setTitle(
          "Round " +
            tournamentRoundDetails[0][2] +
            " - Battle " +
            (parseInt(tournamentRoundDetails[0][0].battle) - 1) +
            " - TIEBREAKER"
        )
        .setAuthor({
          name: "Best VGM 2022",
          iconURL:
            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
        })
        .setColor(0xffff00)
        .addFields(
          {
            name:
              "**TODAY'S TIEBREAKER BATTLE:** Voting for this battle ends <t:" +
              timeUntilNextRound +
              ":R>",
            value: "------------------------------------", //"\u200B",
          },
          {
            name: `A. ` + tournamentRoundDetails[0][0].name,
            value: tournamentRoundDetails[0][0].link,
          },
          {
            name: `B. ` + tournamentRoundDetails[0][1].name,
            value: tournamentRoundDetails[0][1].link,
          },
          //{
          //  name: "\u200B",
          //  value: "\u200B",
          //},
          {
            name: `------------------------------------`,
            value: `After having listened to all tracks, vote for your ranked order of preference.`, //` by reacting to this post:`,
            //value: `Ranked Order for voting purposes:`,
          }
        );

      // .setThumbnail(
      //   gifPath
      //"https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016"
      // );
    } //else {
    ////.setTimestamp(Date.now() + 1)
    //embed
    //  .setTitle("Round 5 - The Final battle!")
    //  .setAuthor({
    //    name: "Best VGM 2022",
    //    iconURL:
    //      "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
    //  })
    //  .setColor(0xffff00)
    //  .addFields(
    //    {
    //      name:
    //        "**TODAY'S BATTLE:** Voting for this battle ends <t:" +
    //        timeUntilNextRound +
    //        ":R>",
    //      value: "------------------------------------", //"\u200B",
    //    },
    //    {
    //      name: `A. ` + tournamentRoundDetails[0][0].name,
    //      value: tournamentRoundDetails[0][0].link,
    //    },
    //    {
    //      name: `B. ` + tournamentRoundDetails[0][1].name,
    //      value: tournamentRoundDetails[0][1].link,
    //    },
    //    //{
    //    //  name: "\u200B",
    //    //  value: "\u200B",
    //    //},
    //    {
    //      name: `------------------------------------`,
    //      value: `After having listened to all tracks, vote for your ranked order of preference.`, //` by reacting to this post:`,
    //      //value: `Ranked Order for voting purposes:`,
    //    }
    //  )
    //
    //  .setThumbnail(
    //    //gifPath
    //    "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/The%20end.png?v=1683038915455"
    //  )
    //  .setImage(
    //    "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/round5battle1-A.png?v=1683038955855"
    //  );
    //}//

    var embedsToSend = isATie ? [embed] : [prevEmbed];

    channel
      .send({
        content: "Hello all and <@&1077345571221807244>",
        embeds: embedsToSend,
      })
      .then(channel.send(tournamentRoundDetails[0][0].link));

    //populatedDb.map((item) => {
    //  if (item.round == tournamentRoundDetails[3]) {
    //    item.votedToday = [];
    //  }
    //});

    UpdateTable(db, populatedDb);

    // if (
    //   parseInt(tournamentRoundDetails[2]) !==
    //   parseInt(tournamentRoundDetails[3])
    // ) {
    //   console.log("Moving up a round");
    //   UpdateRoundCompleted(populatedDb, tournamentRoundDetails[3]);
    // }

    //if (sortedPreviousDaysEntries.length > 0) {
    //  await CreateAndSendBattleVotesEmbed(
    //    tournamentRoundDetails[3],
    //    parseInt(tournamentRoundDetails[1][0].battle),
    //    true
    //  );

    //  await sleep(4000);
    //  if (isATie) {
    //    UpdatePreviousBattleToFalse(populatedDb, tournamentRoundDetails[2]);
    //  }
    //  UpdateTable(db, populatedDb);
    //}
  });
}


async function InsertWinnerIntoNextRound(
  poulatedDb,
  tournamentRoundDetails,
  sortedPreviousDaysEntries
) {
  console.log("THE BATTLE IS: " + tournamentRoundDetails[0][0].battle);
  var battleNumber =
    parseInt(tournamentRoundDetails[0][0].battle) < 3
      ? 1
      : Math.ceil(parseInt(tournamentRoundDetails[0][0].battle) / 3);
  var winnerEntryForNextRound = {
    name: sortedPreviousDaysEntries[0].name,
    link: sortedPreviousDaysEntries[0].link,
    battle: battleNumber,
    points: 0,
    hasTakenPlace: false,
    usersFirstPick: [],
    //usersSecondPick: [],
    //usersDidNotPlace: [],
  };
  AddWinnerToNextRound(
    poulatedDb,
    parseInt(tournamentRoundDetails[3]) + 1,
    winnerEntryForNextRound
  );
}

async function CheckAndDealWithTie() {
  var lastBattleTie = wasLastBattleTie(db, bestvgm2022awards, currentRound);
  if (lastBattleTie) {
    channel = await GetChannelByName(
      interaction.member.guild,
      process.env.TOURNAMENT_NAME
    );
    channel.messages.fetch(`messageId`).then((message) => {
      return message.embeds;
    });
  }
}

function UpdateCurrentBattleToTrue(
  populatedDb,
  round,
  numberOfContestants = 3
) {
  // Getting round info
  var entriesForRound = GetCurrentBattle(
    populatedDb,
    round,
    numberOfContestants
  );
  loop1: for (var entry of entriesForRound) {
    loop2: for (var item of populatedDb) {
      if (item.round == round) {
        loop3: for (var dbEntry of item.entries) {
          if (dbEntry.name == entry.name) {
            console.log("Looking at " + entry.name);
            if (round == 1 && dbEntry.battle == 1) {
              if (dbEntry.points == 0 && dbEntry.usersDidNotPlace.length < 1) {
                console.log("Our points!" + dbEntry.points);
                break loop1;
              }
            }
            dbEntry.hasTakenPlace = true;
            console.log(
              "Changed " +
                dbEntry.name +
                " to ran\nEntry set to: " +
                dbEntry.hasTakenPlace
            );
          }
        }
      }
    }
  }
  //console.log(
  //  "--------------\n" +
  //    JSON.stringify(populatedDb.find((item) => item.round == round).entries) +
  //    "\n--------------"
  //);
}

function UpdatePreviousBattleToFalse(populatedDb, round) {
  // Getting round info
  var entriesForRound = GetPreviousBattle(populatedDb, round);
  loop1: for (var entry of entriesForRound) {
    loop2: for (var item of populatedDb) {
      if (item.round == round) {
        item.votedToday = [];
        loop3: for (var dbEntry of item.entries) {
          if (dbEntry.name == entry.name) {
            console.log("Looking at " + entry.name);
            if (round == 1 && dbEntry.battle == 1) {
              if (dbEntry.points == 0 && dbEntry.usersDidNotPlace.length < 1) {
                console.log("Our points!" + dbEntry.points);
                break loop1;
              }
            }
            dbEntry.hasTakenPlace = false;
            console.log(
              "Changed " +
                dbEntry.name +
                " to ran\nEntry set to: " +
                dbEntry.hasTakenPlace
            );
          }
        }
      }
    }
  }
  console.log(
    "--------------\n" +
      JSON.stringify(populatedDb.find((item) => item.round == round).entries) +
      "\n--------------"
  );
}

function GetCurrentBattle(populatedDb, round, numberOfTracks = 3) {
  var round = populatedDb.find((item) => item.round == round);
  var entries = round.entries;

  var allEntries = [];
  //entries.forEach(function (entry) {
  for (var i = 0; i < entries.length; i++) {
    allEntries.push({
      name: entries[i].name,
      link: entries[i].link,
      battle: entries[i].battle,
      points: entries[i].points,
      hasTakenPlace: entries[i].hasTakenPlace,
      users1: entries[i].users1,
      users2: entries[i].users2,
      users3: entries[i].users3,
    });
  }

  var currentContestants = [];

  for (var i = 0; i < allEntries.length; i += parseInt(numberOfTracks)) {
    if (allEntries[i].hasTakenPlace == false) {
      currentContestants.push(allEntries[i]);
      currentContestants.push(allEntries[i + 1]);
      //if (round < 4) {
      // currentContestants.push(allEntries[i + 2]);
      // }
      break;
    }
  }
  console.log("Completed GetCurrentBattle: " + currentContestants[0]);
  return currentContestants;
}

function GetPreviousBattle(populatedDb, round, numberOfTracks = 3) {
  var round = populatedDb.find((item) => item.round == round);
  var entries = round.entries;

  var allEntries = [];
  //entries.forEach(function (entry) {
  for (var i = 0; i < entries.length; i++) {
    allEntries.push({
      name: entries[i].name,
      link: entries[i].link,
      battle: entries[i].battle,
      points: entries[i].points,
      hasTakenPlace: entries[i].hasTakenPlace,
      users1: entries[i].users1,
      users2: entries[i].users2,
      users3: entries[i].users3,
    });
  }

  var currentContestants = [];

  for (var i = 0; i < allEntries.length; i += parseInt(numberOfTracks)) {
    if (allEntries[i].hasTakenPlace == false) {
      currentContestants.push(allEntries[i - 3]);
      currentContestants.push(allEntries[i - 2]);
      currentContestants.push(allEntries[i - 1]);
      break;
    }
  }
  console.log("Completed GetCurrentBattle: " + currentContestants[0]);
  return currentContestants;
}

function UpdateRoundCompleted(populatedDb, round) {
  for (var item of populatedDb) {
    if (item.round == round) {
      console.log("Set round " + item.round + " to false");
      item.isCurrentRound = false;
    }
    if (item.round == parseInt(round) + 1) {
      console.log("Set round " + item.round + " to true");
      item.isCurrentRound = true;
    }
  }
}

function AddWinnerToNextRound(populatedDb, round, assignment) {
  populatedDb.map((item) => {
    if (item.round == round) {
      item.entries.push(assignment);
    }
  });
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
    .get("sd-contest-bot")
    .find({ isCurrentRound: true })
    .value();

  if (currentRound) {
    votedTodayCollection = currentRound.votedToday;
  }

  return votedTodayCollection;
}
