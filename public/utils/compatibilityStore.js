const fs = require("fs");
const path = require("path");

function getCompatibilityDbPath() {
  const dataDir = path.join(__dirname, "..", "..", ".data");
  return path.join(dataDir, "compatibility.json");
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
  const formatKey =
    tournamentFormat === "3v3 Ranked" ? "triple" : "singleDouble";

  const tournamentTarget = ensureCompatibilityTarget(
    db,
    "tournament",
    tournamentName,
    tournamentFormat
  );
  const globalTarget = ensureCompatibilityTarget(
    db,
    "global",
    "",
    formatKey
  );

  for (const match of matches) {
    if (!match || match.progress !== "complete") {
      continue;
    }
    if (formatKey === "triple") {
      updateTripleCompatibility(tournamentTarget, match);
      updateTripleCompatibility(globalTarget, match);
    } else {
      updateSingleDoubleCompatibility(tournamentTarget, match);
      updateSingleDoubleCompatibility(globalTarget, match);
    }
  }

  SaveCompatibilityDb(db);
}

function updateSingleDoubleCompatibility(target, match) {
  const votersA = normalizeVoters(match?.entrant1?.voters);
  const votersB = normalizeVoters(match?.entrant2?.voters);

  target.totalMatches = (target.totalMatches || 0) + 1;

  if (votersA.length < 1 && votersB.length < 1) {
    return;
  }

  const allVoters = uniqueValues(votersA.concat(votersB));
  incrementUserMatchCounts(target.userMatchCounts, allVoters);
  for (let i = 0; i < votersA.length; i++) {
    for (let j = i + 1; j < votersA.length; j++) {
      updatePairStats(target.users, votersA[i], votersA[j], {
        matched: 1,
        iterations: 1,
      });
    }
  }

  for (let i = 0; i < votersB.length; i++) {
    for (let j = i + 1; j < votersB.length; j++) {
      updatePairStats(target.users, votersB[i], votersB[j], {
        matched: 1,
        iterations: 1,
      });
    }
  }

  for (let i = 0; i < votersA.length; i++) {
    for (let j = 0; j < votersB.length; j++) {
      updatePairStats(target.users, votersA[i], votersB[j], {
        matched: 0,
        iterations: 1,
      });
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
  };
}
