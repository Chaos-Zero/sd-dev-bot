/**
 * One member's record across every tournament.
 *
 * Pure data: no Discord, no canvas, no network. Hits and misses come from
 * GetWinnerVoteOutcome, the same test /tournament-taste-makers and the
 * self-comparison in /tournament-user-compatibility use, so a member's success
 * rate reads the same wherever it appears.
 */

const {
  GetTournamentEntriesNewestFirst,
  GetWinnerVoteOutcome,
  GetBaselineRate,
  GetPairShrunkRate,
  GetPairSharedMatches,
  matchEntrantList,
} = require("../utils/compatibilityStore.js");
const { isPublicMatch, normaliseTitle } = require("./trackHistory.js");

// Below this many matches a success rate is noise, so the compatibility field
// is left off rather than naming a "closest match" from a handful of ballots.
const MIN_MATCHES_FOR_COMPATIBILITY = 20;

/** Did this member back this entrant? Reads both ballot shapes. */
function votedFor(entrant, userId) {
  const voters = entrant && entrant.voters;
  if (Array.isArray(voters)) return voters.includes(userId);
  if (voters && typeof voters === "object") {
    const first = Array.isArray(voters.first) ? voters.first : [];
    const second = Array.isArray(voters.second) ? voters.second : [];
    return first.includes(userId) || second.includes(userId);
  }
  return false;
}

/**
 * Everything the profile needs, in one pass over the archive.
 *
 * `backed` records every track the member voted for, so the caller can work out
 * how far their picks went without walking the matches again.
 */
function BuildUserProfile(tournamentRoot, userId) {
  const perTournament = [];
  const backed = new Map();
  let hits = 0;
  let misses = 0;
  let votes = 0;

  for (const entry of GetTournamentEntriesNewestFirst(tournamentRoot)) {
    const name = entry.name;
    const data = entry.data;
    let tHits = 0;
    let tMisses = 0;
    let tVotes = 0;
    let decided = 0;

    for (const match of data.matches || []) {
      if (!isPublicMatch(match)) continue;
      const outcome = GetWinnerVoteOutcome(match, userId);
      if (!outcome.isValid) continue;
      decided += 1;
      if (!outcome.participated) continue;

      tVotes += 1;
      if (outcome.hit) tHits += 1;
      else tMisses += 1;

      for (const entrant of matchEntrantList(match)) {
        if (!votedFor(entrant, userId)) continue;
        const key =
          name + "|" + normaliseTitle(entrant.name) + "|" + normaliseTitle(entrant.title);
        if (!backed.has(key)) {
          backed.set(key, {
            tournament: name,
            name: entrant.name,
            title: entrant.title || "",
            link: entrant.link || "",
            videoId: entrant.videoId || "",
            votes: 0,
          });
        }
        backed.get(key).votes += 1;
      }
    }

    if (!tVotes) continue;
    perTournament.push({
      name: name,
      hits: tHits,
      misses: tMisses,
      votes: tVotes,
      matches: decided,
      hitRate: tHits / tVotes,
      lastMatchAt: data.lastMatchAt || null,
    });
    hits += tHits;
    misses += tMisses;
    votes += tVotes;
  }

  return {
    userId: userId,
    tournaments: perTournament.length,
    votes: votes,
    hits: hits,
    misses: misses,
    hitRate: votes ? hits / votes : 0,
    perTournament: perTournament,
    backed: Array.from(backed.values()),
    // a rate off a handful of ballots means nothing; callers use this to decide
    // whether to show a comparison at all
    enoughForCompatibility: votes > MIN_MATCHES_FOR_COMPATIBILITY,
  };
}

/**
 * The members whose votes line up best with this one.
 *
 * Two guards, both about not reading meaning into thin data. The caller is
 * refused entirely below the match threshold. Candidates must clear the same
 * bar -- unless the caller is themselves near it, in which case matching them
 * only against heavy voters would leave nobody to compare with, so the bar
 * drops to what the caller has.
 *
 * Ranked on the smoothed rate, so a pair who shared two matches cannot outrank
 * a pair who shared a season.
 */
function FindCompatibleUsers(compatibilityDb, profile, options) {
  const opts = options || {};
  const limit = opts.limit || 3;
  const isMember = opts.isMember;
  if (!profile.enoughForCompatibility) return [];

  const results = [];
  const buckets = [
    ["singleDouble", "flat"],
    ["triple", "ranked"],
  ];

  for (const pair of buckets) {
    const store = compatibilityDb && compatibilityDb.global
      ? compatibilityDb.global[pair[0]]
      : null;
    if (!store || !store.users || !store.users[profile.userId]) continue;

    const kind = pair[1];
    const baseline = GetBaselineRate(store, kind);
    const counts = store.userMatchCounts || {};
    const mine = counts[profile.userId] || 0;
    const floor = Math.min(MIN_MATCHES_FOR_COMPATIBILITY, mine);

    for (const otherId of Object.keys(store.users[profile.userId])) {
      if (otherId === profile.userId) continue;
      if (isMember && !isMember(otherId)) continue;
      if ((counts[otherId] || 0) < floor) continue;

      const stats = store.users[profile.userId][otherId];
      const shared = GetPairSharedMatches(stats, kind);
      if (!shared) continue;
      results.push({
        userId: otherId,
        shared: shared,
        percent: Math.ceil(GetPairShrunkRate(stats, kind, baseline) * 100),
        kind: kind,
      });
    }
  }

  // one entry per member, keeping their strongest bucket
  const best = new Map();
  for (const row of results) {
    const held = best.get(row.userId);
    if (!held || row.percent > held.percent) best.set(row.userId, row);
  }
  return Array.from(best.values())
    .sort((a, b) => b.percent - a.percent || b.shared - a.shared)
    .slice(0, limit);
}

/**
 * The best a member's picks ever finished.
 *
 * Worked out from each tournament's podium rather than by summarising every
 * track they backed -- a heavy voter has backed 570 of them, and running a full
 * progression over each takes half a second. There are only ever twelve
 * podiums, and "you voted for the winner" is the interesting claim anyway.
 */
function FindBestRuns(tournamentRoot, profile, buildFinalsSummary, limit) {
  const wanted = new Map();
  for (const track of profile.backed) {
    wanted.set(
      track.tournament + "|" + normaliseTitle(track.name) + "|" + normaliseTitle(track.title),
      track
    );
  }

  const places = [
    ["winner", "Winner", 0],
    ["runnerUp", "Runner-up", 1],
    ["third", "3rd place", 2],
    ["fourth", "4th place", 3],
  ];

  const runs = [];
  for (const entry of GetTournamentEntriesNewestFirst(tournamentRoot)) {
    const summary = buildFinalsSummary(entry.data);
    if (!summary || !summary.podium) continue;
    for (const place of places) {
      const finisher = summary.podium[place[0]];
      if (!finisher) continue;
      const key =
        entry.name + "|" + normaliseTitle(finisher.name) + "|" + normaliseTitle(finisher.title);
      const backed = wanted.get(key);
      if (!backed) continue;
      runs.push({
        tournament: entry.name,
        name: finisher.name,
        title: finisher.title || "",
        link: finisher.link || backed.link || "",
        placement: place[1],
        rank: place[2],
        votes: backed.votes,
      });
    }
  }

  return runs
    .sort((a, b) => a.rank - b.rank || b.votes - a.votes)
    .slice(0, limit || 4);
}

if (typeof module !== "undefined") {
  module.exports = {
    BuildUserProfile,
    FindCompatibleUsers,
    FindBestRuns,
    MIN_MATCHES_FOR_COMPATIBILITY,
  };
}
