#!/usr/bin/env node
/**
 * Fetch a handful of named messages, with their full reaction lists.
 *
 * dumpChannels.js pulls whole channels, which is the right tool for an import
 * but far too much when four messages are wanted -- one of them in a channel
 * that has never been dumped. This fetches exactly the messages listed and
 * nothing else.
 *
 * Writes them in the same shape dumpChannels.js produces, so the output feeds
 * straight into recoverMatches.js and parseHistory.js without translation.
 *
 *   node fetchMessages.js --spec recover.json
 *   node fetchMessages.js --spec recover.json --out history-dump/extra.jsonl
 *   node fetchMessages.js --message 875432976861790279 --channel 828700869658673222
 *
 * The spec is the same file recoverMatches.js takes; only `message` and
 * `channel` are read here, any other fields are ignored:
 *
 *   [{ "message": "875432976861790279", "channel": "828700869658673222" }]
 *
 * Needs BOT_KEY in .env, and the bot must still be able to read those channels.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Partials } = require("discord.js");

// Discord pages reaction users at 100, and rate-limits if pushed. The dumper
// uses the same spacing.
const REACTION_DELAY_MS = 250;
const PAGE = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = { spec: null, out: "recovered-messages.jsonl", pairs: [] };
  let message = null;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--spec") args.spec = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--message") message = argv[++i];
    else if (arg === "--channel") args.pairs.push({ message, channel: argv[++i] });
  }
  return args;
}

/**
 * Every user id behind every reaction. Reactions are the whole point of this,
 * so a partial page is treated as an error rather than quietly truncated.
 */
async function fetchReactions(message) {
  const out = [];
  for (const reaction of message.reactions.cache.values()) {
    const users = [];
    let after;
    for (;;) {
      const page = await reaction.users.fetch({
        limit: PAGE,
        ...(after && { after }),
      });
      if (!page.size) break;
      for (const id of page.keys()) users.push(id);
      if (page.size < PAGE) break;
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
      console.warn(
        `    ! ${message.id} ${reaction.emoji.name}: fetched ${users.length} of ${reaction.count} reactors`
      );
    }
    await sleep(REACTION_DELAY_MS);
  }
  return out;
}

/** Identical to dumpChannels.js's serialiser, so the outputs interchange. */
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

async function main() {
  const args = parseArgs(process.argv);
  let wanted = args.pairs.filter((p) => p.message && p.channel);
  if (args.spec) {
    wanted = JSON.parse(fs.readFileSync(args.spec, "utf8"))
      .filter((item) => item.message && item.channel)
      .map((item) => ({ message: item.message, channel: item.channel }));
  }
  if (!wanted.length) {
    console.error(
      "usage: node fetchMessages.js --spec recover.json\n" +
        "       node fetchMessages.js --message <id> --channel <id>"
    );
    process.exit(1);
  }
  if (!process.env.BOT_KEY) {
    console.error("BOT_KEY is not set -- add it to .env");
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
    // an old message is not in cache, so the reaction must be resolvable
    // without one
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });

  const results = [];
  client.once("ready", async () => {
    console.log(`logged in as ${client.user.tag}\n`);
    for (const item of wanted) {
      try {
        const channel = await client.channels.fetch(item.channel);
        if (!channel) throw new Error("channel not found or not visible");
        const message = await channel.messages.fetch(item.message);
        const reactions = await fetchReactions(message);
        const total = reactions.reduce((n, r) => n + r.users.length, 0);
        console.log(
          `  ok   ${item.message}  ${reactions.length} reaction(s), ${total} reactors` +
            `   ${JSON.stringify((message.content || "").slice(0, 60))}`
        );
        results.push(serialiseMessage(message, reactions));
      } catch (error) {
        console.log(`  FAIL ${item.message}: ${error.message}`);
      }
    }

    const dir = path.dirname(args.out);
    if (dir && dir !== "." && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      args.out,
      results.map((m) => JSON.stringify(m)).join("\n") + "\n",
      "utf8"
    );
    console.log(`\n${results.length} of ${wanted.length} fetched -> ${args.out}`);
    console.log("Send that file back, or feed it to recoverMatches.js directly.");
    client.destroy();
  });

  await client.login(process.env.BOT_KEY);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
