//var buttonEmbed = new EmbedBuilder()
//.setTimestamp(Date.now() + 1)
//.setTitle("Round 1 - Battle 4")
//.setAuthor({
//  name: "Best VGM 2022",
//  iconURL:
//    "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/Kurby%20FINAL.png?v=1676930836792",
//})
//.setColor("0xffff00")
//.setDescription(
//  "Hello all and <@&${1077345905742708856}>,\n\n\n**TODAY'S BATTLE:** Vote for your ranked order of preference by reacting to this post\n"
//)
//.addFields(
//  {
//    name: `A. Sephonie - Poured sunrise, hearts revealed`,
//    value: `https://youtu.be/F1kkeoSRy0s`,
//  },
//  {
//    name: `B. Xenoblade Chronicles 3 - Where We Belong`,
//    value: `https://youtu.be/3OSlUabG_e0`,
//  },
//  {
//    name: `C. Harvestella - Our Souls Touch`,
//    value: `https://youtu.be/OTa4ixCbm_k`,
//  }
//)
////  .setTitle(`${title1}`)
////.setDescription("Blah blah")
//.setThumbnail(
//  "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752"
//)
////.setImage(gifPath)
//.setFooter({
//  text: "Time left to vote: ",
//  //GetBallImage(pokemonEntry.EvoBall).img
//  iconURL:
//    "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016",
//});

//var aButtonVotes = new ActionRowBuilder()
//  .addComponents(
//    new ButtonBuilder().setCustomId("a1").setLabel("A>B>C").setStyle("4")
//  )
//  .addComponents(
//    new ButtonBuilder().setCustomId("a2").setLabel("A>C>B").setStyle("4")
//  );
//
//var bButtonVotes = new ActionRowBuilder()
//  .addComponents(
//    new ButtonBuilder().setCustomId("b1").setLabel("B>A>C").setStyle("1")
//  )
//  .addComponents(
//    new ButtonBuilder().setCustomId("b2").setLabel("B>A>C").setStyle("1")
//  );
//var cButtonVotes = new ActionRowBuilder()
//  .addComponents(
//    new ButtonBuilder().setCustomId("c1").setLabel("C>A>B").setStyle("3")
//  )
//  .addComponents(
//    new ButtonBuilder().setCustomId("c2").setLabel("C>A>B").setStyle("3")
//  );
//
//var line1 = new ActionRowBuilder()
//  .addComponents(
//    new ButtonBuilder().setCustomId("a1").setLabel("A>B>C").setStyle("4")
//  )
//  .addComponents(
//    new ButtonBuilder().setCustomId("a2").setLabel("A>C>B").setStyle("4")
//  )
//  .addComponents(
//    new ButtonBuilder().setCustomId("b1").setLabel("B>A>C").setStyle("1")
//  )
//  .addComponents(
//    new ButtonBuilder().setCustomId("b2").setLabel("B>A>C").setStyle("1")
//  )
//  .addComponents(
//    new ButtonBuilder().setCustomId("c1").setLabel("C>A>B").setStyle("3")
//  );
//var line2 = new ActionRowBuilder().addComponents(
//  new ButtonBuilder().setCustomId("c2").setLabel("C>A>B").setStyle("3")
//);

 //console.log(gifPath);
    //const row = new ActionRowBuilder().addComponents(
    //  new StringSelectMenuBuilder()
    //    .setCustomId("previous-results")
    //    .setPlaceholder(
    //      "Previous Winner: " +
    //        tournamentRoundDetails[1][parseInt(previousWinner)].name
    //    )
    //    .addOptions([
    //      {
    //        label: tournamentRoundDetails[1][0].name,
    //        description: Object.values(previousDaysPoints[0])[0] + ` points`,
    //        value: "1",
    //        default: false,
    //      },
    //      {
    //        label: tournamentRoundDetails[1][1].name,
    //        description: Object.values(previousDaysPoints[0])[1] + ` points`,
    //        value: "2",
    //        default: false,
    //      },
    //      {
    //        label: tournamentRoundDetails[1][2].name,
    //        description: Object.values(previousDaysPoints[0])[2] + ` points`,
    //        value: "3",
    //        default: false,
    //      },
    //    ])
    //);


//    if (isATie) {
//      prevEmbed
//        .setAuthor({
//          name: "Previous Battle Update",
//          iconURL:
//            "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
//        })
//        .setTitle(
//          ":warning: The previous battle has resulted in a draw! :warning:"
//        )
//        .setDescription(
//          "Please reconsider your votes for our previous round if you have voted for third place.\n" +
//            "The two songs in contention are:\n" +
//            sortedEntries[0].name +
//            " with " +
//            sortedEntries[0].points +
//            " points\nand\n" +
//            sortedEntries[1].name +
//            " with " +
//            sortedEntries[1].points +
//            " points." +
//            "\nThe Previous round has had a further 24 hours added. Thank you for your cooperation.\n" +
//            "-The SupraDarky Team"
//        );
//    } else {