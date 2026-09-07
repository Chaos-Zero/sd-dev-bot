#!/usr/bin/env node
/**
 * Guards the one rule /tournament-track-history must never break: nothing about
 * a match that has not finished may reach a user. Unplayed matches are stored
 * with their entrants already filled in, a live match carries running vote
 * counts, and a bracket can be registered hidden so upcoming rounds stay
 * secret -- so a regression here leaks results before they are public.
 *
 * Run against a synthetic tournament rather than db.json, so it keeps working
 * whatever state the real database happens to be in:
 *
 *   node checkTrackHistoryPrivacy.js
 */

const th = require("./public/tournament/trackHistory.js");

const SECRET = "Unreleased Secret Anthem";
const SECRET_GAME = "Spoiler Quest VII";

// a live tournament: one finished round, one being voted on, and a future
// round already drawn with its entrants filled in
const root = {
  currentTournament: "Live Contest",
  "Live Contest": {
    tournamentFormat: "Single Elimination",
    matches: [
      { round: 1, match: 1, progress: "complete",
        entrant1: { name: "Played Track", title: "Known Game", points: 10, voters: ["u1", "u2"], videoId: "aaa" },
        entrant2: { name: "Beaten Track", title: "Known Game", points: 4, voters: ["u3"], videoId: "bbb" } },
      { round: 2, match: 2, progress: "in-progress",
        entrant1: { name: "Played Track", title: "Known Game", points: 7, voters: ["u1"], videoId: "aaa" },
        entrant2: { name: SECRET, title: SECRET_GAME, points: 5, voters: ["u2"], videoId: "sss" } },
      { round: 2, match: 3, progress: "tie",
        entrant1: { name: "Tied A", title: "Tie Game", points: 6, voters: ["u1"], videoId: "ccc" },
        entrant2: { name: "Tied B", title: "Tie Game", points: 6, voters: ["u2"], videoId: "ddd" } },
      { round: 3, match: 4, progress: "pending",
        entrant1: { name: "Future Finalist", title: "Hidden Game", points: 0, voters: [], videoId: "eee" },
        entrant2: { name: SECRET, title: SECRET_GAME, points: 0, voters: [], videoId: "sss" } },
      { round: 3, match: 5, progress: "abandoned",
        entrant1: { name: "Dropped Track", title: "Gone Game", points: 0, voters: [], videoId: "fff" },
        entrant2: { name: "Other Dropped", title: "Gone Game", points: 0, voters: [], videoId: "ggg" } },
    ],
  },
};

const index = th.BuildTrackIndex(root);
const names = index.map((t) => t.name);
const hidden = ["Unreleased Secret Anthem", "Future Finalist", "Tied A", "Tied B", "Dropped Track", "Other Dropped"];

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) { failures++; console.log(`   FAIL  ${label}${detail ? "  - " + detail : ""}`); }
  else console.log(`   ok    ${label}`);
};

check("only played tracks indexed", index.length === 2, `indexed ${index.length}: ${names.join(", ")}`);
for (const name of hidden) {
  check(`"${name}" absent from index`, !names.includes(name));
}
const played = index.find((t) => t.name === "Played Track");
check("played track lists its tournament", played && played.tournaments.includes("Live Contest"));

// its in-progress round-2 match must not appear in the run
const summary = th.SummariseTrackRun(root["Live Contest"], played);
check("run covers only the finished match", summary.matches === 1, `matches=${summary.matches}`);
check("no votes counted from the live match", summary.totalVotes === 10, `totalVotes=${summary.totalVotes}`);
check("no opponent from the live match", !JSON.stringify(summary.progression).includes(SECRET));

// and the live ballot must not be attributable
check("user vote count ignores the live match",
  th.CountUserVotesForTrack(root["Live Contest"], played, "u1") === 1,
  `got ${th.CountUserVotesForTrack(root["Live Contest"], played, "u1")}`);

// a search for the secret must find nothing anywhere in the index
const leaked = JSON.stringify(index);
check("secret track name nowhere in index", !leaked.includes(SECRET));
check("secret game nowhere in index", !leaked.includes(SECRET_GAME));
check("secret videoId nowhere in index", !leaked.includes("sss"));

console.log(failures ? `\n${failures} LEAK(S)` : "\nno leaks");
process.exit(failures ? 1 : 0);
