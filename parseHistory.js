#!/usr/bin/env node
/**
 * parseHistory.js — phase 2 of the historical tournament import.
 *
 * Reads the raw dump written by dumpChannels.js and emits ONE JSON FILE PER
 * TOURNAMENT, shaped so it can be merged into db.json. It writes nothing into
 * db.json itself — review the output, fix what needs fixing, then merge.
 *
 * Anything it cannot parse confidently is recorded in issue.log rather than
 * guessed at. A clean run still produces issues; that is the point.
 *
 * Usage:
 *   node parseHistory.js                    # parse everything -> parsed/ + issue.log
 *   node parseHistory.js --list             # show configured contests, parse nothing
 *   node parseHistory.js --only forest      # one contest by id
 *   node parseHistory.js --out parsed       # output directory
 *   node parseHistory.js --verbose          # print each match as it is parsed
 *
 * Voter identity:
 *   Reaction-voted contests yield real Discord user IDs.
 *   Log-embed contests yield DISPLAY NAMES, emitted as {"unresolved": "Name"}
 *   for a later pass to resolve against members.json.
 */

const fs = require("fs");
const path = require("path");

const DUMP_DIR = "history-dump";

// ---------------------------------------------------------------------------
// Emoji vocabulary
// ---------------------------------------------------------------------------

/**
 * Emoji -> the entrant MARKER it refers to ("A", "3", ...). Deliberately not an
 * array index: if one entrant line fails to parse, index-based mapping shifts
 * every later vote onto the wrong track without any error.
 */
const SLOT_EMOJI = {
  "1\uFE0F\u20E3": "1", "2\uFE0F\u20E3": "2", "3\uFE0F\u20E3": "3",
  "4\uFE0F\u20E3": "4", "5\uFE0F\u20E3": "5", "6\uFE0F\u20E3": "6",
  "7\uFE0F\u20E3": "7", "8\uFE0F\u20E3": "8", "9\uFE0F\u20E3": "9",
  "\u{1F170}\uFE0F": "A", "\u{1F171}\uFE0F": "B",
  "\u{1F1E6}": "A", "\u{1F1E7}": "B", "\u{1F1E8}": "C", "\u{1F1E9}": "D",
  "\u{1F1EA}": "E", "\u{1F1EB}": "F", "\u{1F1EC}": "G", "\u{1F1ED}": "H",
  // Tiebreak alphabets used in the 2020/2021 awards
  "\u{1F1FC}": "W", "\u{1F1FD}": "X", "\u{1F1FE}": "Y", "\u{1F1FF}": "Z",
  "\u{1F1F1}": "L",
};

/** Normalise an entrant marker so "1\uFE0F\u20E3" and "1" compare equal. */
function normMarker(marker) {
  const m = String(marker || "").trim();
  return SLOT_EMOJI[m] || m.replace(/[\uFE0F\u20E3]/g, "").toUpperCase();
}

/** 2022's ranked scheme: emoji -> [firstChoiceSlot, secondChoiceSlot]. */
const RANKED3 = {
  "1️⃣": [0, 1], "2️⃣": [0, 2], "3️⃣": [1, 0],
  "4️⃣": [1, 2], "5️⃣": [2, 0], "6️⃣": [2, 1],
};

// ---------------------------------------------------------------------------
// Contest configuration
//
// Segmented from the dump by channel + author + date range. Ranges are
// inclusive and deliberately explicit: auto-detection across five years of
// mixed chatter is not worth the false positives.
// ---------------------------------------------------------------------------

const CONTESTS = [
  {
    id: "bvgm2020",
    name: "Best VGM 2020 Awards",
    channel: "785547515998109696",
    author: "supradarky",
    from: "2020-12-07", to: "2021-01-26",
    vote: "pick-one",
    entrants: ["markerParen", "numberColon"],
    note: "R1 4-way, R2 3-way, then head-to-head. Late rounds use 🇾/🇿.",
  },
  {
    id: "bvgm2021",
    name: "Best VGM 2021 Awards",
    channel: "920706746912243742",
    author: null, // supradarky + two guest posts
    from: "2022-01-19", to: "2022-04-09",
    vote: "pick-one",
    entrants: ["markerParen"],
    note: "Pick one of A-D. Round 2 onward uses 🇽/🇾/🇿.",
  },
  {
    id: "bvgm2022",
    name: "Best VGM 2022 Awards",
    channel: "1070816116072521859",
    author: "supradarky",
    from: "2023-02-14", to: "2023-03-25",
    vote: "ranked3",
    entrants: ["markerParen"],
    note:
      "Battles 1-29 only. Battle 30+ moved to bot buttons; those results come " +
      "from majordomo-logs and carry no per-user votes.",
  },
  {
    id: "favlist",
    name: "Favorite Best VGM List Bracket",
    channel: "828700869658673222",
    author: "kamakazikila",
    from: "2021-07-30", to: "2021-10-13",
    vote: "pick-one",
    entrants: ["numberColon", "markerNewline"],
    note: "Day-numbered. Mostly head-to-head; some 3- and 4-way days.",
  },
  {
    id: "unevenbracket",
    name: "Uneven Bracket Contest 2022",
    channel: "828700869658673222",
    author: null, // kamakazikila + maxgalactica
    from: "2022-07-27", to: "2022-08-22",
    vote: "dual",
    entrants: ["numberColon"],
    note:
      "TWO matches per message: numbered 1/2 is match 'a', lettered A/B is " +
      "match 'b'. First message is a poll about bracket format, not a match.",
  },
  {
    id: "forest",
    name: "Forest VGM Tournament",
    channel: "828700869658673222",
    author: "mihark",
    from: "2022-09-27", to: "2022-10-29",
    vote: "pick-one",
    entrants: ["numberBoldColon"],
    note: "3-way through day 16, head-to-head from day 17. Carries composer and loop metadata.",
  },
];

// ---------------------------------------------------------------------------
// Entrant extraction
// ---------------------------------------------------------------------------

const YOUTUBE_ID = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/;

const EXTRACTORS = {
  // A. Some Track - Some Game (https://youtu.be/xxxx)
  // 1. Some Track - Some Game (https://youtu.be/xxxx)
  markerParen: (text) =>
    [...text.matchAll(/^\s*(?:([0-9A-Z])[.)]|([1-9]\uFE0F?\u20E3))\s*(.+?)\s*\(<?(https?:\/\/[^\s)>]+)>?\)/gm)].map(
      (m) => ({ marker: m[1] || m[2], raw: m[3], link: m[4] })
    ),
  // 1. **Some Track** : https://youtu.be/xxxx
  numberBoldColon: (text) =>
    [...text.matchAll(/^\s*(?:(\d)[.)]|([1-9]️⃣))\s*\*\*(.+?)\*\*\s*:?\s*<?(https?:\/\/[^\s>]+)>?/gm)].map(
      (m) => ({ marker: m[1] || m[2], raw: m[3], link: m[4] })
    ),
  // 1. Some Track: https://youtu.be/xxxx      (link on the same line)
  numberColon: (text) =>
    [...text.matchAll(/^\s*([0-9A-Z])[.)]\s*(.+?)\s*:\s*<?(https?:\/\/[^\s>]+)>?/gm)].map(
      (m) => ({ marker: m[1], raw: m[2], link: m[3] })
    ),
  // 1. Some Track:            or   1. Some Track
  //    https://youtu.be/xxxx           https://youtu.be/xxxx
  markerNewline: (text) =>
    [...text.matchAll(/^\s*([0-9A-Z])[.)]\s*(.+?)\s*:?\s*\n\s*<?(https?:\/\/[^\s>]+)>?/gm)].map(
      (m) => ({ marker: m[1], raw: m[2], link: m[3] })
    ),
};

/**
 * Spoiler bars, strikethrough and emphasis get wrapped around whole entrant
 * lines by some posters. None of it carries meaning for us.
 */
function stripDecoration(text) {
  return text
    .replace(/\|\|/g, "")
    .replace(/~~/g, "")
    .replace(/^([ \t]*)\*{1,3}\s*(?=[0-9A-Z][.)])/gm, "$1")
    .replace(/\*{1,3}\s*(?=\s*https?:\/\/)/g, " ");
}

function extractEntrants(raw, strategies) {
  const text = stripDecoration(raw);
  for (const name of strategies) {
    const found = EXTRACTORS[name](text);
    if (found.length >= 2) return { entrants: dedupe(found), strategy: name };
  }
  return { entrants: [], strategy: null };
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = `${item.marker}|${item.link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * These contests write "Game - Track" and "Track - Game" interchangeably, and
 * db.json is inconsistent about it too. Split on the first " - " and record
 * both halves without asserting which is which; the merge step can decide.
 */
function splitNameTitle(raw) {
  const clean = raw.replace(/\*\*/g, "").trim();
  const dash = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (!dash) return { name: clean, title: "", ambiguous: true };
  return { name: dash[2].trim(), title: dash[1].trim(), ambiguous: false };
}

function videoId(link) {
  const m = YOUTUBE_ID.exec(link || "");
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Match-label extraction
// ---------------------------------------------------------------------------

/** Whatever the poster called this match. Kept verbatim for human review. */
function matchLabel(text) {
  const patterns = [
    /\*\*Round\s*(\d+),\s*Battle\s*(\d+)\s*:?\*\*/i,
    /Round\s*(\d+)\s*[-,]\s*Battle:?\s*(\d+)/i,
    /\bday\s*(\d+)\s*([ab])\b/i,
    /\bday\s*(\d+)/i,
    /\*\*(Grand Finals?|Finals?|Semi-?finals?|Quarter-?finals?)\*\*/i,
    /\b(grand finals?|semi-?finals?|quarter-?finals?)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return { label: m[0].replace(/\*\*/g, "").trim(), groups: m.slice(1) };
  }
  return { label: null, groups: [] };
}

function inferRoundMatch(label, groups, fallbackIndex) {
  if (!label) return { round: null, match: fallbackIndex, confident: false };
  if (/round/i.test(label) && groups.length >= 2) {
    return { round: parseInt(groups[0], 10), match: parseInt(groups[1], 10), confident: true };
  }
  if (/day/i.test(label) && groups.length >= 1 && /^\d+$/.test(groups[0])) {
    return { round: null, match: parseInt(groups[0], 10), confident: false };
  }
  return { round: null, match: fallbackIndex, confident: false };
}

// ---------------------------------------------------------------------------
// Vote tallying
// ---------------------------------------------------------------------------

/**
 * The original scraper discarded anyone who reacted more than once entirely —
 * not counted twice, not counted once. Replicated here so the numbers match.
 */
function findMultiReactors(reactions, vocabulary) {
  const counts = new Map();
  for (const r of reactions) {
    if (!(r.name in vocabulary)) continue;
    for (const u of r.users) counts.set(u, (counts.get(u) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([u]) => u));
}

function tallyPickOne(reactions, entrants, issues, ctx) {
  const used = reactions.filter((r) => r.name in SLOT_EMOJI);
  const dropped = findMultiReactors(used, SLOT_EMOJI);
  const byMarker = new Map(entrants.map((e, i) => [normMarker(e.marker), i]));
  const voters = entrants.map(() => []);
  let counted = 0;

  for (const r of used) {
    const marker = SLOT_EMOJI[r.name];
    const slot = byMarker.get(marker);
    if (slot === undefined) {
      issues.push({
        ...ctx,
        kind: "emoji-no-entrant",
        detail:
          `${r.name} means entrant "${marker}" but the message only yielded ` +
          `[${[...byMarker.keys()].join(", ")}] — ${r.count} votes not counted`,
      });
      continue;
    }
    for (const u of r.users) {
      if (dropped.has(u)) continue;
      voters[slot].push(u);
      counted++;
    }
  }
  return { voters, counted, dropped: dropped.size };
}

function tallyRanked3(reactions, entrants, issues, ctx) {
  const used = reactions.filter((r) => r.name in RANKED3);
  const dropped = findMultiReactors(used, RANKED3);
  const first = entrants.map(() => []);
  const second = entrants.map(() => []);
  let counted = 0;

  for (const r of used) {
    const [f, s] = RANKED3[r.name];
    if (f >= entrants.length || s >= entrants.length) {
      issues.push({
        ...ctx,
        kind: "emoji-no-entrant",
        detail: `${r.name} needs 3 entrants, found ${entrants.length}`,
      });
      continue;
    }
    for (const u of r.users) {
      if (dropped.has(u)) continue;
      first[f].push(u);
      second[s].push(u);
      counted++;
    }
  }
  return { first, second, counted, dropped: dropped.size };
}

// ---------------------------------------------------------------------------
// Building db.json-shaped matches
// ---------------------------------------------------------------------------

function buildEntrant(item, voters, points) {
  const { name, title } = splitNameTitle(item.raw);
  return {
    name,
    title,
    link: item.link,
    videoId: videoId(item.link),
    tags: [],
    voters,
    points,
  };
}

function buildMatch(ctx, entrants, tally, mode) {
  const match = {
    round: ctx.round == null ? null : String(ctx.round),
    match: ctx.match,
    progress: "complete",
    matchFormat:
      mode === "ranked3" ? "ranked3" : entrants.length > 2 ? "multi" : "h2h",
    sourceLabel: ctx.label,
    sourceMessageId: ctx.messageId,
    completedAt: ctx.date,
  };
  entrants.forEach((item, i) => {
    let voters;
    let points;
    if (mode === "ranked3") {
      voters = { first: tally.first[i], second: tally.second[i] };
      points = tally.first[i].length * 2 + tally.second[i].length;
    } else {
      voters = tally.voters[i];
      points = voters.length;
    }
    match[`entrant${i + 1}`] = buildEntrant(item, voters, points);
  });
  if (entrants.length > 3) match.entrantsOverflow = entrants.length;
  return match;
}

// ---------------------------------------------------------------------------
// Per-contest parse
// ---------------------------------------------------------------------------

function loadChannel(channelId) {
  const file = path.join(DUMP_DIR, `${channelId}.jsonl`);
  if (!fs.existsSync(file)) return null;
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function parseContest(contest, issues, opts) {
  const all = loadChannel(contest.channel);
  if (!all) {
    issues.push({ contest: contest.id, kind: "dump-missing", detail: `no dump for channel ${contest.channel}` });
    return null;
  }

  const inRange = all.filter((m) => {
    const day = m.createdAt.slice(0, 10);
    if (day < contest.from || day > contest.to) return false;
    if (contest.author && m.author.username !== contest.author) return false;
    return m.reactions.length > 0;
  });

  const matches = [];
  let index = 0;

  for (const message of inRange) {
    const text = message.content || "";
    const { label, groups } = matchLabel(text);
    const ctxBase = {
      contest: contest.id,
      messageId: message.id,
      date: message.createdAt,
      label,
    };

    const { entrants, strategy } = extractEntrants(text, contest.entrants);

    if (entrants.length < 2) {
      const emoji = message.reactions.map((r) => r.name);
      const votey = emoji.some((e) => e in SLOT_EMOJI || e in RANKED3);
      issues.push({
        ...ctxBase,
        kind: votey ? "no-entrants-but-votes" : "not-a-match",
        detail: `${entrants.length} entrants found; reactions ${JSON.stringify(emoji)}`,
        excerpt: text.slice(0, 160).replace(/\n/g, " "),
      });
      continue;
    }

    index++;
    const rm = inferRoundMatch(label, groups, index);
    const ctx = { ...ctxBase, round: rm.round, match: rm.match };
    if (!rm.confident) {
      issues.push({
        ...ctx,
        kind: "round-unknown",
        detail: label ? `only "${label}" to go on; match number assigned sequentially` : "no round/day label found",
      });
    }

    if (contest.vote === "dual") {
      const numbered = entrants.filter((e) => /^[0-9]$/.test(e.marker));
      const lettered = entrants.filter((e) => /^[A-Z]$/.test(e.marker));
      for (const [group, emojiSet, suffix] of [
        [numbered, ["1️⃣", "2️⃣", "3️⃣", "4️⃣"], "a"],
        [lettered, ["🅰️", "🅱️"], "b"],
      ]) {
        if (group.length < 2) continue;
        const subset = message.reactions.filter((r) => emojiSet.includes(r.name));
        if (!subset.length) continue;
        const tally = tallyPickOne(subset, group, issues, ctx);
        const m = buildMatch({ ...ctx, match: `${ctx.match}${suffix}` }, group, tally, "pick-one");
        matches.push(m);
      }
      continue;
    }

    if (contest.vote === "ranked3") {
      if (entrants.length !== 3) {
        issues.push({ ...ctx, kind: "ranked3-wrong-arity", detail: `${entrants.length} entrants` });
        continue;
      }
      const tally = tallyRanked3(message.reactions, entrants, issues, ctx);
      if (!tally.counted) {
        issues.push({ ...ctx, kind: "no-votes-counted", detail: "no 1-6 reactions" });
        continue;
      }
      matches.push(buildMatch(ctx, entrants, tally, "ranked3"));
      continue;
    }

    const tally = tallyPickOne(message.reactions, entrants, issues, ctx);
    if (!tally.counted) {
      issues.push({
        ...ctx,
        kind: "no-votes-counted",
        detail: `reactions ${JSON.stringify(message.reactions.map((r) => r.name))} match no known slot emoji`,
      });
      continue;
    }
    if (tally.dropped) {
      issues.push({ ...ctx, kind: "multi-reactors-dropped", detail: `${tally.dropped} voters reacted more than once` });
    }
    matches.push(buildMatch(ctx, entrants, tally, "pick-one"));

    if (opts.verbose) {
      const names = entrants.map((e) => splitNameTitle(e.raw).name).join(" vs ");
      console.log(`  [${contest.id}] ${label || "?"} — ${names} (${strategy})`);
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function summarise(matches) {
  const voters = new Set();
  let ballots = 0;
  for (const m of matches) {
    for (const key of ["entrant1", "entrant2", "entrant3"]) {
      const e = m[key];
      if (!e) continue;
      if (Array.isArray(e.voters)) {
        e.voters.forEach((v) => voters.add(v));
        ballots += e.voters.length;
      } else if (e.voters) {
        (e.voters.first || []).forEach((v) => voters.add(v));
        ballots += (e.voters.first || []).length;
      }
    }
  }
  return { matches: matches.length, ballots, voters: voters.size };
}

function writeContest(contest, matches, outDir) {
  const stats = summarise(matches);
  const payload = {
    tournament: contest.name,
    source: {
      channel: contest.channel,
      author: contest.author,
      range: [contest.from, contest.to],
      note: contest.note || null,
      parsedAt: new Date().toISOString(),
      parser: "parseHistory.js",
    },
    stats,
    data: {
      tournamentFormat: "Single Elimination",
      isHistorical: true,
      hasBallots: stats.ballots > 0,
      startingMatchCount: null,
      round: null,
      matchNumber: matches.length,
      roundsPerTurn: 1,
      matches,
      rounds: {},
      eliminated: [],
      final: [],
    },
  };
  const file = path.join(outDir, `${contest.id}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return { file, stats };
}

function writeIssues(issues, file) {
  // Kinds that need a human decision get full detail; the rest roll up.
  const NEEDS_REVIEW = new Set([
    "no-entrants-but-votes",
    "emoji-no-entrant",
    "ranked3-wrong-arity",
    "no-votes-counted",
    "dump-missing",
  ]);

  const byContest = new Map();
  for (const i of issues) {
    if (!byContest.has(i.contest)) byContest.set(i.contest, []);
    byContest.get(i.contest).push(i);
  }

  const lines = [
    "issue.log — parseHistory.js",
    `generated ${new Date().toISOString()}`,
    "",
    "REVIEW sections are things the parser refused to guess at — each one is a",
    "match that did NOT make it into the output, or votes that were ignored.",
    "INFO sections are recorded so the numbers can be reconciled; no action needed",
    "unless something looks wrong.",
    "",
  ];

  for (const [contest, list] of byContest) {
    const kinds = new Map();
    for (const i of list) {
      if (!kinds.has(i.kind)) kinds.set(i.kind, []);
      kinds.get(i.kind).push(i);
    }
    lines.push("=".repeat(72));
    lines.push(`${contest} — ${list.length} issues`);
    lines.push("=".repeat(72));

    for (const [kind, group] of [...kinds].filter(([k]) => NEEDS_REVIEW.has(k))) {
      lines.push("");
      lines.push(`REVIEW · ${kind} · ${group.length}`);
      for (const i of group) {
        lines.push(`  ${i.date ? i.date.slice(0, 10) : "----------"}  ${i.label || "(no label)"}  msg=${i.messageId || "-"}`);
        lines.push(`      ${i.detail}`);
        if (i.excerpt) lines.push(`      > ${i.excerpt}`);
      }
    }

    for (const [kind, group] of [...kinds].filter(([k]) => !NEEDS_REVIEW.has(k))) {
      lines.push("");
      lines.push(`INFO · ${kind} · ${group.length}`);
      if (kind === "round-unknown") {
        const labels = new Map();
        for (const i of group) {
          const key = i.label || "(no label)";
          labels.set(key, (labels.get(key) || 0) + 1);
        }
        lines.push("      round left null; match numbers assigned in posting order.");
        lines.push("      labels seen: " + [...labels.keys()].slice(0, 14).join(" | "));
        if (labels.size > 14) lines.push(`      ...and ${labels.size - 14} more`);
      } else {
        for (const i of group.slice(0, 10)) {
          lines.push(`  ${i.date ? i.date.slice(0, 10) : ""} ${i.label || ""} — ${i.detail}`);
        }
        if (group.length > 10) lines.push(`  ...and ${group.length - 10} more`);
      }
    }
    lines.push("");
  }
  fs.writeFileSync(file, lines.join("\n"), "utf8");
  return byContest;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv;
  const opts = { out: "parsed", only: null, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--out") opts.out = argv[++i];
    else if (argv[i] === "--only") opts.only = argv[++i];
    else if (argv[i] === "--verbose") opts.verbose = true;
    else if (argv[i] === "--list") opts.list = true;
    else if (argv[i] === "--help" || argv[i] === "-h") opts.help = true;
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(1);
    }
  }
  if (opts.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
    return;
  }
  if (opts.list) {
    for (const c of CONTESTS) {
      console.log(`  ${c.id.padEnd(14)} ${c.name}`);
      console.log(`  ${"".padEnd(14)} ${c.from} .. ${c.to}  channel ${c.channel}  vote=${c.vote}`);
      if (c.note) console.log(`  ${"".padEnd(14)} ${c.note}`);
      console.log();
    }
    return;
  }

  fs.mkdirSync(opts.out, { recursive: true });
  const issues = [];
  const results = [];

  for (const contest of CONTESTS) {
    if (opts.only && contest.id !== opts.only) continue;
    const matches = parseContest(contest, issues, opts);
    if (!matches) continue;
    const { file, stats } = writeContest(contest, matches, opts.out);
    results.push({ contest, file, stats });
  }

  const byContest = writeIssues(issues, "issue.log");

  console.log("\nparsed:");
  for (const r of results) {
    const n = (byContest.get(r.contest.id) || []).length;
    console.log(
      `  ${r.contest.id.padEnd(14)} ${String(r.stats.matches).padStart(3)} matches  ` +
        `${String(r.stats.ballots).padStart(5)} ballots  ${String(r.stats.voters).padStart(3)} voters  ` +
        `${String(n).padStart(3)} issues  -> ${r.file}`
    );
  }
  const totals = results.reduce(
    (a, r) => ({ m: a.m + r.stats.matches, b: a.b + r.stats.ballots }),
    { m: 0, b: 0 }
  );
  console.log(`\n  TOTAL          ${totals.m} matches, ${totals.b} ballots`);
  console.log(`  ${issues.length} issues -> issue.log`);
  console.log("\nNothing was written to db.json. Review, fix, then merge.");
}

main();
