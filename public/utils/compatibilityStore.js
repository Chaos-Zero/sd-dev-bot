const fs = require("fs");
const path = require("path");

function getCompatibilityDbPath() {
  return path.join(process.cwd(), ".data", "compatibility.json");
}

function getDefaultCompatibilityDb() {
  return {
    tournaments: {},
    global: {
      singleDouble: {
        users: {},
        userMatchCounts: {},
        totalMatches: 0,
      },
      triple: {
        users: {},
        userMatchCounts: {},
        totalMatches: 0,
      },
    },
  };
}

function LoadCompatibilityDb() {
  const filePath = getCompatibilityDbPath();
  if (!fs.existsSync(filePath)) {
    return getDefaultCompatibilityDb();
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Failed to read compatibility DB:", error);
    return getDefaultCompatibilityDb();
  }
}

function SaveCompatibilityDb(db) {
  const filePath = getCompatibilityDbPath();
  fs.writeFileSync(filePath, JSON.stringify(db, null, 2), "utf8");
}

function ensureCompatibilityTarget(db, scopeKey, tournamentName, formatKey) {
  if (scopeKey === "global") {
    if (!db.global) {
      db.global = getDefaultCompatibilityDb().global;
    }
    if (!db.global[formatKey]) {
      db.global[formatKey] = {
        users: {},
        userMatchCounts: {},
        totalMatches: 0,
      };
    }
    return db.global[formatKey];
  }

  if (!db.tournaments[tournamentName]) {
    db.tournaments[tournamentName] = {
      format: formatKey,
      users: {},
      userMatchCounts: {},
      totalMatches: 0,
    };
  }

  if (!db.tournaments[tournamentName].users) {
    db.tournaments[tournamentName].users = {};
  }
  if (!db.tournaments[tournamentName].userMatchCounts) {
    db.tournaments[tournamentName].userMatchCounts = {};
  }
  if (db.tournaments[tournamentName].totalMatches === undefined) {
    db.tournaments[tournamentName].totalMatches = 0;
  }
  if (!db.tournaments[tournamentName].format) {
    db.tournaments[tournamentName].format = formatKey;
  }

  return db.tournaments[tournamentName];
}

function UpdateCompatibilityForMatches(
  tournamentName,
  tournamentFormat,
  matches
) {
  if (!Array.isArray(matches) || matches.length < 1) {
    return;
  }

  const db = LoadCompatibilityDb();

  const tournamentTarget = ensureCompatibilityTarget(
    db,
    "tournament",
    tournamentName,
    tournamentFormat
  );

  for (const match of matches) {
    if (!match || match.progress !== "complete") {
      continue;
    }
    // Decided per match, not per tournament: a mixed contest contributes its
    // ranked rounds to the triple bucket and its head-to-head rounds to the
    // other, instead of having half of itself silently discarded.
    const kind = matchVoteKind(match);
    const globalTarget = ensureCompatibilityTarget(
      db,
      "global",
      "",
      kind === "ranked" ? "triple" : "singleDouble"
    );
    if (kind === "ranked") {
      updateTripleCompatibility(tournamentTarget, match);
      updateTripleCompatibility(globalTarget, match);
    } else {
      updateSingleDoubleCompatibility(tournamentTarget, match);
      updateSingleDoubleCompatibility(globalTarget, match);
    }
  }

  SaveCompatibilityDb(db);
}

/**
 * Entrants of a match, in slot order. Historical contests ran 3- and 4-way
 * "pick one" battles (Best VGM 2020 round 1, 2021 round 1), so reading only
 * entrant1/entrant2 would silently discard those voters and score everyone who
 * backed slots 3 or 4 as if they had not voted at all.
 */
function matchEntrantList(match) {
  const out = [];
  if (!match) return out;
  const count = match.entrantCount || 8;
  for (let i = 1; i <= count; i++) {
    const entrant = match["entrant" + i];
    if (entrant && typeof entrant === "object" && entrant.name) out.push(entrant);
  }
  return out;
}

/**
 * How a single match was voted on, decided by the match itself rather than the
 * tournament's format string. Contests routinely changed style as they
 * narrowed -- three-way ranked group rounds, then head-to-head finals -- so a
 * tournament-level format rejects the very matches that decided it.
 *
 * Prefers the stamped matchFormat, falling back to the ballot shape for data
 * written before normalizeDb ran.
 */
function matchVoteKind(match) {
  if (match && match.matchFormat === "ranked3") return "ranked";
  if (match && match.matchFormat) return "flat";
  for (const entrant of matchEntrantList(match)) {
    const v = entrant.voters;
    if (v && !Array.isArray(v) && typeof v === "object") return "ranked";
  }
  return "flat";
}

function updateSingleDoubleCompatibility(target, match) {
  const sides = matchEntrantList(match).map((e) => normalizeVoters(e.voters));

  target.totalMatches = (target.totalMatches || 0) + 1;

  if (!sides.some((s) => s.length > 0)) {
    return;
  }

  const allVoters = uniqueValues([].concat(...sides));
  incrementUserMatchCounts(target.userMatchCounts, allVoters);

  // Same side: agreement. Different sides: disagreement. Identical maths to
  // the old two-side version when there are only two.
  for (const side of sides) {
    for (let i = 0; i < side.length; i++) {
      for (let j = i + 1; j < side.length; j++) {
        updatePairStats(target.users, side[i], side[j], {
          matched: 1,
          iterations: 1,
        });
      }
    }
  }

  for (let a = 0; a < sides.length; a++) {
    for (let b = a + 1; b < sides.length; b++) {
      for (const userA of sides[a]) {
        for (const userB of sides[b]) {
          updatePairStats(target.users, userA, userB, {
            matched: 0,
            iterations: 1,
          });
        }
      }
    }
  }
}

function updateTripleCompatibility(target, match) {
  const entrants = [
    buildTripleEntrant(match?.entrant1),
    buildTripleEntrant(match?.entrant2),
    buildTripleEntrant(match?.entrant3),
  ];

  if (!entrants[0] || !entrants[1] || !entrants[2]) {
    return;
  }

  const participantSet = new Set();
  for (const entrant of entrants) {
    for (const voter of entrant.first) {
      participantSet.add(voter);
    }
    for (const voter of entrant.second) {
      participantSet.add(voter);
    }
  }

  const participants = Array.from(participantSet);
  incrementUserMatchCounts(target.userMatchCounts, participants);
  target.totalMatches = (target.totalMatches || 0) + 1;

  if (participants.length < 2) {
    return;
  }

  const firstSets = entrants.map((entrant) => new Set(entrant.first));
  const secondSets = entrants.map((entrant) => new Set(entrant.second));

  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const userA = participants[i];
      const userB = participants[j];

      const firstInEntrant1 = bothInSet(firstSets[0], userA, userB);
      const firstInEntrant2 = bothInSet(firstSets[1], userA, userB);
      const firstInEntrant3 = bothInSet(firstSets[2], userA, userB);

      const secondInEntrant1 = bothInSet(secondSets[0], userA, userB);
      const secondInEntrant2 = bothInSet(secondSets[1], userA, userB);
      const secondInEntrant3 = bothInSet(secondSets[2], userA, userB);

      const mixFirstSecondInEntrant =
        firstSets[0].has(userA) &&
        secondSets[0].has(userB) &&
        firstSets[1].has(userB) &&
        secondSets[1].has(userA);
      const mixFirstThirdInEntrant =
        firstSets[0].has(userA) &&
        secondSets[0].has(userB) &&
        firstSets[2].has(userB) &&
        secondSets[2].has(userA);
      const mixSecondFirstInEntrant =
        firstSets[1].has(userA) &&
        secondSets[1].has(userB) &&
        firstSets[0].has(userB) &&
        secondSets[0].has(userA);
      const mixSecondThirdInEntrant =
        firstSets[1].has(userA) &&
        secondSets[1].has(userB) &&
        firstSets[2].has(userB) &&
        secondSets[2].has(userA);
      const mixThirdFirstInEntrant =
        firstSets[2].has(userA) &&
        secondSets[2].has(userB) &&
        firstSets[0].has(userB) &&
        secondSets[0].has(userA);
      const mixThirdSecondInEntrant =
        firstSets[2].has(userA) &&
        secondSets[2].has(userB) &&
        firstSets[1].has(userB) &&
        secondSets[1].has(userA);

      const delta = {
        totalWeight: 0,
        firstWeight: 0,
        secondWeight: 0,
        partialMatch: 0,
        maxWeight: 3,
        matchCount: 1,
        disagreementWeight: 0,
      };

      if (firstInEntrant1 || firstInEntrant2 || firstInEntrant3) {
        delta.totalWeight += 2;
        delta.firstWeight += 1;
      }

      if (secondInEntrant1 || secondInEntrant2 || secondInEntrant3) {
        delta.totalWeight += 1;
        delta.secondWeight += 1;
      }

      if (
        mixFirstSecondInEntrant ||
        mixFirstThirdInEntrant ||
        mixSecondFirstInEntrant ||
        mixSecondThirdInEntrant ||
        mixThirdFirstInEntrant ||
        mixThirdSecondInEntrant
      ) {
        delta.partialMatch += 1;
      }

      if (
        !firstInEntrant1 &&
        !firstInEntrant2 &&
        !firstInEntrant3 &&
        !secondInEntrant1 &&
        !secondInEntrant2 &&
        !secondInEntrant3 &&
        !mixFirstSecondInEntrant &&
        !mixFirstThirdInEntrant &&
        !mixSecondFirstInEntrant &&
        !mixSecondThirdInEntrant &&
        !mixThirdFirstInEntrant &&
        !mixThirdSecondInEntrant
      ) {
        delta.disagreementWeight += 1;
      }

      updatePairStats(target.users, userA, userB, delta);
    }
  }
}

function buildTripleEntrant(entrant) {
  if (!entrant || !entrant.voters) {
    return null;
  }
  return {
    first: normalizeVoters(entrant.voters.first),
    second: normalizeVoters(entrant.voters.second),
  };
}

/**
 * A Discord user id -- a numeric snowflake. Ballots recovered from the archive
 * occasionally carry a display name where the id could not be resolved
 * ("Deedee", "jungle"). Those can never be matched to a guild member, so they
 * are dropped here rather than counted as a participant nobody can look up.
 */
function isUserId(value) {
  return typeof value === "string" && /^\d+$/.test(value);
}

function normalizeVoters(voters) {
  if (!Array.isArray(voters)) {
    return [];
  }
  return voters.filter(isUserId);
}

function uniqueValues(values) {
  return Array.from(new Set(values));
}

function incrementUserMatchCounts(userMatchCounts, voters) {
  if (!userMatchCounts) {
    return;
  }
  for (const voter of voters) {
    if (!voter) {
      continue;
    }
    if (!userMatchCounts[voter]) {
      userMatchCounts[voter] = 0;
    }
    userMatchCounts[voter] += 1;
  }
}

function bothInSet(set, userA, userB) {
  return set.has(userA) && set.has(userB);
}

function updatePairStats(users, userA, userB, delta) {
  if (!userA || !userB || userA === userB) {
    return;
  }
  applyPairDelta(users, userA, userB, delta);
  applyPairDelta(users, userB, userA, delta);
}

function applyPairDelta(users, userA, userB, delta) {
  if (!users[userA]) {
    users[userA] = {};
  }
  if (!users[userA][userB]) {
    users[userA][userB] = {};
  }
  const entry = users[userA][userB];
  for (const [key, value] of Object.entries(delta)) {
    if (!entry[key]) {
      entry[key] = 0;
    }
    entry[key] += value;
  }
}

// ---------------------------------------------------------------------------
// Tournament lookup
//
// The root of db.tournaments[0] mixes bot config with the tournaments
// themselves, so callers need one agreed way to tell them apart. Blacklisting
// config keys silently breaks the moment a new one is added -- and it did:
// testMode, tournamentPostTime, _schemaVersion and _normalizedAt all read as
// tournaments to the old list. Detect them by shape instead, matching
// normalizeDb.js's isTournament.
// ---------------------------------------------------------------------------

function isTournamentRecord(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.matches)
  );
}

function GetTournamentEntries(tournamentRoot) {
  if (!tournamentRoot || typeof tournamentRoot !== "object") {
    return [];
  }
  return Object.entries(tournamentRoot)
    .filter(([, value]) => isTournamentRecord(value))
    .map(([name, data]) => ({ name, data }));
}

/**
 * Tournaments newest first, by when each last ran rather than by where it sits
 * in the object. Tournaments are now registered at the top of the database, so
 * reading the last key returns the oldest contest on record -- 2020's awards
 * rather than this year's. A tournament with no lastMatchAt has not run yet, so
 * it sorts newest, which is where a freshly registered one belongs. Same
 * ordering as normalizeDb.js's orderTournaments.
 */
function GetTournamentEntriesNewestFirst(tournamentRoot) {
  return GetTournamentEntries(tournamentRoot).sort((x, y) => {
    const a = x.data.lastMatchAt;
    const b = y.data.lastMatchAt;
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    return b.localeCompare(a);
  });
}

function GetLatestTournamentEntry(tournamentRoot) {
  const entries = GetTournamentEntriesNewestFirst(tournamentRoot);
  return entries.length ? entries[0] : null;
}

// ---------------------------------------------------------------------------
// Winner-vote outcomes
//
// Shared so that every command scores a match the same way. Read every entrant
// slot: historical contests ran 3- and 4-way "pick one" battles, and reading
// only entrant1/entrant2 picks the wrong winner and scores anyone who backed
// slot 3 or 4 as absent.
// ---------------------------------------------------------------------------

const NO_OUTCOME = { isValid: false, participated: false, hit: false };

function getUniqueWinnerIndex(points) {
  let bestValue = Number.NEGATIVE_INFINITY;
  let bestIndex = null;
  let tieFound = false;

  for (let i = 0; i < points.length; i++) {
    const value = points[i];
    if (value > bestValue) {
      bestValue = value;
      bestIndex = i;
      tieFound = false;
    } else if (value === bestValue) {
      tieFound = true;
    }
  }

  if (bestIndex === null || tieFound) {
    return null;
  }
  return bestIndex;
}

function getSingleDoubleWinnerVoteOutcome(match, userId) {
  const entrants = matchEntrantList(match);
  if (entrants.length < 2) {
    return NO_OUTCOME;
  }

  const voterLists = entrants.map((e) => e.voters);
  if (!voterLists.every((v) => Array.isArray(v))) {
    return NO_OUTCOME;
  }

  const points = entrants.map((e) => Number(e.points));
  if (!points.every((p) => Number.isFinite(p))) {
    return { isValid: true, participated: false, hit: false };
  }

  const winnerIndex = getUniqueWinnerIndex(points);
  if (winnerIndex === null) {
    return { isValid: true, participated: false, hit: false };
  }

  if (!voterLists.some((v) => v.includes(userId))) {
    return { isValid: true, participated: false, hit: false };
  }

  return {
    isValid: true,
    participated: true,
    hit: voterLists[winnerIndex].includes(userId),
  };
}

function getTripleWinnerVoteOutcome(match, userId) {
  const entrants = matchEntrantList(match);
  if (entrants.length < 3) {
    return NO_OUTCOME;
  }

  const groups = entrants.map((e) => ({
    first: e?.voters?.first,
    second: e?.voters?.second,
  }));
  if (
    !groups.every(
      (g) => Array.isArray(g.first) && Array.isArray(g.second)
    )
  ) {
    return NO_OUTCOME;
  }

  const points = entrants.map((e) => Number(e.points));
  if (!points.every((p) => Number.isFinite(p))) {
    return { isValid: true, participated: false, hit: false };
  }

  const winnerIndex = getUniqueWinnerIndex(points);
  if (winnerIndex === null) {
    return { isValid: true, participated: false, hit: false };
  }

  const participated = groups.some(
    (g) => g.first.includes(userId) || g.second.includes(userId)
  );
  if (!participated) {
    return { isValid: true, participated: false, hit: false };
  }

  const winner = groups[winnerIndex];
  return {
    isValid: true,
    participated: true,
    hit: winner.first.includes(userId) || winner.second.includes(userId),
  };
}

/**
 * Did this user back the winner? Decided per match, not per tournament: a
 * ranked contest's head-to-head final is still a head-to-head, and scoring it
 * as ranked would count nobody at all.
 */
function GetWinnerVoteOutcome(match, userId) {
  if (!match || match.progress !== "complete") {
    return NO_OUTCOME;
  }
  return matchVoteKind(match) === "ranked"
    ? getTripleWinnerVoteOutcome(match, userId)
    : getSingleDoubleWinnerVoteOutcome(match, userId);
}

/**
 * Everyone who voted in a tournament, across every entrant slot and both
 * ballot shapes. Ranked ballots store voters as {first, second} rather than an
 * array, so iterating them blindly throws.
 */
function GetAllTournamentVoters(tournament) {
  const voters = new Set();
  if (!tournament || !Array.isArray(tournament.matches)) {
    return [];
  }
  for (const match of tournament.matches) {
    for (const entrant of matchEntrantList(match)) {
      const v = entrant.voters;
      if (Array.isArray(v)) {
        for (const voter of normalizeVoters(v)) voters.add(voter);
      } else if (v && typeof v === "object") {
        for (const voter of normalizeVoters(v.first)) voters.add(voter);
        for (const voter of normalizeVoters(v.second)) voters.add(voter);
      }
    }
  }
  return Array.from(voters);
}

/**
 * Rebuild the whole compatibility database from the tournament root, in
 * memory. Used by the backfill so that the precomputed file and the per-round
 * incremental updates come from one implementation and cannot drift.
 */
function RebuildCompatibilityFromTournaments(tournamentRoot) {
  const db = getDefaultCompatibilityDb();

  for (const { name, data } of GetTournamentEntries(tournamentRoot)) {
    const tournamentTarget = ensureCompatibilityTarget(
      db,
      "tournament",
      name,
      data.tournamentFormat || "Single Elimination"
    );

    for (const match of data.matches) {
      if (!match || match.progress !== "complete") {
        continue;
      }
      const kind = matchVoteKind(match);
      const globalTarget = ensureCompatibilityTarget(
        db,
        "global",
        "",
        kind === "ranked" ? "triple" : "singleDouble"
      );
      if (kind === "ranked") {
        updateTripleCompatibility(tournamentTarget, match);
        updateTripleCompatibility(globalTarget, match);
      } else {
        updateSingleDoubleCompatibility(tournamentTarget, match);
        updateSingleDoubleCompatibility(globalTarget, match);
      }
    }
  }

  return db;
}

// ---------------------------------------------------------------------------
// Small-sample smoothing
//
// "Most compatible" is decided by the maximum, so a pair who shared two matches
// and agreed on both wins outright over a pair who shared ninety and agreed on
// sixty. The coincidence beats the real history every time, and the command's
// participation gate does not stop it: the gate is a percentage of your own
// votes, so someone who voted seven times only needs a partner to share two.
//
// So pull every pair toward the server's own average until it has shared enough
// matches to have earned its score. A well-established pair barely moves -- at
// 300 shared matches the adjustment is under a point -- while a two-match pair
// is mostly baseline, which is honest, because two matches say almost nothing.
//
// This deliberately does NOT discount agreeing with the crowd. Voting the same
// way as everyone else is still a shared preference, and compatibility here is
// about matching preferences rather than about who is unusual.
// ---------------------------------------------------------------------------

// Shared matches a pair needs before their own record outweighs the baseline.
const SHRINK_MATCHES = 10;

// A ranked match contributes 3 to maxWeight, so its counters live on a scale
// three times the flat ones and the smoothing has to match.
const RANKED_WEIGHT_PER_MATCH = 3;

function rankedNumerator(stats) {
  return (
    (stats.totalWeight || 0) -
    (stats.disagreementWeight || 0) +
    (stats.partialMatch || 0) / 2
  );
}

/**
 * How many matches a pair actually voted in together -- the number that says
 * whether their score means anything.
 */
function GetPairSharedMatches(stats, kind) {
  if (!stats) return 0;
  return (kind === "ranked" ? stats.matchCount : stats.iterations) || 0;
}

/** A pair's score as it stands, before smoothing. Can be negative for ranked. */
function GetPairRawRate(stats, kind) {
  if (!stats) return 0;
  if (kind === "ranked") {
    const max = stats.maxWeight || 0;
    return max > 0 ? rankedNumerator(stats) / max : 0;
  }
  const shared = stats.iterations || 0;
  return shared > 0 ? (stats.matched || 0) / shared : 0;
}

/**
 * The average agreement rate across everyone in this bucket -- what an
 * unremarkable pair looks like, and so what a pair with no evidence of its own
 * should be assumed to be. Derived from the stored counters, so it needs no
 * extra accumulator and stays correct as the data grows.
 */
function GetBaselineRate(store, kind) {
  if (!store || !store.users) return 0.5;
  let hits = 0;
  let shared = 0;
  for (const row of Object.values(store.users)) {
    for (const stats of Object.values(row)) {
      if (kind === "ranked") {
        hits += rankedNumerator(stats);
        shared += stats.maxWeight || 0;
      } else {
        hits += stats.matched || 0;
        shared += stats.iterations || 0;
      }
    }
  }
  return shared > 0 ? hits / shared : 0.5;
}

/**
 * A pair's rate with thin records pulled toward the baseline. Rank on this
 * rather than the raw rate -- it is what stops a two-match fluke outranking a
 * season of shared voting.
 */
function GetPairShrunkRate(stats, kind, baseline) {
  const prior = Number.isFinite(baseline) ? baseline : 0.5;
  if (!stats) return prior;
  const perMatch = kind === "ranked" ? RANKED_WEIGHT_PER_MATCH : 1;
  const strength = SHRINK_MATCHES * perMatch;
  const shared =
    (kind === "ranked" ? stats.maxWeight : stats.iterations) || 0;
  const hits = kind === "ranked" ? rankedNumerator(stats) : stats.matched || 0;
  return (hits + strength * prior) / (shared + strength);
}

if (typeof module !== "undefined") {
  module.exports = {
    LoadCompatibilityDb,
    SaveCompatibilityDb,
    UpdateCompatibilityForMatches,
    RebuildCompatibilityFromTournaments,
    GetTournamentEntries,
    GetTournamentEntriesNewestFirst,
    GetLatestTournamentEntry,
    GetWinnerVoteOutcome,
    GetBaselineRate,
    GetPairShrunkRate,
    GetPairRawRate,
    GetPairSharedMatches,
    GetAllTournamentVoters,
    matchEntrantList,
    matchVoteKind,
  };
}
