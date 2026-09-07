/**
 * The closing stages of a finished tournament: who reached the quarter-finals
 * and what happened from there.
 *
 * Pure data, shared by /tournament-bracket and /tournament-results so the two
 * can never disagree about who won. Builds on trackHistory.js, which already
 * works out which match decided a contest and which was the third-place
 * playoff.
 */

const {
  isPublicMatch,
  IsTournamentRunning,
  GetTournamentStructure,
  matchWinner,
  normaliseTitle,
} = require("./trackHistory.js");
const {
  matchEntrantList,
  GetTournamentEntriesNewestFirst,
} = require("../utils/compatibilityStore.js");

/**
 * Whether a tournament has finished and may be shown.
 *
 * Deliberately strict: anything that is not a finished or abandoned match keeps
 * the tournament out, so a state nobody has invented yet cannot leak a live
 * result. The currently running contest is excluded by name as well. Both of
 * those are IsTournamentRunning's job, so that /tournament-results and
 * /tournament-track-history cannot come to different views of whether a contest
 * is over.
 */
function IsTournamentFinished(tournament, tournamentName, currentTournament) {
  if (!tournament || !Array.isArray(tournament.matches)) return false;
  if (!tournament.matches.some(isPublicMatch)) return false;
  return !IsTournamentRunning(tournament, tournamentName, currentTournament);
}

/** Finished tournaments, newest first, ready for a picker. */
function GetFinishedTournaments(tournamentRoot) {
  const current = tournamentRoot?.currentTournament;
  return GetTournamentEntriesNewestFirst(tournamentRoot).filter(({ name, data }) =>
    IsTournamentFinished(data, name, current)
  );
}

function describeEntrant(entrant, winner) {
  return {
    name: entrant.name,
    title: entrant.title || "",
    link: entrant.link || "",
    videoId: entrant.videoId || "",
    points: Number(entrant.points) || 0,
    won: winner ? entrant === winner : null,
  };
}

function describeMatch(match) {
  const entrants = matchEntrantList(match);
  const winner = matchWinner(entrants);
  const sorted = entrants
    .slice()
    .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
  return {
    match: Number(match.match),
    round: Number(match.round),
    entrants: sorted.map((e) => describeEntrant(e, winner)),
    // null when the match was tied, so callers report a tie rather than a win
    winner: winner ? describeEntrant(winner, winner) : null,
    margin:
      sorted.length > 1
        ? (Number(sorted[0].points) || 0) - (Number(sorted[1].points) || 0)
        : 0,
  };
}

/**
 * The last rounds of a tournament, from the quarter-finals to the winner.
 *
 * Stages are only included when the bracket genuinely has them -- most of these
 * contests ran byes and tie replays, so quarter- and semi-finals are named only
 * where exactly the right number of matches qualify. A contest with no
 * identifiable quarter-finals still returns its final.
 */
function BuildFinalsSummary(tournament) {
  if (!tournament) return null;
  const { complete, decidingMatch, thirdPlaceMatches, stages } =
    GetTournamentStructure(tournament);
  if (!complete.length) return null;

  const byStage = { "Quarter-final": [], "Semi-final": [] };
  let final = null;
  const thirdPlace = [];

  for (const match of complete) {
    const number = Number(match.match);
    if (number === decidingMatch) {
      final = describeMatch(match);
      continue;
    }
    if (thirdPlaceMatches.has(number)) {
      thirdPlace.push(describeMatch(match));
      continue;
    }
    const stage = stages.get(number);
    if (stage) byStage[stage].push(describeMatch(match));
  }

  const order = (list) => list.sort((a, b) => a.match - b.match);
  const rounds = [];
  if (byStage["Quarter-final"].length) {
    rounds.push({ stage: "Quarter-finals", matches: order(byStage["Quarter-final"]) });
  }
  if (byStage["Semi-final"].length) {
    rounds.push({ stage: "Semi-finals", matches: order(byStage["Semi-final"]) });
  }
  if (final) rounds.push({ stage: "Final", matches: [final] });
  if (thirdPlace.length) {
    rounds.push({ stage: "Third-place match", matches: order(thirdPlace) });
  }

  const entrants = new Set();
  let votes = 0;
  for (const match of complete) {
    for (const entrant of matchEntrantList(match)) {
      entrants.add(normaliseTitle(entrant.name) + "|" + normaliseTitle(entrant.title));
      votes += Number(entrant.points) || 0;
    }
  }

  return {
    rounds,
    final,
    thirdPlace: thirdPlace[0] || null,
    podium: buildPodium(final, thirdPlace[0]),
    entrants: entrants.size,
    matches: complete.length,
    votes,
    lastMatchAt: tournament.lastMatchAt || null,
    format: tournament.tournamentFormat || "",
  };
}

/** Top four, as far as the contest actually decided it. */
function buildPodium(final, thirdPlace) {
  const podium = { winner: null, runnerUp: null, third: null, fourth: null };
  if (final && final.winner) {
    podium.winner = final.entrants.find((e) => e.won === true) || null;
    podium.runnerUp = final.entrants.find((e) => e.won !== true) || null;
  }
  if (thirdPlace && thirdPlace.winner) {
    podium.third = thirdPlace.entrants.find((e) => e.won === true) || null;
    podium.fourth = thirdPlace.entrants.find((e) => e.won !== true) || null;
  }
  return podium;
}

if (typeof module !== "undefined") {
  module.exports = {
    IsTournamentFinished,
    GetFinishedTournaments,
    BuildFinalsSummary,
  };
}
