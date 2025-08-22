const { AttachmentBuilder } = require("discord.js");
const { Client, ButtonBuilder, EmbedBuilder } = require("discord.js");
const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

const fs = require("fs");
const path = require("path");
const sleep = require("util").promisify(setTimeout);

const image = new AttachmentBuilder(
  "https://cdn.glitch.global/ad38934a-3e73-4549-80e0-2d0f6d56c5c0/All%20ties.png?v=1743436129639"
);
//let oneOffJoke = new cron.CronJob("00 30 17 * * *", () => {
//"25 32 00 * * 1-6"
//  CreateAprilFools();
//});
//oneOffJoke.start();

async function CreateAprilFools() {
  const guildObject = await bot.guilds.cache.get(process.env.GUILD_ID);
  const channel = await GetChannelByName(guildObject, "best-vgm-2024-awards");
  console.log(channel);

  var prevEmbed = new EmbedBuilder();
  function VoteString(num) {
    return num == 1 ? num + " vote" : num + " votes";
  }

  var embed1 = new EmbedBuilder()
    //.setTimestamp(Date.now() + 1)
    .setTitle("Round ツ゚ - Match Iron Fist")
    .setAuthor({
      name: "Best VGM Twenty Exty Five Awards",
      iconURL:
        "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
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
          ":R>**\n*Ah, you just missed it :(*",

        value: "------------------------------------", //"\u200B",
      },
      {
        name: `A. Dragon Ball ~~Sparking~~ **GOKU** - Kakarot Cha La`,
        value: "https://youtu.be/DwUOPLwEFrQ?si=eTi7kgQC_FBidrTw",
      },
      {
        name: `B. Tekken 8 the Coolaid - Heihachi Mishima is Dead. Like, dead for real this time. No really. He's DEAD.`,
        value: "https://youtu.be/aNgq_80QnJk?si=dCpgq4N6SmVuJDA1",
      },
      //{
      //  name: "\u200B",
      //  value: "\u200B",
      //},
      {
        name: "------------------------------------\nTournament Links",
        value:
          "[Tournament Bracket](https://challonge.com/ji7dvn9c) - [Tournament Playlist](https://youtu.be/dQw4w9WgXcQ?si=HdLZxmQ05u-iwOtj)",
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
      text: "Please listen to both tracks. Or else. No refunds.",
      iconURL:
        "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Domo%20Smarty%20pants%20face.png?v=1691064432062",
    })
    //  .setTitle(`${title1}`)
    //.setDescription("Blah blah")
    .setThumbnail(
      "https://cdn.glitch.global/ad38934a-3e73-4549-80e0-2d0f6d56c5c0/dbt.gif?v=1743495021201"
      //"https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016"
    );

  embed1.setURL("https://imgur.com/a/sEcrnVT");

  var embed2 = new EmbedBuilder()
    //.setTimestamp(Date.now() + 1)
    .setTitle("Round ऽ - Nobody blink! - FIGHT!")
    .setAuthor({
      name: "Best VGM 2025? Awards?",
      iconURL:
        "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
    })
    .setColor(0xffff00)
    //.setDescription(
    //"\n**TODAY'S BATTLE:** Vote by tomorrow, 1:00 PM EST, in x hours"
    //)
    .addFields(
      {
        //name: "\u200B",
        name:
          "**Voting for this thingamajig ends <t:" +
          GetTimeInEpochStamp(-954547200) +
          ":R>**",
        value: "------------------------------------", //"\u200B",
      },
      {
        name: `A. Mild Bastards - Get the door, love. It's Chamomile tea for sevensies`,
        value: "https://youtu.be/SckcB099zrg?si=nw-b7ltkhFdkcTTy",
      },
      {
        name: `B. Indika-AAAHHH-WTF-WHAT? - You can't lie to a nun. We gotta go in and visit the Penguin.`,
        value: "https://youtu.be/JcCcj1fPn7k?si=5Ci3oKJJ3utEAnSY",
      },
      //{
      //  name: "\u200B",
      //  value: "\u200B",
      //},
      {
        name: "------------------------------------\nTournament Links",
        value:
          "[Tournament Bracket](https://challonge.com/ji7dvn9c) - [Tournament Playlist](https://youtu.be/dQw4w9WgXcQ?si=HdLZxmQ05u-iwOtj)",
        inline: false,
      }
    )
    .setFooter({
      text: "After having listened to all tracks, please mind the gap when alighting from this train.",
      iconURL:
        "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Domo%20Smarty%20pants%20face.png?v=1691064432062",
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
      "https://cdn.glitch.global/ad38934a-3e73-4549-80e0-2d0f6d56c5c0/mba.gif?v=1743495021819"
      //"https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016"
    );

  embed2.setURL("https://imgur.com/a/sEcrnVT");

  var embedsToSend = [embed1];
  channel.send({
    content:
      "Hello all and <@&1326256775262896290>...wait, wut\n❗ It appears we have nothing but tie matches all the way down! ❗",
    files: [image],
  });
  await sleep(1500);
  channel
    .send({
      content:
        "**How could you let this happen?! Match 1 to 100. Every single one!**",
      embeds: embedsToSend,
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
  var embedsToSend2 = [embed2];
  channel.send({ embeds: embedsToSend2 }).then((embedMessage) => {
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
