#!/usr/bin/env node
/**
 * Rebuild individual matches from their original Discord messages.
 *
 * The historical import missed a handful of matches -- the Favorites bracket is
 * short four, all of them losers-bracket or later-round results that Challonge
 * still has. Their voters are recoverable, because the reaction lists are in the
 * channel dumps.
 *
 * Reuses parseHistory.js's own extractors and tally rather than reimplementing
 * them, so a match recovered here is built exactly the way the rest of the
 * archive was. That file is a script rather than a module, so its trailing
 * main() call is stripped before evaluating it.
 *
 *   node recoverMatches.js --spec recover.json
 *   node recoverMatches.js --spec recover.json --write --tournament "Favorites of the Best VGM List"
 *
 * The spec is a list of the matches to rebuild:
 *   [{ "message": "875432976861790279", "channel": "828700869658673222",
 *      "round": 2, "match": 72, "expect": "29-8" }]
 *
 * `expect` is optional; when given, the rebuilt tally is checked against it and
 * a mismatch is reported rather than written. Reads the channel dump under
 * history-dump/; if the channel has not been dumped, run:
 *
 *   node dumpChannels.js --channel <id>
 */

const fs = require("fs");
const path = require("path");

const DUMP_DIR = "history-dump";

// ---------------------------------------------------------------------------
// Borrow the historical parser
// ---------------------------------------------------------------------------

function loadParser() {
  const source = fs.readFileSync("parseHistory.js", "utf8");
  // the script self-executes, and its shebang is not valid inside a function
  const stripped = source
    .replace(/^#![^\n]*\n/, "")
    .replace(/\n\s*main\(\);\s*$/, "\n");
  const sandbox = {};
  const factory = new Function(
    "module",
    "exports",
    "require",
    "__dirname",
    "__filename",
    "process",
    stripped +
      "\n;module.exports = { extractEntrants, tallyPickOne, tallyRanked3," +
      " buildMatch, splitNameTitle, videoId, stripDecoration, EXTRACTORS };"
  );
  const mod = { exports: sandbox };
  factory(mod, sandbox, require, process.cwd(), "parseHistory.js", process);
  return mod.exports;
}

/**
 * Look for the message in any dump we hold: the per-channel files, plus
 * anything fetchMessages.js has written. That second source is how a message
 * from a channel nobody has dumped gets here.
 */
function candidateFiles(channelId, extra) {
  const files = [];
  if (extra) files.push(extra);
  files.push(path.join(DUMP_DIR, `${channelId}.jsonl`));
  if (fs.existsSync(DUMP_DIR)) {
    for (const name of fs.readdirSync(DUMP_DIR)) {
      if (name.endsWith(".jsonl")) files.push(path.join(DUMP_DIR, name));
    }
  }
  if (fs.existsSync("recovered-messages.jsonl")) files.push("recovered-messages.jsonl");
  return [...new Set(files)].filter((f) => fs.existsSync(f));
}

function loadMessage(channelId, messageId, extra) {
  const files = candidateFiles(channelId, extra);
  if (!files.length) {
    return { error: `nothing to read -- run: node fetchMessages.js --spec <spec>` };
  }
  for (const file of files) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        continue;
      }
      if (message.id === messageId) return { message, file };
    }
  }
  return {
    error: `message ${messageId} not in any dump -- run: node fetchMessages.js --message ${messageId} --channel ${channelId}`,
  };
}

/**
 * A fallback for entrant lines the archive's extractors miss.
 *
 * Some posters bolded the whole line -- "**1. Rescue Girl (Credits)**" with the
 * link beneath. stripDecoration eats the closing marker and pulls the link up
 * onto the same line, leaving "1. Rescue Girl (Credits) https://..." with no
 * colon: markerNewline wants a line break, numberColon wants a colon, and
 * neither matches.
 *
 * Kept here rather than added to parseHistory.js, because loosening a shared
 * extractor would change how every previously imported contest reads.
 */
function looseNumbered(parser, raw) {
  const text = parser.stripDecoration(raw);
  const found = [
    ...text.matchAll(/^\s*([0-9A-Z])[.)]\s*(.+?)\s*:?\s+<?(https?:\/\/\S+?)>?\s*$/gm),
  ].map((m) => ({ marker: m[1], raw: m[2], link: m[3] }));
  return { entrants: found.length >= 2 ? found : [], strategy: "looseNumbered" };
}

function parseArgs(argv) {
  const args = { spec: null, write: false, tournament: null, db: "db.json", messages: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--spec") args.spec = argv[++i];
    else if (arg === "--write") args.write = true;
    else if (arg === "--tournament") args.tournament = argv[++i];
    else if (arg === "--db") args.db = argv[++i];
    else if (arg === "--messages") args.messages = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.spec) {
    console.error("usage: node recoverMatches.js --spec recover.json [--write --tournament NAME]");
    process.exit(1);
  }

  const parser = loadParser();
  const spec = JSON.parse(fs.readFileSync(args.spec, "utf8"));
  const issues = [];
  const rebuilt = [];

  for (const item of spec) {
    const loaded = loadMessage(item.channel, item.message, args.messages);
    if (loaded.error) {
      console.log(`  SKIP ${item.message}: ${loaded.error}`);
      continue;
    }
    const message = loaded.message;

    // the same strategies the favlist contest is configured with in
    // parseHistory.js, so a recovered match is read exactly as its siblings were
    const strategies = item.entrants || ["numberColon", "markerNewline"];
    let read = parser.extractEntrants(message.content || "", strategies);
    if (read.entrants.length < 2) read = looseNumbered(parser, message.content || "");
    const entrants = read.entrants;
    if (!entrants || entrants.length < 2) {
      console.log(`  SKIP ${item.message}: could not read the combatants`);
      continue;
    }

    const ctx = {
      round: item.round == null ? null : item.round,
      match: item.match,
      messageId: message.id,
      channelId: message.channelId,
      createdAt: message.createdAt,
    };
    const tally = parser.tallyPickOne(message.reactions || [], entrants, issues, ctx);
    const match = parser.buildMatch(ctx, entrants, tally, "pick-one");

    const scores = (match.entrant1 ? [match.entrant1] : [])
      .concat(match.entrant2 ? [match.entrant2] : [])
      .concat(match.entrant3 ? [match.entrant3] : [])
      .concat(match.entrant4 ? [match.entrant4] : []);
    const line = scores.map((e) => `${e.name} ${e.points}`).join("  vs  ");
    const got = scores.map((e) => e.points).join("-");
    const ok = !item.expect || item.expect === got;

    console.log(`  ${ok ? "ok  " : "DIFF"} ${item.message}  ${line}` +
      (item.expect ? `   challonge ${item.expect}, rebuilt ${got}` : ""));
    rebuilt.push({ item, match, got, ok });
  }

  console.log(`\n${rebuilt.length} match(es) rebuilt, ${rebuilt.filter((r) => !r.ok).length} disagreeing with Challonge`);
  fs.writeFileSync("recovered.json", JSON.stringify(rebuilt.map((r) => r.match), null, 2), "utf8");
  console.log("written to recovered.json for review");

  if (!args.write) {
    console.log("\nnothing added to the database -- pass --write --tournament NAME to apply.");
    return;
  }
  if (!args.tournament) {
    console.error("--write needs --tournament NAME");
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(args.db, "utf8"));
  const root = Array.isArray(db.tournaments) ? db.tournaments[0] : null;
  const tournament = root && root[args.tournament];
  if (!tournament) {
    console.error(`no tournament called "${args.tournament}" in ${args.db}`);
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(args.db, `${args.db}.bak-${stamp}`);
  console.log(`  backup: ${args.db}.bak-${stamp}`);

  let added = 0;
  for (const entry of rebuilt) {
    const exists = tournament.matches.some(
      (m) => m && String(m.match) === String(entry.match.match)
    );
    if (exists) {
      console.log(`  match ${entry.match.match} already present, skipped`);
      continue;
    }
    tournament.matches.push(entry.match);
    added += 1;
  }
  fs.writeFileSync(args.db, JSON.stringify(db, null, 2), "utf8");
  console.log(`  added ${added} match(es) to "${args.tournament}"`);
  console.log("\nRebuild compatibility afterwards: node backfillCompatibility.js");
}

main();
