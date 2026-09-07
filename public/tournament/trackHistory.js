/**
 * Reading a track's tournament history back out of the database.
 *
 * Pure data: no Discord, no canvas, no network. Everything here works off the
 * tournament root so it can be exercised directly against a db.json.
 */

const fs = require("fs");

// matchEntrantList / matchVoteKind read every entrant slot and tell a ranked
// ballot from a flat one, which matters because contests ran 3- and 4-way
// battles alongside head-to-head.
const {
  matchEntrantList,
  matchVoteKind,
  GetTournamentEntriesNewestFirst,
} = require("../utils/compatibilityStore.js");

/** Case- and punctuation-insensitive key for matching a track to itself. */
function normaliseTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A track's identity. Keyed on the game as well as the title, because plenty of
 * entries share a name -- "Main Theme" alone matches Spiritfarer, Streets of
 * Rage 4 and a dozen others, and keying on the title by itself splices their
 * separate runs into one impossible progression.
 */
function trackKey(entrant) {
  return normaliseTitle(entrant?.name) + "|" + normaliseTitle(entrant?.title);
}

/** Same game, allowing for one write-up being more complete than the other. */
function sameGame(candidate, wanted) {
  if (wanted === null || wanted === undefined) return true;
  const a = normaliseTitle(candidate);
  const b = normaliseTitle(wanted);
  if (!a || !b) return a === b;
  return a === b || a.includes(b) || b.includes(a);
}

function entrantPoints(entrant) {
  const points = Number(entrant?.points);
  return Number.isFinite(points) ? points : 0;
}

/**
 * Who won a match, by points. Returns null on a tie or an unscored match so
 * callers can report "undecided" rather than inventing a winner.
 */
function matchWinner(entrants) {
  if (entrants.length < 2) return null;
  let best = null;
  let tied = false;
  for (const entrant of entrants) {
    const points = entrantPoints(entrant);
    if (!best || points > entrantPoints(best)) {
      best = entrant;
      tied = false;
    } else if (points === entrantPoints(best)) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * Every distinct track that ever entered a tournament, with the tournaments it
 * appeared in. Built once and searched repeatedly, so the fuzzy search never
 * has to walk the matches again.
 */
function BuildTrackIndex(tournamentRoot) {
  const byKey = new Map();

  for (const { name: tournamentName, data } of GetTournamentEntriesNewestFirst(
    tournamentRoot
  )) {
    for (const match of data.matches || []) {
      for (const entrant of matchEntrantList(match)) {
        if (!normaliseTitle(entrant.name)) continue;
        const key = trackKey(entrant);

        let record = byKey.get(key);
        if (!record) {
          record = {
            key,
            name: entrant.name,
            title: entrant.title || "",
            link: entrant.link || "",
            videoId: entrant.videoId || "",
            tags: Array.isArray(entrant.tags) ? entrant.tags.slice() : [],
            tournaments: [],
          };
          byKey.set(key, record);
        }
        // Later tournaments often carry better metadata than the archive
        // imports, so fill any gaps as we go rather than trusting first sight.
        if (!record.title && entrant.title) record.title = entrant.title;
        if (!record.link && entrant.link) record.link = entrant.link;
        if (!record.videoId && entrant.videoId) record.videoId = entrant.videoId;
        if (!record.tags.length && Array.isArray(entrant.tags)) {
          record.tags = entrant.tags.slice();
        }
        if (!record.tournaments.includes(tournamentName)) {
          record.tournaments.push(tournamentName);
        }
      }
    }
  }

  return mergeRestatedGames(Array.from(byKey.values()));
}

/**
 * Fold together entries that are the same track written up differently --
 * "Spiral of Erebos" filed under both "Trails of Cold Steel III" and "The
 * Legend of Heroes: Trails of Cold Steel III". Only merges when one game string
 * contains the other, which catches the restatements without touching the
 * genuinely distinct songs that happen to share a name ("Main Theme" belongs to
 * five different games and must stay five entries). The longer, more specific
 * game string wins.
 */
function mergeRestatedGames(records) {
  const byName = new Map();
  for (const record of records) {
    const name = normaliseTitle(record.name);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(record);
  }

  const merged = [];
  for (const group of byName.values()) {
    const kept = [];
    for (const record of group) {
      const host = kept.find((other) => {
        const a = normaliseTitle(other.title);
        const b = normaliseTitle(record.title);
        return a && b && (a.includes(b) || b.includes(a));
      });
      if (!host) {
        kept.push(record);
        continue;
      }
      if (record.title.length > host.title.length) host.title = record.title;
      if (!host.link) host.link = record.link;
      if (!host.videoId) host.videoId = record.videoId;
      if (!host.tags.length) host.tags = record.tags;
      for (const tournament of record.tournaments) {
        if (!host.tournaments.includes(tournament)) {
          host.tournaments.push(tournament);
        }
      }
    }
    merged.push(...kept);
  }
  return merged;
}

/**
 * A track's run through one tournament: every match it appeared in, in order,
 * with who it beat and by how much.
 */
function BuildTrackProgression(tournament, track) {
  // accepts either an index record ({ name, title }) or a bare name, in which
  // case any game matches -- fine for a unique title, ambiguous for "Main Theme"
  const wantName = normaliseTitle(typeof track === "string" ? track : track?.name);
  const wantTitle =
    typeof track === "string" ? null : normaliseTitle(track?.title);
  const rounds = [];

  const matches = (tournament?.matches || [])
    .filter((match) => match && match.progress === "complete")
    .sort(
      (a, b) => Number(a.round) - Number(b.round) || Number(a.match) - Number(b.match)
    );

  for (const match of matches) {
    const entrants = matchEntrantList(match);
    const self = entrants.find(
      (e) => normaliseTitle(e.name) === wantName && sameGame(e.title, wantTitle)
    );
    if (!self) continue;

    const winner = matchWinner(entrants);
    const opponents = entrants.filter((e) => e !== self);
    const runnerUp = opponents
      .slice()
      .sort((a, b) => entrantPoints(b) - entrantPoints(a))[0];

    rounds.push({
      round: Number(match.round),
      match: Number(match.match),
      voteKind: matchVoteKind(match),
      isThirdPlace: match.isThirdPlace === true,
      bracket: match.bracket || "",
      self: {
        name: self.name,
        title: self.title || "",
        points: entrantPoints(self),
        videoId: self.videoId || "",
      },
      opponents: opponents.map((e) => ({
        name: e.name,
        title: e.title || "",
        points: entrantPoints(e),
        videoId: e.videoId || "",
        beaten: winner === self,
      })),
      // null when the match was tied or unscored
      won: winner ? winner === self : null,
      // how comfortable it was: the gap to the nearest rival, either way
      margin: runnerUp ? entrantPoints(self) - entrantPoints(runnerUp) : 0,
      totalVotes: entrants.reduce((sum, e) => sum + entrantPoints(e), 0),
    });
  }

  return rounds;
}

/**
 * Headline numbers for one track in one tournament: how far it got, what it
 * won, and where it finished.
 */
function SummariseTrackRun(tournament, track) {
  const progression = BuildTrackProgression(tournament, track);
  if (!progression.length) return null;

  const wins = progression.filter((r) => r.won === true).length;
  const losses = progression.filter((r) => r.won === false).length;
  const last = progression[progression.length - 1];
  const decided = (tournament.matches || []).filter(
    (m) => m && m.progress === "complete" && !m.isThirdPlace
  );
  const finalRound = Math.max(...decided.map((m) => Number(m.round)), 0);
  // The last round can hold more than one match: 2023 ran the final and the
  // 3rd-place playoff side by side in round 5, and neither carried the
  // isThirdPlace flag. The deciding match is the highest-numbered one, so
  // losing the other is fourth place rather than runner-up.
  const decidingMatch = Math.max(...decided.map((m) => Number(m.match)), 0);
  // Double elimination keeps beaten tracks alive in a losers bracket, so the
  // rounds no longer count down to the final and "quarter-final" stops meaning
  // anything. Say which bracket instead.
  const isDoubleElim = (tournament.matches || []).some(
    (m) => m && m.bracket === "losersBracket"
  );

  return {
    progression,
    wins,
    losses,
    matches: progression.length,
    totalVotes: progression.reduce((sum, r) => sum + r.self.points, 0),
    bestMargin: progression.reduce(
      (best, r) => (r.won === true && r.margin > best ? r.margin : best),
      0
    ),
    finishedAt: last.round,
    finalRound,
    // Won its last match in the deciding round and it was not the third-place
    // playoff -- that is the tournament winner.
    decidingMatch,
    isDoubleElim,
    isChampion: last.won === true && last.match === decidingMatch,
    placement: describePlacement(last, finalRound, decidingMatch, isDoubleElim),
  };
}

function describePlacement(last, finalRound, decidingMatch, isDoubleElim) {
  if (last.isThirdPlace) {
    return last.won === true ? "3rd place" : "4th place";
  }
  if (last.match === decidingMatch) {
    return last.won === true ? "Winner" : "Runner-up";
  }
  // reached the closing round but not the deciding match: a placement playoff
  if (last.round === finalRound) {
    return last.won === true ? "3rd place" : "4th place";
  }
  if (isDoubleElim) {
    return last.bracket === "losersBracket"
      ? `Losers bracket, R${last.round}`
      : `Winners bracket, R${last.round}`;
  }
  const from = finalRound - last.round;
  if (from === 1) return "Semi-finals";
  if (from === 2) return "Quarter-finals";
  return `Round ${last.round} of ${finalRound}`;
}

if (typeof module !== "undefined") {
  module.exports = {
    BuildTrackIndex,
    BuildTrackProgression,
    SummariseTrackRun,
    normaliseTitle,
    trackKey,
  };
}
