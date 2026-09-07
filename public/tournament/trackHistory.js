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

/**
 * Whether a match may be spoken about at all.
 *
 * Only a finished match is public. Everything else is withheld, and the states
 * are not hypothetical: a match still being voted on carries running vote
 * counts, a tie carries the scores of a result awaiting a replay, and an
 * abandoned match carries the pairing that was drawn. A bracket can also be
 * registered as hidden so that upcoming rounds are not revealed before they
 * open, and future matches are stored with their entrants already filled in.
 *
 * So this gate is applied when building the index too, not only when reading a
 * run: a track must not become searchable, and must not show up as having
 * entered a tournament, until it has actually played a match there.
 */
function isPublicMatch(match) {
  return Boolean(match) && match.progress === "complete";
}

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
      if (!isPublicMatch(match)) continue;
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
 * How many tracks were still standing before each match was played.
 *
 * This is what actually names a stage: a quarter-final is the match where eight
 * remain, whatever round number it carries. Deriving it by counting rounds back
 * from the final does not survive these brackets -- byes, repechage rounds and
 * tie replays mean rounds hold odd numbers of matches and a track can play
 * twice in one, which is how a single run showed two "QF" labels.
 *
 * Matches are played in order within a round, so the count falls one at a time
 * and each match can be attributed to the stage it belongs to.
 */
function survivorsBeforeEachMatch(tournament) {
  const matches = (tournament?.matches || [])
    .filter(isPublicMatch)
    .sort(
      (a, b) => Number(a.round) - Number(b.round) || Number(a.match) - Number(b.match)
    );

  const field = new Set();
  for (const match of matches) {
    for (const entrant of matchEntrantList(match)) field.add(trackKey(entrant));
  }

  const eliminated = new Set();
  const alive = new Map();
  for (const match of matches) {
    alive.set(Number(match.match), field.size - eliminated.size);
    const entrants = matchEntrantList(match);
    const winner = matchWinner(entrants);
    // a tie eliminates nobody: it is replayed
    if (!winner) continue;
    for (const entrant of entrants) {
      if (entrant !== winner) eliminated.add(trackKey(entrant));
    }
  }
  return alive;
}

/**
 * Which matches were the quarter- and semi-finals, or nothing if the bracket
 * does not actually have them.
 *
 * The survivor count alone is not enough to trust. A contest with byes and tie
 * replays drains slowly, leaving sixteen matches sitting in the last-eight
 * window -- naming them all "quarter-final" would be as wrong as counting
 * rounds back from the final. So a stage is only named when exactly the right
 * number of matches qualify for it: four quarter-finals, two semi-finals.
 * Otherwise those matches keep their round number, which is always true.
 *
 * The two are checked independently, because a contest can have a clean pair of
 * semi-finals reached by an untidy route.
 *
 * Double elimination is skipped outright: a track is not out on its first loss,
 * so "how many are left" does not mean the same thing there.
 */
function namedStages(tournament) {
  const stages = new Map();
  const matches = (tournament?.matches || [])
    .filter(isPublicMatch)
    .sort(
      (a, b) => Number(a.round) - Number(b.round) || Number(a.match) - Number(b.match)
    );
  if (matches.some((m) => m.bracket === "losersBracket")) return stages;

  const survivors = survivorsBeforeEachMatch(tournament);
  const candidates = { "Semi-final": [], "Quarter-final": [] };
  for (const match of matches) {
    const alive = survivors.get(Number(match.match));
    if (!Number.isFinite(alive) || alive <= 2) continue;
    if (alive <= 4) candidates["Semi-final"].push(Number(match.match));
    else if (alive <= 8) candidates["Quarter-final"].push(Number(match.match));
  }

  const expected = { "Semi-final": 2, "Quarter-final": 4 };
  for (const [stage, list] of Object.entries(candidates)) {
    if (list.length !== expected[stage]) continue;
    for (const match of list) stages.set(match, stage);
  }
  return stages;
}

/**
 * The third-place playoff, found by who is in it: the two tracks that lost the
 * semi-finals, meeting again in a match that is not the final.
 *
 * Needed because the playoff is not reliably flagged and does not reliably sit
 * beside the final. Technology vs Nature runs it at match 63 in round 6 while
 * the final is match 64 in round 7, so looking only at the closing round missed
 * it and reported the third-place finisher as a plain round-6 exit.
 */
function findPlayoffBySemiFinalLosers(matches, stages, decidingMatch) {
  const semiLosers = new Set();
  for (const match of matches) {
    if (stages.get(Number(match.match)) !== "Semi-final") continue;
    const entrants = matchEntrantList(match);
    const winner = matchWinner(entrants);
    if (!winner) continue;
    for (const entrant of entrants) {
      if (entrant !== winner) semiLosers.add(trackKey(entrant));
    }
  }
  if (semiLosers.size !== 2) return [];

  const found = [];
  for (const match of matches) {
    if (Number(match.match) === decidingMatch) continue;
    const keys = matchEntrantList(match).map(trackKey);
    if (keys.length !== semiLosers.size) continue;
    if (keys.every((k) => semiLosers.has(k))) found.push(Number(match.match));
  }
  return found;
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
    .filter(isPublicMatch)
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
    if (!isPublicMatch(match)) continue;
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
  const complete = (tournament.matches || []).filter(isPublicMatch);
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
  const stages = namedStages(tournament);
  const thirdPlaceMatches = new Set(
    complete.filter((m) => m.isThirdPlace).map((m) => Number(m.match))
  );
  if (finalRoundMatches.length === 2) {
    for (const m of finalRoundMatches) {
      if (Number(m.match) !== decidingMatch) thirdPlaceMatches.add(Number(m.match));
    }
  }
  for (const match of findPlayoffBySemiFinalLosers(complete, stages, decidingMatch)) {
    thirdPlaceMatches.add(match);
  }
  // Double elimination keeps beaten tracks alive in a losers bracket, so the
  // rounds no longer count down to the final and "quarter-final" stops meaning
  // anything. Say which bracket instead.
  const isDoubleElim = complete.some((m) => m.bracket === "losersBracket");

  // an unflagged playoff still needs marking, or the renderer labels it "Final"
  for (const round of progression) {
    round.isPlayoff = thirdPlaceMatches.has(round.match);
    round.isFinal = round.match === decidingMatch;
    round.stage = round.isPlayoff
      ? "Third-place match"
      : round.isFinal
      ? "Final"
      : stages.get(round.match) || null;
  }

  const { placement, exit } = describePlacement(last, {
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
    exit,
  };
}

const PODIUM = new Set(["Winner", "Runner-up", "3rd place", "4th place"]);

/**
 * Where a track finished, and the sentence describing how it went out.
 *
 * Deliberately does not name stages like "quarter-final" from the round number.
 * Only three of thirteen contests ran a clean halving bracket -- byes, repechage
 * rounds and tie replays mean a round can hold an odd number of matches, and a
 * track can play twice in the same round (94 runs do). Counting back from the
 * final then labels two different matches "QF", which is how "Shore of Dreams"
 * came to show two quarter-finals in one run. The round number is always true;
 * the invented stage name is not.
 */
function describePlacement(last, context) {
  const { finalRound, decidingMatch, thirdPlaceMatches, isDoubleElim } = context;

  if (thirdPlaceMatches.has(last.match)) {
    if (last.won === null) {
      return { placement: "Joint 3rd place", exit: "Third-place match ended level" };
    }
    return last.won
      ? { placement: "3rd place", exit: "Won the third-place match" }
      : { placement: "4th place", exit: "Lost the third-place match" };
  }

  if (last.match === decidingMatch) {
    // a tied final is left as a tie rather than crowning someone
    if (last.won === null) {
      return { placement: "Finalist (tied)", exit: "The final ended level" };
    }
    return last.won
      ? { placement: "Winner", exit: "Won the tournament" }
      : { placement: "Runner-up", exit: "Lost the final" };
  }

  if (isDoubleElim) {
    const side = last.bracket === "losersBracket" ? "losers" : "winners";
    return {
      placement: `${side === "losers" ? "Losers" : "Winners"} bracket, R${last.round}`,
      exit: `Knocked out in the ${side} bracket, round ${last.round}`,
    };
  }

  if (last.stage === "Semi-final" || last.stage === "Quarter-final") {
    return {
      placement: `${last.stage}s`,
      exit: `Knocked out in the ${last.stage.toLowerCase()}s`,
    };
  }

  return {
    placement: `Round ${last.round} of ${finalRound}`,
    exit: `Knocked out in round ${last.round} of ${finalRound}`,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    BuildTrackIndex,
    BuildTrackProgression,
    SummariseTrackRun,
    CountUserVotesForTrack,
    normaliseTitle,
    trackKey,
    isPublicMatch,
    namedStages,
  };
}
