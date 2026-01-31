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

function isDomoAdmin(interaction, tournamentRoot) {
  const requesterId = interaction.user.id;
  const isOwner = interaction.guild.ownerId === requesterId;
  const admins = Array.isArray(tournamentRoot.admin)
    ? tournamentRoot.admin
    : [];
  const adminRoles = Array.isArray(tournamentRoot.adminRoles)
    ? tournamentRoot.adminRoles
    : [];
  const isDbAdmin = admins.includes(requesterId);
  const memberRoles = interaction.member?.roles?.cache;
  const hasAdminRole =
    memberRoles && adminRoles.some((roleId) => memberRoles.has(roleId));
  return isOwner || isDbAdmin || hasAdminRole;
}

function parseScheduleTime(input) {
  const trimmed = String(input || "").trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

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

async function promptTimeConfirmation(interaction, initialTime) {
  let selectedTime = initialTime;
  const selectId = "set-tournament-time-select";
  const confirmId = "set-tournament-time-confirm";
  const cancelId = "set-tournament-time-cancel";

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
        await i.update({
          embeds: [buildTimeConfirmationEmbed(selectedTime)],
          components: [],
        });
        finish({ status: "confirm", time: selectedTime });
        return;
      }
      if (i.customId === cancelId) {
        collector.stop("cancel");
        await i.update({
          content: "Tournament time update cancelled.",
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-set-match-time")
    .setDescription("Set the daily tournament post time (UTC, hourly). Confirmation with timezones will be prompted. ")
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("Time in UTC (hourly). Example: 19:00")
        .setRequired(true)
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
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.guild) {
      return interaction.editReply("This command can only be used in a server.");
    }

    const timeInput = interaction.options.getString("time");
    const normalizedTime = parseScheduleTime(timeInput);
    if (!normalizedTime) {
      return interaction.editReply(
        "Invalid time. Choose a UTC hourly option (e.g., 19:00)."
      );
    }

    const db = GetDb();
    await db.read();
    const tournamentRoot = ensureTournamentRoot(db);

    if (!isDomoAdmin(interaction, tournamentRoot)) {
      return interaction.editReply(
        "Only the server owner or Domo Admins can use this command."
      );
    }

    const confirmation = await promptTimeConfirmation(
      interaction,
      normalizedTime
    );
    if (confirmation.status !== "confirm") {
      if (confirmation.status === "timeout") {
        return interaction.editReply(
          "Tournament time update timed out. Please run the command again."
        );
      }
      return;
    }

    await db
      .get("tournaments")
      .nth(0)
      .assign({ tournamentPostTime: confirmation.time })
      .write();

    const schedule = ResetTournamentSchedule();
    const nextEpoch = GetNextTournamentScheduleEpoch();

    return interaction.editReply(
      `Tournament post time updated. Next scheduled run: <t:${nextEpoch}:F> ` +
        `(<t:${nextEpoch}:R>). Weekends: ${
          schedule.includeWeekends ? "enabled" : "disabled"
        }.`
    );
  },
};
