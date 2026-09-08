/**
 * Shared plumbing for the two results commands: which tournaments may be
 * offered, and the dropdown that switches between them.
 *
 * Kept apart from the commands so /tournament-bracket and /tournament-results
 * always offer the same list -- including the rule that a contest still being
 * voted on is not on it.
 *
 * Deliberately free of discord.js: it returns plain option data and the
 * commands build the menu, which keeps this testable against a db.json alone.
 */

const {
  GetFinishedTournaments,
} = require("./tournamentResults.js");

/**
 * Choices for the slash command's own option.
 *
 * Built when the command module loads, so the list is fixed until the bot next
 * restarts. That is a deliberate trade: Discord requires a command's choices at
 * registration time, and DeployCommands re-registers on every boot. A contest
 * that finishes while the bot is up appears in the message dropdown -- which is
 * built per invocation -- immediately, and in this list after the next restart.
 */
function BuildTournamentChoices(tournamentRoot) {
  return GetFinishedTournaments(tournamentRoot)
    .slice(0, 25)
    .map(({ name }) => ({ name: name.slice(0, 100), value: name.slice(0, 100) }));
}

/**
 * The tournament a command should show: the one asked for if it is finished,
 * otherwise the most recently finished. Returns null when nothing qualifies.
 */
function ResolveTournament(tournamentRoot, requested) {
  const finished = GetFinishedTournaments(tournamentRoot);
  if (!finished.length) return null;
  if (requested) {
    const match = finished.find(({ name }) => name === requested);
    if (match) return match;
  }
  return finished[0];
}

/**
 * Options for the dropdown under a sent message. Empty when there is nothing to
 * switch between, so the caller can leave the row off entirely.
 */
function BuildTournamentOptions(tournamentRoot, selectedName) {
  const finished = GetFinishedTournaments(tournamentRoot).slice(0, 25);
  if (finished.length < 2) return [];
  return finished.map(({ name, data }) => ({
    label: name.slice(0, 100),
    description: data.lastMatchAt
      ? `ran to ${data.lastMatchAt.slice(0, 10)}`
      : undefined,
    value: name.slice(0, 100),
    default: name === selectedName,
  }));
}

if (typeof module !== "undefined") {
  module.exports = {
    BuildTournamentChoices,
    ResolveTournament,
    BuildTournamentOptions,
  };
}
