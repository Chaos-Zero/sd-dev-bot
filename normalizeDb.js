#!/usr/bin/env node
/**
 * normalizeDb.js — Tier 1 normalisation of the MajorDomo tournament database.
 *
 * Repairs and enriches db.json WITHOUT restructuring it: entrant1/entrant2/entrant3
 * stay exactly where they are, so the existing bot code keeps working. Everything
 * here is either an additive field or an in-place repair.
 *
 * Usage:
 *   node normalizeDb.js                    # dry run against .data/db.json (or ./db.json)
 *   node normalizeDb.js --apply            # take a backup, then write
 *   node normalizeDb.js --db path/to.json  # target a specific file
 *   node normalizeDb.js --verbose          # list every change, not just samples
 *
 * Safe to re-run: a second pass reports zero changes.
 */

const fs = require("fs");
const path = require("path");

const SCHEMA_VERSION = 1;

// Tournament-root keys that are config, not tournaments.
const ROOT_META_KEYS = new Set([
  "admin",
  "adminRoles",
  "receiptUsers",
  "currentTournament",
  "testMode",
  "tournamentPostTime",
  "tournamentIncludeWeekends",
  "_schemaVersion",
  "_normalizedAt",
]);

const YOUTUBE_ID = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { apply: false, verbose: false, db: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--verbose") args.verbose = true;
    else if (arg === "--db") args.db = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

function resolveDbPath(explicit) {
  if (explicit) return path.resolve(explicit);
  const candidates = [
    path.join(process.cwd(), ".data", "db.json"),
    path.join(process.cwd(), "db.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  console.error(
    "Could not find a database. Looked for .data/db.json and ./db.json.\n" +
      "Pass one explicitly with --db <path>."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Change log
// ---------------------------------------------------------------------------

function createReport() {
  return {
    sections: new Map(),
    add(section, message) {
      if (!this.sections.has(section)) this.sections.set(section, []);
      this.sections.get(section).push(message);
    },
    count(section) {
      return this.sections.has(section) ? this.sections.get(section).length : 0;
    },
    total() {
      let sum = 0;
      for (const entries of this.sections.values()) sum += entries.length;
      return sum;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTournament(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.matches)
  );
}

function getTournaments(db) {
  const root = db && Array.isArray(db.tournaments) ? db.tournaments[0] : null;
  if (!root) return { root: null, entries: [] };
  const entries = [];
  for (const [name, value] of Object.entries(root)) {
    if (ROOT_META_KEYS.has(name)) continue;
    if (isTournament(value)) entries.push([name, value]);
  }
  return { root, entries };
}

function extractVideoId(link) {
  if (typeof link !== "string") return null;
  const match = YOUTUBE_ID.exec(link.trim());
  return match ? match[1] : null;
}

/** Any object carrying a track identity — matches, rounds pools, eliminated, brackets. */
function isEntrantLike(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.name === "string" &&
    typeof value.link === "string"
  );
}

/** Walk every entrant-like object inside a tournament, whatever collection it lives in. */
function walkEntrants(node, visit, seen = new Set()) {
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) walkEntrants(item, visit, seen);
    return;
  }

  if (isEntrantLike(node)) visit(node);

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") walkEntrants(value, visit, seen);
  }
}

function matchSides(match) {
  const sides = [];
  for (const slot of ["entrant1", "entrant2", "entrant3"]) {
    const entrant = match[slot];
    if (entrant && typeof entrant === "object" && !Array.isArray(entrant)) {
      sides.push({ slot, entrant });
    }
  }
  return sides;
}

/** Score an entrant from its ballots. 3v3 ranked weights first place 2, second 1. */
function computeScore(voters) {
  if (Array.isArray(voters)) return voters.length;
  if (voters && typeof voters === "object") {
    const first = Array.isArray(voters.first) ? voters.first.length : 0;
    const second = Array.isArray(voters.second) ? voters.second.length : 0;
    return first * 2 + second;
  }
  return null;
}

function ballotCount(voters) {
  if (Array.isArray(voters)) return voters.length;
  if (voters && typeof voters === "object") {
    const first = Array.isArray(voters.first) ? voters.first.length : 0;
    const second = Array.isArray(voters.second) ? voters.second.length : 0;
    return first + second;
  }
  return 0;
}

/** Detect the real shape of a match, since tournamentFormat cannot be trusted. */
function detectMatchFormat(match) {
  const sides = matchSides(match);
  const ranked = sides.some(
    ({ entrant }) =>
      entrant.voters &&
      !Array.isArray(entrant.voters) &&
      typeof entrant.voters === "object"
  );
  if (ranked || sides.length >= 3) return "ranked3";
  return "h2h";
}

function label(tournamentName, match) {
  return `${tournamentName} R${match.round} M${match.match}`;
}

/**
 * Loose comparison key for track/game text. The source sheets mix dash styles
 * (—, –, −, -) and carry stray newlines, so exact compares miss real matches.
 */
function loose(text) {
  return String(text == null ? "" : text)
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function truncate(text, max = 48) {
  const value = String(text == null ? "" : text);
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// ---------------------------------------------------------------------------
// Fix 1 — per-match shape descriptor
// ---------------------------------------------------------------------------

function addMatchFormats(name, tournament, report) {
  let added = 0;
  for (const match of tournament.matches) {
    const detected = detectMatchFormat(match);
    if (match.matchFormat === detected) continue;
    if (match.matchFormat === undefined) added++;
    else {
      report.add(
        "matchFormat",
        `${label(name, match)}: ${match.matchFormat} -> ${detected}`
      );
    }
    match.matchFormat = detected;
  }
  if (added) {
    report.add("additive", `${name}: matchFormat added to ${added} matches`);
  }
}

// ---------------------------------------------------------------------------
// Fix 2 — correct the declared tournament format
// ---------------------------------------------------------------------------

function fixTournamentFormat(name, tournament, report) {
  // A contest with no bracket (e.g. a ranked "Hindsight" list) carries a format
  // we cannot infer and must not overwrite.
  if (!tournament.matches.length) return;

  const counts = { h2h: 0, ranked3: 0 };
  for (const match of tournament.matches) counts[detectMatchFormat(match)]++;

  const isDoubleElim = tournament.matches.some(
    (match) => match.bracket || match.braket
  );
  let expected;
  if (counts.ranked3 > counts.h2h) expected = "3v3 Ranked";
  else if (isDoubleElim) expected = "Double Elimination";
  else expected = "Single Elimination";

  if (tournament.tournamentFormat !== expected) {
    report.add(
      "tournamentFormat",
      `${name}: ${
        tournament.tournamentFormat === undefined
          ? "(absent)"
          : `"${tournament.tournamentFormat}"`
      } -> "${expected}"  [${counts.h2h} h2h / ${counts.ranked3} ranked3]`
    );
    tournament.tournamentFormat = expected;
  }
}

// ---------------------------------------------------------------------------
// Fix 3 — round is a string everywhere
// ---------------------------------------------------------------------------

function normaliseRounds(name, tournament, report) {
  for (const match of tournament.matches) {
    if (typeof match.round === "number") {
      report.add(
        "round",
        `${name} M${match.match}: round ${match.round} (number) -> "${match.round}" (string)`
      );
      match.round = String(match.round);
    }
  }
}

// ---------------------------------------------------------------------------
// Fix 4 — braket -> bracket
// ---------------------------------------------------------------------------

function fixBracketKey(name, tournament, report) {
  for (const match of tournament.matches) {
    if (Object.prototype.hasOwnProperty.call(match, "braket")) {
      const value = match.braket;
      if (match.bracket === undefined) match.bracket = value;
      delete match.braket;
      report.add("bracket", `${label(name, match)}: braket -> bracket ("${value}")`);
    }
  }
}

// ---------------------------------------------------------------------------
// Fix 5 — videoId on every entrant
// ---------------------------------------------------------------------------

function addVideoIds(name, tournament, report) {
  let added = 0;
  walkEntrants(tournament, (entrant) => {
    const id = extractVideoId(entrant.link);
    if (id) {
      if (entrant.videoId !== id) {
        if (entrant.videoId === undefined) added++;
        entrant.videoId = id;
      }
    } else {
      if (entrant.videoId === undefined) added++;
      entrant.videoId = null;
      report.add(
        "unresolvableLink",
        `${name}: "${truncate(entrant.name)}" — link is not a YouTube URL: ${truncate(
          entrant.link,
          60
        )}`
      );
    }
  });
  if (added) {
    report.add("additive", `${name}: videoId added to ${added} entrants`);
  }
}

// ---------------------------------------------------------------------------
// Fix 6 — fold type/contest into namespaced tags
// ---------------------------------------------------------------------------

function addTags(name, tournament, report) {
  let tagged = 0;
  let added = 0;
  walkEntrants(tournament, (entrant) => {
    const tags = [];
    if (typeof entrant.type === "string" && entrant.type.trim()) {
      tags.push(`theme:${entrant.type.trim()}`);
    }
    if (entrant.contest !== undefined && String(entrant.contest).trim()) {
      tags.push(`contest:${String(entrant.contest).trim()}`);
    }
    const existing = Array.isArray(entrant.tags) ? entrant.tags : null;
    const changed =
      !existing ||
      existing.length !== tags.length ||
      tags.some((tag, i) => existing[i] !== tag);
    if (changed) {
      entrant.tags = tags;
      added++;
      if (tags.length) tagged++;
    }
  });
  if (added) {
    report.add(
      "additive",
      `${name}: tags[] added to ${added} entrants (${tagged} non-empty)`
    );
  }
}

// ---------------------------------------------------------------------------
// Fix 7 — reconcile points against the ballots
// ---------------------------------------------------------------------------

function reconcilePoints(name, tournament, report) {
  walkEntrants(tournament, (entrant) => {
    if (entrant.voters === undefined || entrant.points === undefined) return;
    const computed = computeScore(entrant.voters);
    if (computed === null) return;
    const stored = Number(entrant.points);
    if (stored === computed) return;
    if (entrant.pointsOriginal !== undefined) return; // already reconciled

    entrant.pointsOriginal = entrant.points;
    entrant.points = computed;
    report.add(
      "points",
      `${name}: "${truncate(entrant.name)}" points ${stored} -> ${computed} ` +
        `(original preserved as pointsOriginal)`
    );
  });
}

// ---------------------------------------------------------------------------
// Fix 8 — retire dead placeholder matches (never the live tournament)
// ---------------------------------------------------------------------------

function retireDeadMatches(name, tournament, report, isCurrent) {
  for (const match of tournament.matches) {
    if (match.progress !== "in-progress") continue;

    const sides = matchSides(match);
    const ballots = sides.reduce(
      (sum, { entrant }) => sum + ballotCount(entrant.voters),
      0
    );
    if (ballots > 0) continue; // real, open match — leave it alone

    if (isCurrent) {
      report.add(
        "skipped",
        `${label(name, match)}: 0 ballots but this is the ACTIVE tournament — left as in-progress`
      );
      continue;
    }

    const names = sides.map(({ entrant }) => entrant.name);
    const selfMatch =
      names.length === 2 && names[0] && names[0] === names[1]
        ? " (same entrant on both sides)"
        : "";
    match.progress = "abandoned";
    report.add(
      "abandoned",
      `${label(name, match)}: in-progress with 0 ballots${selfMatch} -> abandoned`
    );
  }
}

// ---------------------------------------------------------------------------
// Fix 9 — track identity conflicts across contests
// ---------------------------------------------------------------------------

function collectIdentities(entries) {
  const byVideoId = new Map();
  for (const [name, tournament] of entries) {
    walkEntrants(tournament, (entrant) => {
      const id = extractVideoId(entrant.link);
      if (!id) return;
      if (!byVideoId.has(id)) byVideoId.set(id, []);
      byVideoId.get(id).push({ tournament: name, entrant });
    });
  }
  return byVideoId;
}

function canonicaliseIdentities(byVideoId, report) {
  for (const [id, occurrences] of byVideoId) {
    const variants = new Map();
    for (const occurrence of occurrences) {
      const key = `${occurrence.entrant.name}\u0000${occurrence.entrant.title}`;
      if (!variants.has(key)) variants.set(key, []);
      variants.get(key).push(occurrence);
    }
    if (variants.size < 2) continue;

    const forms = [...variants.entries()].map(([key, group]) => {
      const [name, title] = key.split("\u0000");
      return { name, title, group, count: group.length };
    });

    // Case/whitespace-only differences: safe to canonicalise to the most common form.
    const fingerprint = (form) => `${loose(form.name)}\u0000${loose(form.title)}`;
    const distinct = new Set(forms.map(fingerprint));

    if (distinct.size === 1) {
      const winner = forms.slice().sort((a, b) => b.count - a.count)[0];
      for (const form of forms) {
        if (form === winner) continue;
        for (const occurrence of form.group) {
          occurrence.entrant.name = winner.name;
          occurrence.entrant.title = winner.title;
        }
        report.add(
          "identityFixed",
          `${id}: "${truncate(form.name, 32)}" -> "${truncate(winner.name, 32)}" (case/whitespace)`
        );
      }
      continue;
    }

    // name/title swapped between contests — report, do not guess.
    // Compare loosely: these differ by dash style and stray newlines from the
    // source sheets, so an exact compare misses real swaps.
    const swapped = forms.some((a) =>
      forms.some(
        (b) =>
          a !== b &&
          loose(a.name) === loose(b.title) &&
          loose(a.title) === loose(b.name)
      )
    );

    report.add(
      swapped ? "identitySwapped" : "identityConflict",
      `${id}: ${forms
        .map((f) => `["${truncate(f.name, 28)}" / "${truncate(f.title, 28)}"]`)
        .join(" vs ")}`
    );
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function normalise(db, report) {
  const { root, entries } = getTournaments(db);
  if (!root) {
    console.error("No tournaments[0] object found — is this the right database?");
    process.exit(1);
  }

  const current = root.currentTournament;

  for (const [name, tournament] of entries) {
    const isCurrent = name === current;
    fixBracketKey(name, tournament, report);
    normaliseRounds(name, tournament, report);
    addMatchFormats(name, tournament, report);
    fixTournamentFormat(name, tournament, report);
    addVideoIds(name, tournament, report);
    addTags(name, tournament, report);
    reconcilePoints(name, tournament, report);
    retireDeadMatches(name, tournament, report, isCurrent);
  }

  canonicaliseIdentities(collectIdentities(entries), report);

  root._schemaVersion = SCHEMA_VERSION;
  root._normalizedAt = new Date().toISOString();

  return entries;
}

const SECTION_TITLES = [
  ["additive", "Added new fields (no existing field changed)"],
  ["bracket", "Renamed braket -> bracket"],
  ["round", "Coerced round to string"],
  ["matchFormat", "Corrected matchFormat"],
  ["tournamentFormat", "Corrected tournamentFormat"],
  ["tags", "Added tags[]"],
  ["points", "Reconciled points against ballots"],
  ["abandoned", "Retired dead placeholder matches"],
  ["identityFixed", "Canonicalised track names (case/whitespace)"],
  ["identitySwapped", "NEEDS REVIEW — name/title appear swapped"],
  ["identityConflict", "NEEDS REVIEW — one video, different tracks"],
  ["unresolvableLink", "NEEDS REVIEW — link is not a YouTube URL"],
  ["skipped", "Deliberately left alone"],
];

const REVIEW_ONLY = new Set([
  "identitySwapped",
  "identityConflict",
  "unresolvableLink",
  "skipped",
]);

function printReport(report, verbose) {
  for (const [key, title] of SECTION_TITLES) {
    const entries = report.sections.get(key);
    if (!entries || !entries.length) continue;
    console.log(`\n${title} — ${entries.length}`);
    const shown = verbose ? entries : entries.slice(0, 8);
    for (const entry of shown) console.log(`  · ${entry}`);
    if (shown.length < entries.length) {
      console.log(`  … ${entries.length - shown.length} more (--verbose to list)`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
    return;
  }

  const dbPath = resolveDbPath(args.db);
  const raw = fs.readFileSync(dbPath, "utf8");
  const db = JSON.parse(raw);

  const previousVersion =
    db.tournaments && db.tournaments[0]
      ? db.tournaments[0]._schemaVersion
      : undefined;

  console.log(`Database : ${dbPath}`);
  console.log(`Size     : ${(raw.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `Schema   : ${previousVersion === undefined ? "unversioned (never normalised)" : `v${previousVersion}`}`
  );

  const report = createReport();
  const entries = normalise(db, report);
  const current =
    db.tournaments[0].currentTournament || "(none)";

  console.log(`Contests : ${entries.length}`);
  console.log(`Active   : ${current}`);

  printReport(report, args.verbose);

  let mutations = 0;
  for (const [key, entries_] of report.sections) {
    if (!REVIEW_ONLY.has(key)) mutations += entries_.length;
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`Changes to write : ${mutations}`);
  console.log(
    `Flagged for review : ${
      report.count("identitySwapped") +
      report.count("identityConflict") +
      report.count("unresolvableLink")
    } (not auto-fixed)`
  );

  if (!args.apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${dbPath}.bak-${stamp}`;
  fs.writeFileSync(backupPath, raw, "utf8");
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");

  console.log(`\nBackup written : ${backupPath}`);
  console.log(`Database written : ${dbPath}`);
  if (report.count("bracket") > 0) {
    console.log(
      "\n`braket` has been renamed to `bracket`. The bot code already handles\n" +
        "this — new matches are written as `bracket`, and the three read sites\n" +
        "fall back to `braket` so an un-migrated database still loads:\n" +
        "  public/tournament/doubleElim/doubleElimTournament.js:120 (write), :242 (read)\n" +
        "  public/tournament/doubleElim/doubleelimtournamentmessages.js:377 (read)\n" +
        "  public/commands/tournamentCommands/resendCurrentMatches.js:195 (read)\n" +
        "Deploy the code and this database together."
    );
  }
}

main();
