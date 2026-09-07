#!/usr/bin/env node
/**
 * Rebuild compatibility.json from db.json.
 *
 * Every pairing and percentage the compatibility commands read is precomputed
 * here, so that a search across all tournaments is a lookup rather than a walk
 * over every match ever played. Once built, the bot keeps it current by itself:
 * single/doubleElim/tripleTournament.js call UpdateCompatibilityForMatches with
 * just the matches that closed that round, which adds the new connections onto
 * the existing totals.
 *
 * So this is only needed when the history itself changes -- tournaments merged
 * in from an archive, names resolved, or a scoring fix that invalidates what
 * was stored. Normal operation never needs it.
 *
 * The maths lives in public/utils/compatibilityStore.js, the same module the
 * bot uses at runtime, so the precomputed file and the incremental updates
 * cannot drift apart.
 *
 *   node backfillCompatibility.js                     # db.json -> compatibility.json
 *   node backfillCompatibility.js --db .data/db.json --out .data/compatibility.json
 *   node backfillCompatibility.js --dry-run           # report only, write nothing
 */

const fs = require("fs");
const path = require("path");
const {
  RebuildCompatibilityFromTournaments,
  GetTournamentEntriesNewestFirst,
  matchVoteKind,
} = require("./public/utils/compatibilityStore.js");

function parseArgs(argv) {
  const args = { db: "db.json", out: "compatibility.json", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--db") args.db = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function getTournamentRoot(db) {
  return db && Array.isArray(db.tournaments) && db.tournaments[0]
    ? db.tournaments[0]
    : null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
    return;
  }

  const dbPath = path.resolve(args.db);
  if (!fs.existsSync(dbPath)) {
    console.error(`db not found at ${dbPath}`);
    process.exit(1);
  }

  const root = getTournamentRoot(JSON.parse(fs.readFileSync(dbPath, "utf8")));
  if (!root) {
    console.error(`${dbPath} has no tournaments[0] root`);
    process.exit(1);
  }

  const entries = GetTournamentEntriesNewestFirst(root);
  const compat = RebuildCompatibilityFromTournaments(root);

  console.log(`Read ${entries.length} tournaments from ${dbPath}\n`);
  const head = "tournament".padEnd(34) + "complete  ranked  pairs";
  console.log(head);
  console.log("-".repeat(head.length));

  let totalComplete = 0;
  for (const { name, data } of entries) {
    const complete = data.matches.filter((m) => m && m.progress === "complete");
    const ranked = complete.filter((m) => matchVoteKind(m) === "ranked").length;
    const users = compat.tournaments[name]?.users || {};
    // users is symmetric, so each pairing is stored twice
    const pairs =
      Object.values(users).reduce((n, row) => n + Object.keys(row).length, 0) / 2;
    totalComplete += complete.length;
    console.log(
      name.slice(0, 33).padEnd(34) +
        String(complete.length).padStart(8) +
        String(ranked).padStart(8) +
        String(pairs).padStart(7)
    );
  }

  const g = compat.global;
  console.log(
    `\nglobal singleDouble: ${g.singleDouble.totalMatches} matches, ` +
      `${Object.keys(g.singleDouble.users).length} users`
  );
  console.log(
    `global triple:       ${g.triple.totalMatches} matches, ` +
      `${Object.keys(g.triple.users).length} users`
  );

  const bucketed = g.singleDouble.totalMatches + g.triple.totalMatches;
  if (bucketed !== totalComplete) {
    console.error(
      `\nMismatch: ${totalComplete} complete matches but ${bucketed} bucketed globally.`
    );
    process.exit(1);
  }

  if (args.dryRun) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  const outPath = path.resolve(args.out);
  fs.writeFileSync(outPath, JSON.stringify(compat, null, 2), "utf8");
  console.log(`\nWrote ${outPath}`);
}

main();
