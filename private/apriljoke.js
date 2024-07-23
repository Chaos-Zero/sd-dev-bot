  let oneOffJoke = new cron.CronJob("00 30 17 * * *", () => {
  //"25 32 00 * * 1-6"
  CreateAprilFools();
});
  //oneOffJoke.start();


async function CreateAprilFools() {
  const guildObject = await bot.guilds.cache.get(process.env.GUILD_ID);
  const channel = await GetChannelByName(guildObject, "best-vgm-2022-awards");
  console.log(channel);

  var prevEmbed = new EmbedBuilder();
  function VoteString(num) {
    return num == 1 ? num + " vote" : num + " votes";
  }

  prevEmbed
    //.setTimestamp(Date.now() + 1)
    .setTitle(
      "1st Place: Pokemen Arse R' Us Leadbends - Them words that did scroll"
    )
    .setAuthor({
      name: "Previous Battle Winner, but not really",
      iconURL:
        "https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/SD%20Logo.png?v=1676855711752",
    })
    .addFields(
      {
        name: "2nd Place: Elden Ring - Stop lying, you never made it this far",
        value: "Points: 419",
        inline: true,
      },
      {
        name: "3rd Place: Triga-rd - Reams from Ant Wod",
        value: "Points: 421 or something, you count",
        inline: true,
      },
      {
        name: "Votes B-B-B-**Breakdown**",
        value:
          "Tally's for votes cast in a parallel universe where I'm 100 steps ahead of you",
        inline: false,
      },
      {
        name: `A>B>C`,
        value: "1-2-3 votes",

        inline: true,
      },
      {
        name: `A>C>B`,
        value: "-8 votes",

        inline: true,
      },
      {
        name: `B>A>C`,
        value: "Enough votes",

        inline: true,
      },
      {
        name: `B>C>A`,
        value: "π vote(s?)",

        inline: true,
      },
      {
        name: `C>A>B`,
        value: "Very high: 5! votes",

        inline: true,
      },
      {
        name: `C>B>A`,
        value: "69, HAHA!",

        inline: true,
      }
    )
    .setColor(0xffffff)

    .setDescription("**Points: 420**")
    .setImage(
      "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/leg-ends.png?v=1680300998469"
    );

  var embed = new EmbedBuilder()
    //.setTimestamp(Date.now() + 1)
    .setTitle("Round 1 - FIGHT!")
    .setAuthor({
      name: "Best VGM 20XX",
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
          "**TODAY'S BATTLE:** Voting for this battle ends <t:" +
          GetTimeInEpochStamp(-168) +
          ":R>",
        value: "------------------------------------", //"\u200B",
      },
      {
        name: `A. Stray - Les crevettes sont très riches`,
        value: "https://youtu.be/Tol7m6zw5p8",
      },
      {
        name: `B. Salt and Sacrifice - Sodium Chloride`,
        value: "https://youtu.be/xIarrG9ZO4I",
      },
      {
        name: `C. Ghostwire: Tokyo - Watashi wa Gaijin, desu`,
        value: "https://youtu.be/21cu7o9Bmak",
      },
      //{
      //  name: "\u200B",
      //  value: "\u200B",
      //},
      {
        name: `------------------------------------`,
        value: `After having listened to all tracks, we truly feel sorry for you.`, //` by reacting to this post:`,
        //value: `Ranked Order for voting purposes:`,
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
    //  .setTitle(`${title1}`)
    //.setDescription("Blah blah")
    .setThumbnail(
      "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/ezgif-2-0ac122cbbb.gif?v=1680305306845"
      //"https://cdn.glitch.global/485febab-53bf-46f2-9ec1-a3c597dfaebe/sd-img.jpeg?v=1676586931016"
    );
  var embedsToSend = [prevEmbed, embed];
  channel
    .send({
      content: "Hello all and <@828707504363274261>",
      embeds: embedsToSend,
    })
    .then((embedMessage) => {
      var aButtonVotes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`fool-1`)
            .setLabel("A>B>C")
            .setStyle("4")
        )
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`fool-2`)
            .setLabel("A>C>B")
            .setStyle("4")
        );

      var bButtonVotes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`fool-3`)
            .setLabel("B>A>C")
            .setStyle("1")
        )
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`fool-4`)
            .setLabel("B>C>A")
            .setStyle("1")
        );
      var cButtonVotes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`fool-5`)
            .setLabel("C>A>B")
            .setStyle("3")
        )
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`fool-6`)
            .setLabel("C>B>A")
            .setStyle("3")
        );

      embedMessage.edit({
        components: [aButtonVotes, bButtonVotes, cButtonVotes],
      });
    });
}
