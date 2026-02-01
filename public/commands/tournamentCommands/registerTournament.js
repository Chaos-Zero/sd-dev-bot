const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");

const fs = require("fs");

eval(fs.readFileSync("./public/main.js") + "");
fs.readFileSync("./public/tournament/tournamentFunctions.js") + "";

const loadingEmbed = new EmbedBuilder().setImage(
  "http://91.99.239.6/files/assets/Domo_load.gif"
);

function formatOffsetTime(time, offsetMinutes) {
  const [hour, minute] = time.split(":").map((part) => Number(part));
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return time;
  }
  const baseMinutes = hour * 60 + minute;
  const adjusted = (baseMinutes + offsetMinutes + 1440) % 1440;
  const adjustedHour = Math.floor(adjusted / 60);
  const adjustedMinute = adjusted % 60;
  return `${String(adjustedHour).padStart(2, "0")}:${String(adjustedMinute).padStart(2, "0")}`;
}

function buildTimeConfirmationEmbed(time) {
  const lines = [
    `**UTC (selected):** ${time}`,
    `**AEST (UTC+10):** ${formatOffsetTime(time, 600)}`,
    `**EST (UTC-5):** ${formatOffsetTime(time, -300)}`,
    `**PST (UTC-8):** ${formatOffsetTime(time, -480)}`,
    `**ASEAN (UTC+7):** ${formatOffsetTime(time, 420)}`,
    `**GMT (UTC+0):** ${formatOffsetTime(time, 0)}`,
    "",
    "_Offsets are fixed; DST is not applied._",
  ];

  return new EmbedBuilder()
    .setTitle("Confirm Tournament Post Time")
    .setColor(0x8e44ad)
    .setDescription(lines.join("\n"));
}

function buildTimeSelectRow(customId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Reselect a UTC time")
      .addOptions(
        Array.from({ length: 24 }, (_, hour) => {
          const value = `${String(hour).padStart(2, "0")}:00`;
          return { label: value, value };
        })
      )
  );
}

function buildTimeActionRow(confirmId, cancelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel("Confirm Time")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildChallongeUrlName(name) {
  return name.replace(/-/g, " ").replace(/ /g, "_");
}

async function promptTimeConfirmation(interaction, initialTime) {
  let selectedTime = initialTime;
  const selectId = "register-tournament-time-select";
  const confirmId = "register-tournament-time-confirm";
  const cancelId = "register-tournament-time-cancel";

  const embed = buildTimeConfirmationEmbed(selectedTime);
  const selectRow = buildTimeSelectRow(selectId);
  const actionRow = buildTimeActionRow(confirmId, cancelId);
  const message = await interaction.editReply({
    embeds: [embed],
    components: [selectRow, actionRow],
  });

  return await new Promise((resolve) => {
    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };
    const collector = message.createMessageComponentCollector({
      time: 60000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({
          content: "Only the command user can confirm this time.",
          ephemeral: true,
        });
        return;
      }
      if (i.isStringSelectMenu() && i.customId === selectId) {
        selectedTime = i.values?.[0] || selectedTime;
        await i.update({
          embeds: [buildTimeConfirmationEmbed(selectedTime)],
          components: [selectRow, actionRow],
        });
        return;
      }
      if (i.customId === confirmId) {
        collector.stop("confirm");
        await i.deferUpdate();
        finish({ status: "confirm", time: selectedTime });
        return;
      }
      if (i.customId === cancelId) {
        collector.stop("cancel");
        await i.update({
          content: "Tournament registration cancelled.",
          embeds: [],
          components: [],
        });
        finish({ status: "cancel" });
      }
    });

    collector.on("end", (_collected, reason) => {
      if (reason === "time") {
        finish({ status: "timeout" });
      }
    });
  });
}

function formatDuration(ms) {
  if (!ms || ms < 0) {
    return "unknown";
  }
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getNextScheduledUtcTime(time, includeWeekends) {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const now = new Date();
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  const candidate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      0,
      0
    )
  );

  let date = candidate;
  if (date <= now) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }
  if (!includeWeekends) {
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
      date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    }
  }
  return date;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-register")
    .setDescription("Register a new tournament using a CSV file.")
    .addStringOption((option) =>
      option
        .setName("tournament-name")
        .setDescription("Name of the tournament")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("tournament-format")
        .setDescription("Format of the tournament")
        .setRequired(true)
        .addChoices(
          { name: "Single Elimination", value: "Single Elimination" },
          { name: "Double Elimination", value: "Double Elimination" },
          { name: "3v3 Ranked", value: "3v3 Ranked" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("matches-per-day")
        .setDescription("The ammount of matches run at any given time")
        .setRequired(true)
        .addChoices(
          { name: "One", value: "1" },
          { name: "Two", value: "2" },
          { name: "Four", value: "4" }
        )
    )
    .addAttachmentOption((option) =>
      option
        .setName("csv-file")
        .setDescription(
          "CSV with columns: Name, Title, Link (Type optional). Extra columns ignored."
        )
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel where matches/results will be posted.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("post-time")
        .setDescription("Daily posting time in UTC (hourly). Default 19:00.")
        .setRequired(false)
        .addChoices(
          { name: "00:00", value: "00:00" },
          { name: "01:00", value: "01:00" },
          { name: "02:00", value: "02:00" },
          { name: "03:00", value: "03:00" },
          { name: "04:00", value: "04:00" },
          { name: "05:00", value: "05:00" },
          { name: "06:00", value: "06:00" },
          { name: "07:00", value: "07:00" },
          { name: "08:00", value: "08:00" },
          { name: "09:00", value: "09:00" },
          { name: "10:00", value: "10:00" },
          { name: "11:00", value: "11:00" },
          { name: "12:00", value: "12:00" },
          { name: "13:00", value: "13:00" },
          { name: "14:00", value: "14:00" },
          { name: "15:00", value: "15:00" },
          { name: "16:00", value: "16:00" },
          { name: "17:00", value: "17:00" },
          { name: "18:00", value: "18:00" },
          { name: "19:00", value: "19:00" },
          { name: "20:00", value: "20:00" },
          { name: "21:00", value: "21:00" },
          { name: "22:00", value: "22:00" },
          { name: "23:00", value: "23:00" }
        )
    )
    .addBooleanOption((option) =>
      option
        .setName("include-weekends")
        .setDescription("Post matches on Saturday and Sunday.")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("randomise-tournament")
        .setDescription("Randomise the order for the player matches.")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("create-challonge-bracket")
        .setDescription("Creates a challonge bracket.")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("set-challonge-hidden")
        .setDescription(
          "Has entries on challonge hidden in first round until match."
        )
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("participant-role")
        .setDescription("Role to ping for match updates).")
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const tournamentName = interaction.options.getString("tournament-name");
    const tournamentFormat = interaction.options.getString("tournament-format");
    const matchesPerDay = interaction.options.getString("matches-per-day");
    const postTimeInput = interaction.options.getString("post-time");
    const includeWeekendsOption =
      interaction.options.getBoolean("include-weekends");
    const isRandom =
      interaction.options.getBoolean("randomise-tournament") || false;
    const isChallonge =
      interaction.options.getBoolean("create-challonge-bracket") || false;
    const isHiddenBracketOption =
      interaction.options.getBoolean("set-challonge-hidden");
    const isHiddenBracket = isHiddenBracketOption ?? true;
    const csvAttachment = interaction.options.getAttachment("csv-file");
    const tournamentChannel = interaction.options.getChannel("channel");
    const participantRole = interaction.options.getRole("participant-role");
    const participantRoleId = participantRole?.id || "";
    const tournamentChannelId = tournamentChannel?.id || "";
    const tournamentChannelName = tournamentChannel?.name || "";

    const dbInstance = GetDb();
    await dbInstance.read();
    const tournamentRoot = ensureTournamentRoot(dbInstance);
    const tournamentDetails = dbInstance.get("tournaments").nth(0).value();
    if (tournamentDetails?.[tournamentName]) {
      await interaction.editReply({
        content:
          `A tournament named "${tournamentName}" already exists. ` +
          "Please use a different name.",
      });
      return;
    }

    const attachment = csvAttachment?.url;
    console.log(attachment);
    if (attachment && attachment.toLowerCase().includes(".csv")) {
      if (!tournamentChannelId) {
        await interaction.editReply(
          "Please provide a valid channel for tournament matches."
        );
        return;
      }
      let currentTournament = dbInstance
        .get("tournaments[0].currentTournament")
        .value();
      if (!currentTournament) {
        currentTournament = "N/A";
        dbInstance
          .get("tournaments")
          .nth(0)
          .assign({ currentTournament })
          .write();
      }

      if (currentTournament === "N/A") {
        let selectedPostTime = null;
        if (postTimeInput) {
          const confirmation = await promptTimeConfirmation(
            interaction,
            normalizeScheduleTime(postTimeInput)
          );
          if (confirmation.status !== "confirm") {
            if (confirmation.status === "timeout") {
              await interaction.editReply(
                "Tournament registration timed out. Please try again."
              );
            }
            return;
          }
          selectedPostTime = confirmation.time;
        }

        await interaction.editReply({
          content: "Setting up tournament...",
          embeds: [loadingEmbed],
          components: [],
        });

        const scheduleUpdates = {};
        if (selectedPostTime) {
          scheduleUpdates.tournamentPostTime = selectedPostTime;
        }
        if (
          includeWeekendsOption !== null &&
          includeWeekendsOption !== undefined
        ) {
          scheduleUpdates.tournamentIncludeWeekends = includeWeekendsOption;
        }
        if (Object.keys(scheduleUpdates).length > 0) {
          await dbInstance
            .get("tournaments")
            .nth(0)
            .assign(scheduleUpdates)
            .write();
          ResetTournamentSchedule();
        }
        const result = await registerTournament(
          tournamentName,
          tournamentFormat,
          isRandom,
          isChallonge,
          isHiddenBracket,
          attachment,
          parseInt(matchesPerDay),
          participantRoleId,
          tournamentChannelId,
          tournamentChannelName
        );
        if (!result?.ok) {
          await interaction.editReply({
            content:
              result?.message ||
              "Tournament setup failed. Please check the CSV and try again.",
            embeds: [],
            components: [],
          });
          return;
        }
        const refreshedRoot = await dbInstance
          .get("tournaments")
          .nth(0)
          .value();
        const scheduleTime =
          refreshedRoot?.tournamentPostTime || "19:00";
        const includeWeekends =
          refreshedRoot?.tournamentIncludeWeekends === true;
        const nextStartTime = getNextScheduledUtcTime(
          scheduleTime,
          includeWeekends
        );
        const nextEpoch = nextStartTime
          ? Math.floor(nextStartTime.getTime() / 1000)
          : null;

        const summaryLines = [
          `**Tournament:** ${tournamentName}`,
          `**Format:** ${tournamentFormat}`,
          `**Matches per day:** ${matchesPerDay}`,
          `**Randomised:** ${isRandom ? "yes" : "no"}`,
          `**Challonge:** ${isChallonge ? "enabled" : "disabled"}`,
          ...(isChallonge
            ? [
                `**Challonge bracket:** https://challonge.com/${buildChallongeUrlName(
                  tournamentName
                )}`,
                `**Hidden Challonge bracket:** ${isHiddenBracket ? "yes" : "no"}`,
              ]
            : []),
          `**Participant role:** ${
            participantRoleId ? `<@&${participantRoleId}>` : "none"
          }`,
          `**Match channel:** ${
            tournamentChannelId ? `<#${tournamentChannelId}>` : "unknown"
          }`,
          `**Weekends:** ${includeWeekends ? "enabled" : "disabled"}`,
          `**Next scheduled match:** ${
            nextEpoch ? `<t:${nextEpoch}:F> (<t:${nextEpoch}:R>)` : "unknown"
          }`,
        ];

        await interaction.editReply({
          content: "Tournament created successfully.",
          embeds: [
            new EmbedBuilder()
              .setTitle("Tournament Setup Summary")
              .setColor(0x8e44ad)
              .setDescription(summaryLines.join("\n")),
          ],
        });
      } else {
        await interaction.editReply(
          `There appears to already be a tournament running. Please wait until "${currentTournament}" is complete.`
        );
      }
    } else {
      await interaction.editReply(
        "Sorry, the CSV file attachment is missing or invalid. Please try again."
      );
    }
  },
};
