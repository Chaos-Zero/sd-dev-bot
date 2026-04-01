const { AttachmentBuilder } = require("discord.js");
const { Client, ButtonBuilder, EmbedBuilder } = require("discord.js");
const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

const fs = require("fs");
const path = require("path");
const sleep = require("util").promisify(setTimeout);

const image = new AttachmentBuilder(
  "http://91.99.239.6/files/assets/domodayoff.jpg"
);
//let oneOffJoke = new cron.CronJob("00 30 17 * * *", () => {
//"25 32 00 * * 1-6"
//  CreateAprilFools();
//});
//oneOffJoke.start();

async function CreateAprilFools(bot = "") {
  const botToUse = bot || GetBot();
  const guildObject = await botToUse.guilds.cache.get(process.env.GUILD_ID);
  const channel = await GetChannelByName(guildObject, "best-vgm-2025-awards");
  console.log(channel);

  var prevEmbed = new EmbedBuilder();
  function VoteString(num) {
    return num == 1 ? num + " vote" : num + " votes";
  }

  var embed1 = new EmbedBuilder()
    //.setTimestamp(Date.now() + 1)
    .setTitle("Round -2 - Metacritic bloodbath")
    .setAuthor({
      name: "Best VGM Twenty Fiveten Awards",
      iconURL:
        "http://91.99.239.6/files/assets/sd_logo.png",
    })
    .setColor(0xffff00)
    //.setDescription(
    //"\n**TODAY'S BATTLE:** Vote by tomorrow, 1:00 PM EST, in x hours"
    //)
    .addFields(
      {
        //name: "\u200B",
        name:
          "**Voting for this match ends <t:" +
          GetTimeInEpochStamp(-0) +
          ":R>**\n*Ah, you just missed it :(. \nPretty sure you missed it last year too!*",

        value: "------------------------------------", //"\u200B",
      },
      {
        name: `A. No Mind Seye - Even Sean Murray Couldn't Fix This One`,
        value: "https://youtu.be/iJZmoern_GQ?si=sh3t60FlLpXOyigU",
      },
      {
        name: `B. TamaNotchi ZZZZZzzzz.. - Should have stayed in the keychain`,
        value: "https://youtu.be/aoVaAutNJPM?si=2IklL7LBYxsNP6IX",
      },
      //{
      //  name: "\u200B",
      //  value: "\u200B",
      //},
      {
        name: "------------------------------------\nTournament Links",
        value:
          "[Daily Playlist](https://youtu.be/eioYulMp_5k?si=DTXuGyUnnZyTEnO3) | [Tournament Bracket](https://challonge.com/ji7dvn9c)",
        inline: false,
      }
      //{
      //  name: `...1️⃣...`,
      //  value: `A>B>C`,
      //  inline: true,
      //},
      //{
      //  name: `...2️⃣...`,
      //  value: `A>C>B     `,
      //  inline: true,
      //},
      //{
      //  name: `...3️⃣...`,
      //  value: `B>A>C `,
      //  inline: true,
      //},
      //{
      //  name: `...4️⃣...`,
      //  value: `B>C>A`,
      //  inline: true,
      //},
      //{
      //  name: `...5️⃣...`,
      //  value: `C>A>B`,
      //  inline: true,
      //},
      //{
      //  name: `...6️⃣...`,
      //  value: `C>B>A`,
      //  inline: true,
      //}
    )
    .setFooter({
      text: "There's something I'm supposed to say here, but I'm on holiday. Figure it out yourself.",
      iconURL:
        "http://91.99.239.6/files/assets/sd-img.png",
    })
    //  .setTitle(`${title1}`)
    //.setDescription("Blah blah")
    .setThumbnail(
      "http://91.99.239.6/files/assets/match1.gif"
      //"http://91.99.239.6/files/assets/sd-img.png"
    );

  embed1.setURL("https://imgur.com/a/sEcrnVT");

  var embed2 = new EmbedBuilder()
    //.setTimestamp(Date.now() + 1)
    .setTitle("Round 2 - This match will show on your credit card under another name")
    .setAuthor({
      name: "Best VGM 2025? Awards?",
      iconURL:
        "http://91.99.239.6/files/assets/sd_logo.png",
    })
    .setColor(0xffff00)
    //.setDescription(
    //"\n**TODAY'S BATTLE:** Vote by tomorrow, 1:00 PM EST, in x hours"
    //)
    .addFields(
      {
        //name: "\u200B",
        name:
          "**You can send a post card to the following freepost date:  <t:" +
          GetTimeInEpochStamp(-954547200) +
          ":R>**",
        value: "------------------------------------", //"\u200B",
      },
      {
        name: `A. Persona 5 XXX - Too Hot for Consoles`,
        value: "https://youtu.be/ILID_psR_sA?si=FhDWEN9inmzMuO54",
      },
      {
        name: `B. Assassass Creed: Assdows - Same cheeks, same ol' shit`,
        value: "https://youtu.be/Z5LGFg6iiAU?si=ZxVJASrK-w3XPNKj",
      },
      //{
      //  name: "\u200B",
      //  value: "\u200B",
      //},
      {
        name: "------------------------------------\nTournament Links",
        value:
          "[Daily Playlist](https://youtu.be/eioYulMp_5k?si=DTXuGyUnnZyTEnO3) | [Tournament Bracket](https://challonge.com/ji7dvn9c)",
        inline: false,
      }
    )
    .setFooter({
      text: "Listen to the traaaaaaaaaaaaaaaaaaaaaaaaaAAAAAARRRRRRGGGGHHHHhhhhhaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaacks.",
      iconURL:
        "http://91.99.239.6/files/assets/domo_smarty_pants_face.png",
      //{
      //  name: `...1️⃣...`,
      //  value: `A>B>C`,
      //  inline: true,
      //},
      //{
      //  name: `...2️⃣...`,
      //  value: `A>C>B     `,
      //  inline: true,
      //},
      //{
      //  name: `...3️⃣...`,
      //  value: `B>A>C `,
      //  inline: true,
      //},
      //{
      //  name: `...4️⃣...`,
      //  value: `B>C>A`,
      //  inline: true,
      //},
      //{
      //  name: `...5️⃣...`,
      //  value: `C>A>B`,
      //  inline: true,
      //},
      //{
      //  name: `...6️⃣...`,
      //  value: `C>B>A`,
      //  inline: true,
      //}
    })
    //  .setTitle(`${title1}`)
    //.setDescription("Blah blah")
    .setThumbnail(
      "http://91.99.239.6/files/assets/match2.gif"
      //"http://91.99.239.6/files/assets/sd-img.png"
    );

  embed2.setURL("https://imgur.com/a/sEcrnVT");

  var resultsEmbed = new EmbedBuilder()
    .setTitle("Results? What results? I ain't sayin' nothin'!")
    .setAuthor({
      name: "Best VGM 20025 Awards",
      iconURL: "http://91.99.239.6/files/assets/sd_logo.png",
    })
    .setColor(0xffffff)
    .setDescription("**No results today.**");

  channel.send({ embeds: [resultsEmbed] });
  await sleep(1500);

  channel.send({
    content:
      "Hello all and jabronis, I'm taking a mental health day, so no results",
    files: [image],
  });
  await sleep(1500);

  channel
    .send({
      content:
        "**Fine. I'll at least send the matches...**",
      embeds: [embed1],
    })
    .then((embedMessage) => {
      var buttonVotes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId(`fool-1`).setLabel("A").setStyle("4")
        )
        .addComponents(
          new ButtonBuilder().setCustomId(`fool-2`).setLabel("B").setStyle("1")
        );
      embedMessage.edit({
        components: [buttonVotes],
      });
    });

  await sleep(1500);

  channel.send({ embeds: [embed2] }).then((embedMessage) => {
    var buttonVotes = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId(`fool-1`).setLabel("A").setStyle("4")
      )
      .addComponents(
        new ButtonBuilder().setCustomId(`fool-2`).setLabel("B").setStyle("1")
      );
    embedMessage.edit({
      components: [buttonVotes],
    });
  });
}
