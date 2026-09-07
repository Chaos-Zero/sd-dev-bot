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

function normalizeVoters(voters) {
  if (!Array.isArray(voters)) {
    return [];
  }
  return voters.filter(Boolean);
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

if (typeof module !== "undefined") {
  module.exports = {
    LoadCompatibilityDb,
    SaveCompatibilityDb,
    UpdateCompatibilityForMatches,
    matchEntrantList,
    matchVoteKind,
  };
}
