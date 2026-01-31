const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const sleep = require("util").promisify(setTimeout);

eval(fs.readFileSync("./public/main.js") + "");
eval(fs.readFileSync("./public/tournament/tournamentFunctions.js") + "");

function parseRoundValue(value) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function dedupeMatches(matches) {
  const seen = new Map();
  for (const match of matches) {
    if (!match || match.match == null) {
      continue;
    }
    const key = `${parseRoundValue(match.round)}-${match.match}`;
    if (!seen.has(key)) {
      seen.set(key, match);
    }
  }
  return Array.from(seen.values());
}

function getActiveMatches(matches) {
  if (!Array.isArray(matches)) {
    return [];
  }
  return matches.filter((match) => match?.progress !== "complete");
}

function getResultsRound(matches, minActiveRound) {
  if (!Array.isArray(matches) || !Number.isFinite(minActiveRound)) {
    return null;
  }
  const completedRounds = matches
    .filter((match) => match?.progress === "complete")
    .map((match) => parseRoundValue(match.round))
    .filter((round) => round > 0 && round <= minActiveRound);
  if (completedRounds.length === 0) {
    return null;
  }
  return Math.max(...completedRounds);
}

function sortMatchesByRoundAndNumber(matches) {
  return [...matches].sort((a, b) => {
    const roundA = parseRoundValue(a?.round);
    const roundB = parseRoundValue(b?.round);
    if (roundA !== roundB) {
      return roundA - roundB;
    }
    const matchA = parseInt(a?.match, 10);
    const matchB = parseInt(b?.match, 10);
    if (Number.isNaN(matchA) || Number.isNaN(matchB)) {
      return 0;
    }
    return matchA - matchB;
  });
}

function buildSingleResults(matches) {
  const results = [];
  for (const match of matches) {
    const entrant1 = match?.entrant1;
    const entrant2 = match?.entrant2;
    if (!entrant1 || !entrant2) {
      continue;
    }
    const points1 = parseInt(entrant1.points || 0, 10);
    const points2 = parseInt(entrant2.points || 0, 10);
    if (points1 === points2) {
      continue;
    }
    const winner = points1 > points2 ? entrant1 : entrant2;
    const loser = points1 > points2 ? entrant2 : entrant1;
    const winnerVoteLetter = points1 > points2 ? "A" : "B";
    const loserVoteLetter = points1 > points2 ? "B" : "A";
    results.push({
      round: match.round,
      match: match.match,
      isThirdPlace: match.isThirdPlace,
      firstPlace: {
        name: winner.name,
        title: winner.title,
        link: winner.link,
        type: winner.type,
        challongeSeed: winner.challongeSeed,
        challongeParticipantId: winner.challongeParticipantId,
        voters: winner.voters || [],
        points: winner.points || 0,
        voteLetter: winnerVoteLetter,
      },
      secondPlace: {
        name: loser.name,
        title: loser.title,
        link: loser.link,
        type: loser.type,
        challongeSeed: loser.challongeSeed,
        challongeParticipantId: loser.challongeParticipantId,
        voters: loser.voters || [],
        points: loser.points || 0,
        voteLetter: loserVoteLetter,
      },
    });
  }
  return results;
}

function buildDoubleResults(matches) {
  const results = [];
  for (const match of matches) {
    const entrant1 = match?.entrant1;
    const entrant2 = match?.entrant2;
    if (!entrant1 || !entrant2) {
      continue;
    }
    const points1 = parseInt(entrant1.points || 0, 10);
    const points2 = parseInt(entrant2.points || 0, 10);
    if (points1 === points2) {
      continue;
    }
    const winner = points1 > points2 ? entrant1 : entrant2;
    const loser = points1 > points2 ? entrant2 : entrant1;
    results.push({
      round: match.round,
      match: match.match,
      bracket: match.bracket || match.braket || "",
      winner: {
        name: winner.name,
        title: winner.title,
        link: winner.link,
        voters: winner.voters || [],
        points: winner.points || 0,
      },
      loser: {
        name: loser.name,
        title: loser.title,
        link: loser.link,
        voters: loser.voters || [],
        points: loser.points || 0,
      },
    });
  }
  return results;
}

function buildTripleResults(matches) {
  const results = [];
  for (const match of matches) {
    const entrants = [match?.entrant1, match?.entrant2, match?.entrant3].filter(
      Boolean
    );
    if (entrants.length < 1) {
      continue;
    }
    let winner = entrants[0];
    for (const entrant of entrants) {
      const currentPoints = parseInt(entrant?.points || 0, 10);
      const winnerPoints = parseInt(winner?.points || 0, 10);
      if (currentPoints > winnerPoints) {
        winner = entrant;
      }
    }
    results.push({
      round: match.round,
      match: match.match,
      firstPlace: {
        name: winner.name,
        title: winner.title,
        link: winner.link,
        voters: winner.voters || [],
        points: winner.points || 0,
      },
    });
  }
  return results;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament-resend-matches")
    .setDescription(
      "Resend the currently active matches without changing tournament state."
    )
    .addBooleanOption((option) =>
      option
        .setName("include-results")
        .setDescription("Resend the previous results embeds.")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("include-logs")
        .setDescription("Resend the previous log embeds.")
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const includeResults =
      interaction.options.getBoolean("include-results") === true;
    const includeLogs =
      interaction.options.getBoolean("include-logs") === true;

    const db = GetDb();
    await db.read();
    const currentTournamentName = await getCurrentTournament(db);
    const tournamentDetails = await db.get("tournaments").nth(0).value();
    if (!tournamentDetails || currentTournamentName === "N/A") {
      return interaction.editReply(
        "There doesn't appear to be a tournament running at this time."
      );
    }
    const tournamentDb = tournamentDetails[currentTournamentName];
    if (!tournamentDb) {
      return interaction.editReply(
        "Could not find the current tournament in the database."
      );
    }

    let activeMatches = dedupeMatches(getActiveMatches(tournamentDb.matches));
    if (activeMatches.length === 0) {
      return interaction.editReply("There are no active matches to resend.");
    }
    const tieMatches = activeMatches.filter(
      (match) => match?.progress === "tie"
    );
    const previousMatchesForWarning = [[], tieMatches];

    const minActiveRound = Math.min(
      ...activeMatches.map((match) => parseRoundValue(match.round))
    );
    const resultsRound =
      includeResults || includeLogs
        ? getResultsRound(tournamentDb.matches, minActiveRound)
        : null;
    const resultsMatches =
      resultsRound != null
        ? sortMatchesByRoundAndNumber(
            tournamentDb.matches.filter(
              (match) =>
                match?.progress === "complete" &&
                parseRoundValue(match.round) === resultsRound
            )
          )
        : [];

    if ((includeResults || includeLogs) && resultsMatches.length > 0) {
      if (tournamentDb.tournamentFormat === "Single Elimination") {
        const results = buildSingleResults(resultsMatches);
        if (results.length > 0) {
          await SendPreviousSingleDayResultsEmbeds(
            interaction.guild,
            [results, []],
            resultsMatches[0],
            true,
            {
              includeResults,
              includeLogs,
              advanceWinners: false,
              allowCompletion: false,
            }
          );
        }
      } else if (tournamentDb.tournamentFormat === "Double Elimination") {
        const results = buildDoubleResults(resultsMatches);
        if (results.length > 0) {
          await SendPreviousDayResultsEmbeds(
            interaction.guild,
            [results],
            resultsMatches[0],
            {
              includeResults,
              includeLogs,
            }
          );
        }
      } else if (tournamentDb.tournamentFormat === "3v3 Ranked") {
        const results = buildTripleResults(resultsMatches);
        if (results.length > 0) {
          await SendPreviousTripleDayResultsEmbeds(
            interaction.guild,
            [results],
            resultsMatches[0],
            {
              includeResults,
              includeLogs,
              advanceWinners: false,
            }
          );
        }
      }
    }

    let orderedMatches = [];
    if (tournamentDb.tournamentFormat === "Single Elimination") {
      const tieMatches = activeMatches.filter(
        (match) => match?.progress === "tie"
      );
      const nonTieMatches = activeMatches.filter(
        (match) => match?.progress !== "tie"
      );
      orderedMatches = [
        ...sortMatchesByRoundAndNumber(tieMatches),
        ...sortMatchesByRoundAndNumber(nonTieMatches),
      ];
    } else {
      orderedMatches = sortMatchesByRoundAndNumber(activeMatches);
    }

    for (let i = 0; i < orderedMatches.length; i++) {
      const match = orderedMatches[i];
      const secondOfDay = i > 0;
      if (tournamentDb.tournamentFormat === "Single Elimination") {
        await SendSingleBattleMessage(
          interaction,
          match,
          "",
          tournamentDb,
          secondOfDay,
          previousMatchesForWarning,
          {
            skipPreviousResults: true,
            skipChallongeUpdates: true,
            isTieResend: match?.progress === "tie",
          }
        );
      } else if (tournamentDb.tournamentFormat === "Double Elimination") {
        await SendDoubleElimBattleMessage(
          interaction,
          match,
          "",
          secondOfDay,
          previousMatchesForWarning,
          { skipPreviousResults: true }
        );
      } else if (tournamentDb.tournamentFormat === "3v3 Ranked") {
        await SendTripleBattleMessage(
          interaction,
          match,
          "",
          tournamentDb,
          secondOfDay,
          previousMatchesForWarning,
          { skipPreviousResults: true }
        );
      }

      if (i < orderedMatches.length - 1) {
        await sleep(15000);
      }
    }

    let response = `Resent ${orderedMatches.length} match`;
    response += orderedMatches.length === 1 ? "." : "es.";
    if ((includeResults || includeLogs) && resultsMatches.length === 0) {
      response += " No completed matches found to resend results/logs.";
    }
    return interaction.editReply(response);
  },
};
