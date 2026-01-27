const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

eval(fs.readFileSync("./public/main.js") + "");

const userImagesDir = path.join(
  __dirname,
  "..",
  "..",
  "commands",
  "gif",
  "userImages"
);

function normalizeTournamentNameForArt(name) {
  if (!name) {
    return "tournament";
  }
  return replaceSpacesWithUnderlines(name.replace(/-/g, " ")).toLowerCase();
}

function buildMatchArtFilename(tournamentName, round, match, ext) {
  const safeName = normalizeTournamentNameForArt(tournamentName);
  return `${safeName}-round${round}match${match}${ext}`;
}

function getAttachmentExtension(attachment) {
  const fromName = path.extname(attachment?.name || "");
  if (fromName) {
    return fromName.toLowerCase();
  }
  const contentType = attachment?.contentType || "";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("webp")) return ".webp";
  return ".png";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-match-art")
    .setDescription("Upload artwork to be used in a match embed.")
    .addIntegerOption((option) =>
      option
        .setName("match-number")
        .setDescription("Match number to attach artwork to.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("artist-name")
        .setDescription("Name to show in the footer.")
        .setRequired(true)
    )
    .addAttachmentOption((option) =>
      option
        .setName("image")
        .setDescription("Image to use for the match.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const matchNumber = interaction.options.getInteger("match-number");
    const artistName = interaction.options.getString("artist-name");
    const attachment = interaction.options.getAttachment("image");

    const db = GetDb();
    await db.read();
    const currentTournamentName = await getCurrentTournament(db);
    const tournamentDetails = await db.get("tournaments").nth(0).value();
    if (!tournamentDetails || currentTournamentName === "N/A") {
      return interaction.reply({
        content:
          "There doesn't appear to be a tournament running at this time.",
        ephemeral: true,
      });
    }
    const tournament = tournamentDetails[currentTournamentName];

    let matchRound = null;
    const matchEntry = tournament.matches?.find(
      (match) => match.match === matchNumber
    );
    if (matchEntry?.round) {
      matchRound = matchEntry.round;
    } else {
      for (const roundKey of Object.keys(tournament.rounds || {})) {
        const entries = tournament.rounds?.[roundKey] || [];
        if (entries.some((entry) => entry.match === matchNumber)) {
          matchRound = roundKey;
          break;
        }
      }
    }

    if (!matchRound) {
      matchRound = 0;
    }

    const extension = getAttachmentExtension(attachment);
    const filename = buildMatchArtFilename(
      currentTournamentName,
      matchRound,
      matchNumber,
      extension
    );
    const destinationPath = path.join(userImagesDir, filename);

    await fs.promises.mkdir(userImagesDir, { recursive: true });
    const response = await fetch(attachment.url);
    if (!response.ok) {
      return interaction.reply({
        content: "Failed to download the image. Please try again.",
        ephemeral: true,
      });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(destinationPath, buffer);

    if (!tournament.matchArt) {
      tournament.matchArt = {};
    }
    tournament.matchArt[matchNumber.toString()] = {
      username: artistName,
      filename,
    };

    await db
      .get("tournaments")
      .nth(0)
      .assign({
        [currentTournamentName]: tournament,
      })
      .write();

    return interaction.reply({
      content: `Artwork saved for Match ${matchNumber}.`,
      ephemeral: true,
    });
  },
};
