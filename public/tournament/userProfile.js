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

// A percentage over a handful of ballots reads as fact but is not one -- a
// single vote on a winner is "100%". Fewer than this and the rate is withheld
// and the raw counts shown instead. Lower than the pairwise bar, because a
// success rate needs less evidence than a comparison between two members.
const MIN_MATCHES_FOR_RATE = 10;

// How far a track must have gone before the share of it a member backed means
// anything: half the longest run in that tournament. Backing a track through
// both of its two matches is not the same achievement as backing one through
// four of its six.
const MIN_RUN_SHARE_OF_TOURNAMENT = 0.5;

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
      // Counted before the participation test: a track's run length is a fact
      // about the tournament, not about who voted. Reading it only from matches
      // this member voted in made every run look as long as their involvement,
      // so the "half the deepest run" bar was trivially met.
      for (const entrant of matchEntrantList(match)) {
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
            // every decided match this track played, so a member's votes for it
            // can be read as a share of how far it actually went
            appearances: 0,
          });
        }
        const row = backed.get(key);
        row.appearances += 1;
        if (outcome.participated && votedFor(entrant, userId)) row.votes += 1;
      }

      if (!outcome.participated) continue;
      tVotes += 1;
      if (outcome.hit) tHits += 1;
      else tMisses += 1;
    }

    // the deepest run anyone managed here, which sets the bar below
    let longestRun = 0;
    for (const row of backed.values()) {
      if (row.tournament === name && row.appearances > longestRun) {
        longestRun = row.appearances;
      }
    }
    for (const row of backed.values()) {
      if (row.tournament === name) row.longestRun = longestRun;
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
    // enough decided matches for the percentage to be worth quoting
    enoughForRate: votes >= MIN_MATCHES_FOR_RATE,
    perTournament: perTournament,
    backed: Array.from(backed.values()).filter(function (row) {
      return row.votes > 0;
    }),
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
 * The tracks a member supported longest.
 *
 * Measured as the share of a track's own run they voted for it in: backing
 * something through all seven of its matches says far more than backing a
 * champion once in the final.
 *
 * Only tracks that went a fair way are eligible -- at least half the deepest
 * run in that tournament. Without it the list fills with tracks knocked out
 * immediately, where one vote is the whole run and every entry reads 100%. So
 * four from six counts and two from two does not.
 */
function FindMostBacked(profile, limit) {
  return profile.backed
    .filter(function (row) {
      if (!row.appearances) return false;
      const bar = Math.ceil((row.longestRun || 0) * MIN_RUN_SHARE_OF_TOURNAMENT);
      return row.appearances >= Math.max(bar, 1);
    })
    .map(function (row) {
      return Object.assign({}, row, { share: row.votes / row.appearances });
    })
    .sort(function (a, b) {
      return (
        b.share - a.share || b.appearances - a.appearances || b.votes - a.votes
      );
    })
    .slice(0, limit || 4);
}

if (typeof module !== "undefined") {
  module.exports = {
    BuildUserProfile,
    FindCompatibleUsers,
    FindMostBacked,
    MIN_MATCHES_FOR_COMPATIBILITY,
    MIN_MATCHES_FOR_RATE,
  };
}
