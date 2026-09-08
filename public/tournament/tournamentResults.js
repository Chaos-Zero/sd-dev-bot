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

/**
 * Whether a user backed this entrant. Reads both ballot shapes, since a ranked
 * ballot stores its voters as {first, second} rather than a flat array.
 */
function didVoteFor(entrant, userId) {
  if (!userId) return false;
  const voters = entrant?.voters;
  if (Array.isArray(voters)) return voters.includes(userId);
  if (voters && typeof voters === "object") {
    const first = Array.isArray(voters.first) ? voters.first : [];
    const second = Array.isArray(voters.second) ? voters.second : [];
    return first.includes(userId) || second.includes(userId);
  }
  return false;
}

function describeEntrant(entrant, winner, userId) {
  return {
    name: entrant.name,
    title: entrant.title || "",
    link: entrant.link || "",
    videoId: entrant.videoId || "",
    points: Number(entrant.points) || 0,
    won: winner ? entrant === winner : null,
    youVoted: didVoteFor(entrant, userId),
  };
}

function describeMatch(match, userId) {
  const entrants = matchEntrantList(match);
  const winner = matchWinner(entrants);
  const sorted = entrants
    .slice()
    .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
  return {
    match: Number(match.match),
    round: Number(match.round),
    entrants: sorted.map((e) => describeEntrant(e, winner, userId)),
    // null when the match was tied, so callers report a tie rather than a win
    winner: winner ? describeEntrant(winner, winner, userId) : null,
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
function BuildFinalsSummary(tournament, userId) {
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
      final = describeMatch(match, userId);
      continue;
    }
    if (thirdPlaceMatches.has(number)) {
      thirdPlace.push(describeMatch(match, userId));
      continue;
    }
    const stage = stages.get(number);
    if (stage) byStage[stage].push(describeMatch(match, userId));
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

/**
 * The bracket as a tree, walked backwards from the final: each match's children
 * are the matches its contestants played immediately before it.
 *
 * `maxDepth` of 2 gives the closing rounds (final, semis, quarters); Infinity
 * gives the whole contest. The same walk that names the stages, just run to
 * exhaustion, so the two views cannot disagree about the shape.
 *
 * `seedMatch` starts the walk somewhere other than the final -- give it a
 * track's last match and the tree becomes that track's own side of the draw,
 * which for a first-round exit is the single match it played.
 *
 * Byes fall out naturally -- a track that arrived without playing simply
 * contributes no child. Tie replays and dead branches can leave matches off the
 * tree entirely, so the count of those is returned rather than quietly dropped.
 */
function BuildBracketTree(tournament, maxDepth, seedMatch, userId) {
  const limit = maxDepth === undefined ? Infinity : maxDepth;
  const { complete, decidingMatch } = GetTournamentStructure(tournament);
  const seed = seedMatch === undefined ? decidingMatch : seedMatch;
  const final = complete.find((m) => Number(m.match) === seed);
  if (!final) return null;

  const ordered = complete
    .slice()
    .sort(
      (a, b) => Number(a.round) - Number(b.round) || Number(a.match) - Number(b.match)
    );
  const byTrack = new Map();
  for (const match of ordered) {
    for (const entrant of matchEntrantList(match)) {
      const key = entrantKey(entrant);
      if (!byTrack.has(key)) byTrack.set(key, []);
      byTrack.get(key).push(match);
    }
  }

  const used = new Set([Number(final.match)]);
  const build = (match, depth) => {
    const node = { match: describeMatch(match, userId), children: [], depth };
    if (depth >= limit) return node;
    for (const entrant of matchEntrantList(match)) {
      const played = byTrack.get(entrantKey(entrant)) || [];
      const index = played.indexOf(match);
      const previous = index > 0 ? played[index - 1] : null;
      if (!previous) continue;
      const number = Number(previous.match);
      if (used.has(number)) continue;
      used.add(number);
      node.children.push(build(previous, depth + 1));
    }
    return node;
  };

  const root = build(final, 0);
  return {
    root,
    // matches that never feed the final: byes, replays, abandoned branches
    unreached: complete.filter((m) => !used.has(Number(m.match))).length,
  };
}

function entrantKey(entrant) {
  return (
    normaliseTitle(entrant?.name) + "|" + normaliseTitle(entrant?.title)
  );
}

/**
 * One track's run drawn as a bracket: the matches it played, latest on the
 * right, each carrying the opponent it faced.
 *
 * Follows only the queried track rather than every contestant. Walking back
 * through everyone would pull in the opposite half of the draw -- a champion's
 * tree becomes the whole contest, which is what /tournament-history already
 * shows. Here the question is how far this song went, so its own path is the
 * subject and the opponents are the boxes it beat along the way.
 *
 * A first-round exit therefore yields a single match, and a champion yields one
 * box per round.
 */
function BuildTrackBracketTree(tournament, progression, userId) {
  if (!Array.isArray(progression) || !progression.length) return null;

  const ordered = progression.slice();
  let node = null;
  // built from the earliest match forward, so each becomes the child of the next
  for (const round of ordered) {
    const match = (tournament.matches || []).find(
      (m) => isPublicMatch(m) && Number(m.match) === Number(round.match)
    );
    if (!match) continue;
    const described = describeMatch(match, userId);
    node = { match: described, children: node ? [node] : [], depth: 0 };
  }
  if (!node) return null;

  // depth is measured from the last match, which sits on the right
  const setDepth = (n, depth) => {
    n.depth = depth;
    for (const child of n.children) setDepth(child, depth + 1);
  };
  setDepth(node, 0);

  return { root: node, unreached: 0 };
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
    BuildBracketTree,
    BuildTrackBracketTree,
  };
}
