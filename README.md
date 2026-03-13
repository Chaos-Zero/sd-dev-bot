# MajorDomo — SD-Bot

MajorDomo is a Discord bot built to support the **SupraDarky VGM Club** community. It manages daily automated tournament brackets, provides access to a curated VGM archive, and includes a suite of utilities for server management, livestreams, and community engagement.

---

## Project Structure

| File / Directory | Description |
|---|---|
| `server.js` | Entry point. Sets up the Express server and bootstraps the bot. |
| `public/main.js` | Core bot setup — `CreateBot`, `AddCommandsToBot`, `DeployCommands`, and the tournament cron scheduler (`ResetTournamentSchedule`). |
| `public/imports.js` | Central import file that loads shared utilities globally to avoid repetitive requires elsewhere. |
| `public/commands/` | All slash command modules. Automatically loaded and registered at startup. |
| `public/events/` | Discord event listeners (message reactions, button presses, etc). Auto-loaded at startup. |
| `public/database/` | Low-level database read/write helpers using `lowdb`. |
| `public/tournament/` | Tournament logic split by format: `single/`, `doubleElim/`, `triple/`. |
| `public/utils/` | Shared utilities: message helpers, reaction handling, VGM archive data (`sdArchiveData/`). |
| `public/imageprocessing/` | GIF and image generation used for match thumbnails. |
| `public/ytPlayback/` | YouTube queue and playback management. |
| `.data/db.json` | The live database (lowdb JSON). Contains tournament state, schedule config, and user data. |

---

## Tournament System

Tournaments run on an **automated daily schedule**. Each day at the configured UTC time, the bot:
1. Ends the previous day's matches and tallies results.
2. Posts result embeds to the tournament channel.
3. Starts new match embeds with voting buttons for the current day's matches.

### Supported Formats
- **Single Elimination** — Classic bracket. One match per trigger.
- **Double Elimination** — Standard two-loss bracket.
- **3v3 Ranked** — Multi-entry ranked format.

### Scheduling
- Post time and weekend inclusion are stored in the database (`tournamentPostTime`, `tournamentIncludeWeekends`).
- The schedule runs via `node-cron` using UTC and is reloaded live when an admin changes the time or weekend setting via slash commands.
- Discord embed timestamps are generated using `Date.UTC()` to ensure accuracy regardless of server locale.

---

## Slash Commands

### 🔵 Community Commands

| Command | Description |
|---|---|
| `/ping` | Replies with Pong! Useful for checking bot responsiveness. |
| `/help` | Shows MajorDomo command categories and details. Admins see admin-only categories. |
| `/sd-track` | Get a random or specific track from the SupraDarky VGM catalogue. Supports filtering by track number, series/game name, or year of release. |
| `/community-track` | Get a random or specific track from community members' uploads. Filter by contributor, track number, series, or year. |
| `/generate-playlist` | Generate a YouTube playlist with random tracks from community contributors. Can filter by contributor, series, or year. Outputs a shareable playlist link with paginated embed. |
| `/echo` | Repeats a given message back in the channel. |

---

### 🏆 Tournament Admin Commands

> These commands require the user to be the **server owner**, a **designated Domo Admin** (user or role), to use.

| Command | Description |
|---|---|
| `/tournament-register` | Register a new tournament from a CSV file. Accepts tournament name, format, matches per day, channel, optional post time, weekend toggle, randomise order, and Challonge bracket creation. |
| `/tournament-set-match-time` | Update the daily tournament post time (UTC). Shows a confirmation embed with equivalent times in multiple timezones. Immediately reschedules the cron job without a bot restart. |
| `/tournament-set-weekends` | Toggle whether matches post on Saturdays and Sundays. Immediately reschedules the cron job. |
| `/tournament-set-channel` | Change the channel where tournament match embeds are posted. |
| `/tournament-start-match` | Manually trigger the current day's matches outside of the automatic schedule. |
| `/tournament-resend-matches` | Resend the current day's match embeds (e.g. if a message was deleted or the bot missed a day). |
| `/tournament-remove` | Remove the currently active tournament from the database. |
| `/tournament-manage-admin` | Add or remove Domo Admin users or roles that can use admin-level tournament commands. |
| `/tournament-toggle-receipt` | Toggle DM receipt notifications for a specific user when matches are posted. |
| `/tournament-update-entrant` | Edit a tournament entrant's name, title, or YouTube link. |
| `/tournament-change-matches-per-round` | Change the number of matches run per day for the active tournament. |
| `/tournament-add-match-art` | Upload custom artwork for a specific match, which will appear in the match embed. |
| `/tournament-edit-messages` | Edit the content of previously sent tournament messages. |
| `/tournament-dm-instructions` | DM voting instructions to registered receipt users. |
| `/set-test-mode` | Enable test mode — redirects all tournament posts to a specified test channel. |
| `/clear-test-mode` | Disable test mode and resume posting to the real tournament channel. |
| `/tournament-tastemakers` | Run a Tastemakers-style ranked playlist tournament (specialist format). |
| `/tournament-iconoclasts` | Run an Iconoclasts-style variant tournament format. |
| `/user-compatibility` | Check voting compatibility between two users across tournament history. |
| `/highest-compatibility` | Find the users with the highest voting compatibility with a given user. |

---

### 📺 YouTube / Streaming Commands

| Command | Description |
|---|---|
| `/toggle-playlist-channel` | Add or remove a Discord channel from YouTube playlist tracking. |
| `/list-yt-channels` | List all Discord channels currently tracked for YouTube channel updates. |
| `/start-guessing-game` | Start a VGM guessing game in a livestream session. |
| `/end-guessing-game` | End the current guessing game and tally scores. |
| `/get-guessing-scores` | Display the current scores for the guessing game. |
| `/add-user-theme` | Submit a personal VGM theme for a user to be used in streams. |
| `/add-cohost` | Register a co-host for the current stream session. |

---

## Configuration & Environment

The bot reads the following from environment variables (`.env` or hosting panel):

| Variable | Purpose |
|---|---|
| `BOT_KEY` | Discord bot token |
| `BOT_ID` | Discord application/client ID |
| `GUILD_ID` | The primary Discord server ID |
| `TOURNAMENT_CHANNEL` | Fallback tournament channel name |
| `BOT_LOG_CHANEL` | Channel name for internal bot logs |

---

## Database

The bot uses [`lowdb`](https://github.com/typicode/lowdb) (v1.x) with a flat JSON file. The primary database is `.data/db.json` and includes:

- **`tournaments[0]`** — The root tournament config object, containing:
  - `currentTournament` — Name of the active tournament, or `"N/A"`.
  - `tournamentPostTime` — Daily post time in `HH:MM` UTC format (e.g. `"19:00"`).
  - `tournamentIncludeWeekends` — Boolean, whether to post on weekends.
  - `admin` — Array of user IDs allowed to run admin commands.
  - `adminRoles` — Array of role IDs allowed to run admin commands.
  - `receiptUsers` — Array of users opted in to DM notifications.
  - `testMode` — Object with `enabled`, `channelId`, and `channelName`.
  - `[Tournament Name]` — Nested object for each registered tournament containing all match data.

---

## Tech Stack

- **Runtime**: Node.js (≥20)
- **Bot Framework**: [discord.js](https://discord.js.org/) v14
- **Scheduler**: [node-cron](https://www.npmjs.com/package/cron) v2
- **Database**: [lowdb](https://github.com/typicode/lowdb) v1
- **Image Processing**: canvas, gif-encoder-2
- **Audio**: @discordjs/voice, ytdl-core, yt-stream
- **Utilities**: axios, csv-parser, fuse.js, papaparse, exceljs

---

## Deployment

The bot is deployed on a **Hetzner** Linux server running Node.js. To deploy:

1. Push changes to the `main` branch on GitHub.
2. Pull on the server and restart the bot process.

The tournament cron schedule is re-initialised automatically on bot startup and can be updated live via the `/tournament-set-match-time` and `/tournament-set-weekends` commands without needing a restart.