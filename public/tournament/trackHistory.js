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
 * How many of this track's matches the given user voted for it in. Reads both
 * ballot shapes, since a ranked ballot stores voters as {first, second} rather
 * than a flat array. Returns 0 for someone who never backed it -- including
 * someone who voted in the tournament but always for the other side.
 */
function CountUserVotesForTrack(tournament, track, userId) {
  if (!userId) return 0;
  const wantName = normaliseTitle(typeof track === "string" ? track : track?.name);
  const wantTitle =
    typeof track === "string" ? null : normaliseTitle(track?.title);

  let voted = 0;
  for (const match of tournament?.matches || []) {
    if (!match || match.progress !== "complete") continue;
    const self = matchEntrantList(match).find(
      (e) => normaliseTitle(e.name) === wantName && sameGame(e.title, wantTitle)
    );
    if (!self) continue;

    const voters = self.voters;
    if (Array.isArray(voters)) {
      if (voters.includes(userId)) voted++;
    } else if (voters && typeof voters === "object") {
      const first = Array.isArray(voters.first) ? voters.first : [];
      const second = Array.isArray(voters.second) ? voters.second : [];
      if (first.includes(userId) || second.includes(userId)) voted++;
    }
  }
  return voted;
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
  const complete = (tournament.matches || []).filter(
    (m) => m && m.progress === "complete"
  );
  const decided = complete.filter((m) => !m.isThirdPlace);
  const finalRound = Math.max(...decided.map((m) => Number(m.round)), 0);

  // The deciding match has to be found within the final round, not by taking
  // the highest match number overall: match numbers are not ordered by
  // progression. The Forest tournament's final is round 4 match 29 while match
  // 31 sits back in round 3, so a global maximum picked a semi-final and left
  // the contest with no winner at all.
  const finalRoundMatches = decided.filter(
    (m) => Number(m.round) === finalRound
  );
  const decidingMatch = Math.max(
    ...finalRoundMatches.map((m) => Number(m.match)),
    0
  );

  // Third-place playoffs come in two shapes: flagged outright (2025 runs one in
  // round 7, before the final), or sitting unflagged alongside the final as the
  // second match of the closing round (2023, 2024, 2020, SupraDarky). Where the
  // closing round holds three or more matches it is tie replays rather than a
  // playoff, so nothing is assumed.
  const thirdPlaceMatches = new Set(
    complete.filter((m) => m.isThirdPlace).map((m) => Number(m.match))
  );
  if (finalRoundMatches.length === 2) {
    for (const m of finalRoundMatches) {
      if (Number(m.match) !== decidingMatch) thirdPlaceMatches.add(Number(m.match));
    }
  }
  // Double elimination keeps beaten tracks alive in a losers bracket, so the
  // rounds no longer count down to the final and "quarter-final" stops meaning
  // anything. Say which bracket instead.
  const isDoubleElim = (tournament.matches || []).some(
    (m) => m && m.bracket === "losersBracket"
  );

  // an unflagged playoff still needs marking, or the renderer labels it "Final"
  for (const round of progression) {
    round.isPlayoff = thirdPlaceMatches.has(round.match);
  }

  const placement = describePlacement(last, {
    finalRound,
    decidingMatch,
    thirdPlaceMatches,
    isDoubleElim,
  });

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
    // top four, so the summary line can be given more weight than a mid-bracket exit
    isPodium: PODIUM.has(placement),
    placement,
  };
}

const PODIUM = new Set(["Winner", "Runner-up", "3rd place", "4th place"]);

function describePlacement(last, context) {
  const { finalRound, decidingMatch, thirdPlaceMatches, isDoubleElim } = context;

  if (thirdPlaceMatches.has(last.match)) {
    if (last.won === null) return "Joint 3rd place";
    return last.won ? "3rd place" : "4th place";
  }

  if (last.match === decidingMatch) {
    // a tied final is left as a tie rather than crowning someone
    if (last.won === null) return "Finalist (tied)";
    return last.won ? "Winner" : "Runner-up";
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
    CountUserVotesForTrack,
    normaliseTitle,
    trackKey,
  };
}
