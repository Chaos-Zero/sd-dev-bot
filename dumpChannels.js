#!/usr/bin/env node
/**
 * dumpChannels.js — phase 1 of the historical tournament import.
 *
 * Fetches raw message history from contest channels, including the FULL LIST OF
 * USER IDs behind every reaction. It understands nothing about tournaments; it
 * just gets the bytes down so the parser (phase 2) can iterate offline without
 * re-hitting Discord.
 *
 * Read-only. It never sends, edits, reacts or deletes.
 *
 * Output, per channel:
 *   <out>/<channelId>.jsonl       one message per line, oldest-last
 *   <out>/<channelId>.meta.json   progress marker, enables --resume
 *
 * Usage:
 *   node dumpChannels.js --list                    # show configured channels, fetch nothing
 *   node dumpChannels.js --channel 785547515998109696 --limit 50
 *   node dumpChannels.js --channel 785547515998109696
 *   node dumpChannels.js --all
 *   node dumpChannels.js --all --resume            # continue where it stopped
 *
 * Always do a --limit 50 run on one channel first and eyeball the output before
 * committing to the full fetch.
 */

const fs = require("fs");
const path = require("path");

// discord.js and dotenv are required lazily inside main() so that --list and
// --help work in a checkout with no node_modules.

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

const CHANNELS = [
  {
    id: "828700869658673222",
    label: "contests",
    note:
      "User-run contests AND the live 2019 Contest. Parser must skip anything " +
      "already in db.json — see the overlap warning in the README notes.",
    style: "bracket",
  },
  {
    id: "785547515998109696",
    label: "best-vgm-2020-awards",
    style: "bracket",
  },
  {
    id: "920706746912243742",
    label: "best-vgm-2021-awards",
    style: "bracket",
  },
  {
    id: "1070816116072521859",
    label: "best-vgm-2022-awards",
    note:
      "The bot took over midway. Early messages are reaction-voted (full voter " +
      "recovery); later ones are button-voted and carry NO reactions, so only " +
      "the posted scores survive.",
    style: "bracket-mixed",
  },
  {
    id: "1090053520000024587",
    label: "majordomo-logs",
    note:
      "Bot result embeds. On 2023-04-11 every match prior to that date was " +
      "backfilled here in one burst, so this channel holds the full results " +
      "history, not just post-2023-03-27. Scores and winners only — no " +
      "reactions, so no voter ids. Expect a large same-day block; the parser " +
      "must read match identity from the embed, never from message order.",
    style: "results-log",
  },
];

const DEFAULT_OUT = path.join(".data", "history-dump");

// Pause between reaction-user pages. Discord's per-route limit is the binding
// constraint here, not the global one; 350ms keeps us comfortably under it.
const REACTION_DELAY_MS = 350;
const HISTORY_DELAY_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, channels: [], limit: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") args.all = true;
    else if (arg === "--resume") args.resume = true;
    else if (arg === "--list") args.list = true;
    else if (arg === "--channel") args.channels.push(argv[++i]);
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

function snowflakeDate(id) {
  return new Date(Number(BigInt(id) >> 22n) + 1420070400000);
}

// ---------------------------------------------------------------------------
// Reactions — the whole point of this script
// ---------------------------------------------------------------------------

/**
 * Every user id behind every reaction on a message.
 * users.fetch() pages at 100, so a 150-vote match needs two calls per emoji.
 */
async function fetchReactions(message, stats) {
  const out = [];
  for (const reaction of message.reactions.cache.values()) {
    const users = [];
    let after;
    for (;;) {
      let page;
      try {
        page = await reaction.users.fetch({ limit: 100, ...(after && { after }) });
      } catch (error) {
        stats.reactionErrors++;
        console.warn(
          `    ! reaction fetch failed on ${message.id} (${reaction.emoji.name}): ${error.message}`
        );
        break;
      }
      stats.reactionCalls++;
      if (!page.size) break;
      for (const id of page.keys()) users.push(id);
      if (page.size < 100) break;
      after = page.lastKey();
      await sleep(REACTION_DELAY_MS);
    }
    out.push({
      name: reaction.emoji.name,
      id: reaction.emoji.id,
      identifier: reaction.emoji.identifier,
      animated: reaction.emoji.animated || false,
      count: reaction.count,
      users,
    });
    if (users.length !== reaction.count) {
      stats.countMismatches++;
    }
    await sleep(REACTION_DELAY_MS);
  }
  return out;
}

function serialiseMessage(message, reactions) {
  return {
    id: message.id,
    channelId: message.channelId,
    createdTimestamp: message.createdTimestamp,
    createdAt: new Date(message.createdTimestamp).toISOString(),
    editedTimestamp: message.editedTimestamp,
    type: message.type,
    pinned: message.pinned,
    author: {
      id: message.author?.id ?? null,
      username: message.author?.username ?? null,
      bot: message.author?.bot ?? false,
    },
    content: message.content,
    embeds: message.embeds.map((e) => e.toJSON()),
    attachments: [...message.attachments.values()].map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      contentType: a.contentType,
    })),
    components: message.components.map((row) => row.toJSON()),
    reactions,
  };
}

// ---------------------------------------------------------------------------
// Per-channel dump
// ---------------------------------------------------------------------------

function metaPath(outDir, id) {
  return path.join(outDir, `${id}.meta.json`);
}
function dumpPath(outDir, id) {
  return path.join(outDir, `${id}.jsonl`);
}

function readMeta(outDir, id) {
  const file = metaPath(outDir, id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function dumpChannel(client, spec, args) {
  const { id, label } = spec;
  const outDir = args.out;
  fs.mkdirSync(outDir, { recursive: true });

  const existing = readMeta(outDir, id);
  if (existing?.complete && !args.limit) {
    console.log(`\n${label} (${id}) — already complete, ${existing.messages} messages. Skipping.`);
    return;
  }

  let before;
  if (args.resume && existing?.oldestId) {
    before = existing.oldestId;
    console.log(`\n${label} (${id}) — resuming before message ${before}`);
  } else {
    console.log(`\n${label} (${id}) — starting fresh`);
    if (existing) {
      // A partial dump without --resume would interleave. Start clean instead.
      fs.rmSync(dumpPath(outDir, id), { force: true });
      fs.rmSync(metaPath(outDir, id), { force: true });
    }
  }

  let channel;
  try {
    channel = await client.channels.fetch(id);
  } catch (error) {
    console.error(`  ! cannot reach channel ${id}: ${error.message}`);
    return;
  }
  if (!channel || !channel.isTextBased()) {
    console.error(`  ! ${id} is not a text channel`);
    return;
  }

  console.log(`  #${channel.name} — created ${snowflakeDate(id).toISOString().slice(0, 10)}`);

  const stream = fs.createWriteStream(dumpPath(outDir, id), { flags: "a" });
  const stats = {
    messages: existing?.messages || 0,
    withReactions: existing?.withReactions || 0,
    ballots: existing?.ballots || 0,
    reactionCalls: 0,
    reactionErrors: 0,
    countMismatches: 0,
  };
  let oldestId = existing?.oldestId || null;
  let newestId = existing?.newestId || null;
  let complete = false;

  for (;;) {
    let batch;
    try {
      batch = await channel.messages.fetch({ limit: 100, ...(before && { before }) });
    } catch (error) {
      console.error(`  ! history fetch failed: ${error.message}`);
      break;
    }
    if (!batch.size) {
      complete = true;
      break;
    }

    for (const message of batch.values()) {
      const reactions = message.reactions.cache.size
        ? await fetchReactions(message, stats)
        : [];
      stream.write(JSON.stringify(serialiseMessage(message, reactions)) + "\n");

      stats.messages++;
      if (reactions.length) {
        stats.withReactions++;
        stats.ballots += reactions.reduce((n, r) => n + r.users.length, 0);
      }
      if (!newestId) newestId = message.id;
      oldestId = message.id;

      if (args.limit && stats.messages >= args.limit) break;
    }

    before = batch.lastKey();
    const oldest = snowflakeDate(before).toISOString().slice(0, 10);
    console.log(
      `  ${String(stats.messages).padStart(6)} messages · ${stats.withReactions} with reactions · ` +
        `${stats.ballots} ballots · back to ${oldest}`
    );

    if (args.limit && stats.messages >= args.limit) break;
    if (batch.size < 100) {
      complete = true;
      break;
    }
    await sleep(HISTORY_DELAY_MS);
  }

  await new Promise((resolve) => stream.end(resolve));

  const meta = {
    channelId: id,
    channelName: channel.name,
    label,
    guildId: channel.guildId,
    style: spec.style,
    note: spec.note || null,
    messages: stats.messages,
    withReactions: stats.withReactions,
    ballots: stats.ballots,
    oldestId,
    newestId,
    oldestAt: oldestId ? snowflakeDate(oldestId).toISOString() : null,
    newestAt: newestId ? snowflakeDate(newestId).toISOString() : null,
    complete: complete && !args.limit,
    partial: Boolean(args.limit),
    dumpedAt: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath(outDir, id), JSON.stringify(meta, null, 2), "utf8");

  console.log(
    `  done: ${stats.messages} messages, ${stats.withReactions} with reactions, ` +
      `${stats.ballots} ballots, ${stats.reactionCalls} reaction calls` +
      (complete && !args.limit ? "" : "  [PARTIAL]")
  );
  if (stats.reactionErrors) {
    console.log(`  ! ${stats.reactionErrors} reaction fetches failed — re-run with --resume`);
  }
  if (stats.countMismatches) {
    console.log(
      `  note: ${stats.countMismatches} reactions returned fewer users than their count ` +
        `(usually deleted accounts)`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
    return;
  }

  if (args.list) {
    console.log("Configured channels:\n");
    for (const c of CHANNELS) {
      console.log(`  ${c.label}`);
      console.log(`    id      ${c.id}`);
      console.log(`    created ${snowflakeDate(c.id).toISOString().slice(0, 10)}`);
      console.log(`    style   ${c.style}`);
      if (c.note) console.log(`    note    ${c.note}`);
      console.log();
    }
    return;
  }

  let targets = CHANNELS;
  if (args.channels.length) {
    targets = args.channels.map(
      (id) => CHANNELS.find((c) => c.id === id) || { id, label: id, style: "unknown" }
    );
  } else if (!args.all) {
    console.error(
      "Specify --channel <id>, or --all for every configured channel. --list shows what is configured."
    );
    process.exit(1);
  }

  require("dotenv").config();
  const { Client, GatewayIntentBits } = require("discord.js");

  const token = process.env.BOT_KEY;
  if (!token) {
    console.error("BOT_KEY missing from the environment (.env). Cannot connect.");
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", async () => {
    console.log(`Connected as ${client.user.tag}`);
    console.log(`Output: ${path.resolve(args.out)}`);
    if (args.limit) console.log(`LIMIT: stopping after ${args.limit} messages per channel`);

    const started = Date.now();
    for (const spec of targets) {
      await dumpChannel(client, spec, args);
    }
    console.log(`\nFinished in ${Math.round((Date.now() - started) / 1000)}s`);
    await client.destroy();
    process.exit(0);
  });

  await client.login(token);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
