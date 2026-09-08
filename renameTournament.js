#!/usr/bin/env node
/**
 * Rename a tournament everywhere it is keyed by name.
 *
 * A tournament's name is its key, not a label: db.json stores each contest
 * under it, compatibility.json stores the precomputed pairings under it, and
 * currentTournament points at it by name. Renaming by hand in one file and not
 * the others silently detaches the compatibility data from the contest, so this
 * does all of them together or none of them.
 *
 *   node renameTournament.js "Old Name" "New Name"
 *   node renameTournament.js "Old Name" "New Name" --db .data/db.json --compat .data/compatibility.json
 *   node renameTournament.js "Old Name" "New Name" --dry-run
 *
 * Writes a timestamped .bak beside each file it changes.
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { db: "db.json", compat: "compatibility.json", dryRun: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--db") args.db = argv[++i];
    else if (arg === "--compat") args.compat = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
    else args.rest.push(arg);
  }
  return args;
}

/** Rebuild an object with one key renamed, keeping the original ordering. */
function renameKey(object, from, to) {
  if (!object || !Object.prototype.hasOwnProperty.call(object, from)) return null;
  const rebuilt = {};
  for (const key of Object.keys(object)) {
    if (key === from) rebuilt[to] = object[from];
    else rebuilt[key] = object[key];
  }
  return rebuilt;
}

function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, target);
  return target;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [from, to] = args.rest;
  if (!from || !to) {
    console.error('usage: node renameTournament.js "Old Name" "New Name"');
    process.exit(1);
  }

  const changes = [];

  // ---- db.json ------------------------------------------------------------
  const dbPath = path.resolve(args.db);
  if (fs.existsSync(dbPath)) {
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    const root = Array.isArray(db.tournaments) ? db.tournaments[0] : null;
    if (root && Object.prototype.hasOwnProperty.call(root, from)) {
      if (Object.prototype.hasOwnProperty.call(root, to)) {
        console.error(`${dbPath}: "${to}" already exists — refusing to merge two contests`);
        process.exit(1);
      }
      db.tournaments[0] = renameKey(root, from, to);
      if (db.tournaments[0].currentTournament === from) {
        db.tournaments[0].currentTournament = to;
        changes.push(`${args.db}: currentTournament repointed`);
      }
      changes.push(`${args.db}: tournament key renamed`);
      if (!args.dryRun) {
        console.log("  backup:", backup(dbPath));
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
      }
    } else {
      changes.push(`${args.db}: no tournament called "${from}"`);
    }
  } else {
    changes.push(`${args.db}: not found`);
  }

  // ---- compatibility.json -------------------------------------------------
  const compatPath = path.resolve(args.compat);
  if (fs.existsSync(compatPath)) {
    const compat = JSON.parse(fs.readFileSync(compatPath, "utf8"));
    if (compat.tournaments && Object.prototype.hasOwnProperty.call(compat.tournaments, from)) {
      compat.tournaments = renameKey(compat.tournaments, from, to);
      changes.push(`${args.compat}: tournament key renamed`);
      if (!args.dryRun) {
        console.log("  backup:", backup(compatPath));
        fs.writeFileSync(compatPath, JSON.stringify(compat, null, 2), "utf8");
      }
    } else {
      changes.push(`${args.compat}: no entry for "${from}"`);
    }
  } else {
    changes.push(`${args.compat}: not found`);
  }

  console.log(`\n"${from}"  ->  "${to}"`);
  for (const line of changes) console.log("  " + line);
  if (args.dryRun) console.log("\n--dry-run: nothing written.");
}

main();
