/**
 * Reading a track's tournament history back out of the database.
 *
 * Pure data: no Discord, no canvas, no network. Everything here works off the
 * tournament root so it can be exercised directly against a db.json.
 */

const fs = require("fs");

// matchEntrantList / matchVoteKind read every entrant slot and tell a ranked
// ballot from a flat one, which matters because contests ran 3- and 4-way
// battles alongside head-to-head.
const {
  matchEntrantList,
  matchVoteKind,
  GetTournamentEntriesNewestFirst,
} = require("../utils/compatibilityStore.js");

/**
 * Whether a match may be spoken about at all.
 *
 * Only a finished match is public. Everything else is withheld, and the states
 * are not hypothetical: a match still being voted on carries running vote
 * counts, a tie carries the scores of a result awaiting a replay, and an
 * abandoned match carries the pairing that was drawn. A bracket can also be
 * registered as hidden so that upcoming rounds are not revealed before they
 * open, and future matches are stored with their entrants already filled in.
 *
 * So this gate is applied when building the index too, not only when reading a
 * run: a track must not become searchable, and must not show up as having
 * entered a tournament, until it has actually played a match there.
 */
function isPublicMatch(match) {
  return Boolean(match) && match.progress === "complete";
}

/**
 * Whether a match has been settled one way or another.
 *
 * Only a finished match and an abandoned one are settled; everything else --
 * being voted on, tied and awaiting its replay, drawn but not yet opened --
 * still has to happen. Written as an allow-list so a progress state nobody has
 * invented yet holds the contest open rather than quietly finishing it.
 */
function isSettledMatch(match) {
  const progress = match && match.progress;
  return progress === "complete" || progress === "abandoned";
}

/**
 * Whether a tournament is still being played.
 *
 * Two ways to be running, because either on its own misses cases: the database
 * names the contest currently under way, and an older contest can still be
 * carrying an unsettled match. Erring towards "running" is the safe direction
 * -- a live contest reported as finished hands out a placement, and a winner,
 * that the votes have not decided yet.
 */
function IsTournamentRunning(tournament, tournamentName, currentTournament) {
  if (!tournament || !Array.isArray(tournament.matches)) return false;
  if (tournamentName && currentTournament && tournamentName === currentTournament) {
    return true;
  }
  return tournament.matches.some((match) => !isSettledMatch(match));
}

/** Case- and punctuation-insensitive key for matching a track to itself. */
function normaliseTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A track's identity. Keyed on the game as well as the title, because plenty of
 * entries share a name -- "Main Theme" alone matches Spiritfarer, Streets of
 * Rage 4 and a dozen others, and keying on the title by itself splices their
 * separate runs into one impossible progression.
 */
function trackKey(entrant) {
  return normaliseTitle(entrant?.name) + "|" + normaliseTitle(entrant?.title);
}

/** Same game, allowing for one write-up being more complete than the other. */
function sameGame(candidate, wanted) {
  if (wanted === null || wanted === undefined) return true;
  const a = normaliseTitle(candidate);
  const b = normaliseTitle(wanted);
  if (!a || !b) return a === b;
  return a === b || a.includes(b) || b.includes(a);
}

function entrantPoints(entrant) {
  const points = Number(entrant?.points);
  return Number.isFinite(points) ? points : 0;
}

/**
 * Who won a match, by points. Returns null on a tie or an unscored match so
 * callers can report "undecided" rather than inventing a winner.
 */
function matchWinner(entrants) {
  if (entrants.length < 2) return null;
  let best = null;
  let tied = false;
  for (const entrant of entrants) {
    const points = entrantPoints(entrant);
    if (!best || points > entrantPoints(best)) {
      best = entrant;
      tied = false;
    } else if (points === entrantPoints(best)) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * Every distinct track that ever entered a tournament, with the tournaments it
 * appeared in. Built once and searched repeatedly, so the fuzzy search never
 * has to walk the matches again.
 */
function BuildTrackIndex(tournamentRoot) {
  const byKey = new Map();

  for (const { name: tournamentName, data } of GetTournamentEntriesNewestFirst(
    tournamentRoot
  )) {
    for (const match of data.matches || []) {
      if (!isPublicMatch(match)) continue;
      for (const entrant of matchEntrantList(match)) {
        if (!normaliseTitle(entrant.name)) continue;
        const key = trackKey(entrant);

        let record = byKey.get(key);
        if (!record) {
          record = {
            key,
            name: entrant.name,
            title: entrant.title || "",
            link: entrant.link || "",
            videoId: entrant.videoId || "",
            tags: Array.isArray(entrant.tags) ? entrant.tags.slice() : [],
            tournaments: [],
          };
          byKey.set(key, record);
        }
        // Later tournaments often carry better metadata than the archive
        // imports, so fill any gaps as we go rather than trusting first sight.
        if (!record.title && entrant.title) record.title = entrant.title;
        if (!record.link && entrant.link) record.link = entrant.link;
        if (!record.videoId && entrant.videoId) record.videoId = entrant.videoId;
        if (!record.tags.length && Array.isArray(entrant.tags)) {
          record.tags = entrant.tags.slice();
        }
        if (!record.tournaments.includes(tournamentName)) {
          record.tournaments.push(tournamentName);
        }
      }
    }
  }

  return mergeRestatedGames(Array.from(byKey.values()));
}

/**
 * Fold together entries that are the same track written up differently --
 * "Spiral of Erebos" filed under both "Trails of Cold Steel III" and "The
 * Legend of Heroes: Trails of Cold Steel III". Only merges when one game string
 * contains the other, which catches the restatements without touching the
 * genuinely distinct songs that happen to share a name ("Main Theme" belongs to
 * five different games and must stay five entries). The longer, more specific
 * game string wins.
 */
function mergeRestatedGames(records) {
  const byName = new Map();
  for (const record of records) {
    const name = normaliseTitle(record.name);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(record);
  }

  const merged = [];
  for (const group of byName.values()) {
    const kept = [];
    for (const record of group) {
      const host = kept.find((other) => {
        const a = normaliseTitle(other.title);
        const b = normaliseTitle(record.title);
        return a && b && (a.includes(b) || b.includes(a));
      });
      if (!host) {
        kept.push(record);
        continue;
      }
      if (record.title.length > host.title.length) host.title = record.title;
      if (!host.link) host.link = record.link;
      if (!host.videoId) host.videoId = record.videoId;
      if (!host.tags.length) host.tags = record.tags;
      for (const tournament of record.tournaments) {
        if (!host.tournaments.includes(tournament)) {
          host.tournaments.push(tournament);
        }
      }
    }
    merged.push(...kept);
  }
  return merged;
}

/**
 * Every match each track played, in order. The spine of the structural
 * reasoning below: stages, the deciding match and the playoff are all worked
 * out from who played whom and when, rather than from round numbers.
 */
function matchesByTrack(complete) {
  const ordered = complete
    .slice()
    .sort(
      (a, b) => Number(a.round) - Number(b.round) || Number(a.match) - Number(b.match)
    );
  const byTrack = new Map();
  for (const match of ordered) {
    for (const entrant of matchEntrantList(match)) {
      const key = trackKey(entrant);
      if (!byTrack.has(key)) byTrack.set(key, []);
      byTrack.get(key).push(match);
    }
  }
  return byTrack;
}

/** The match a track played immediately before this one, if any. */
function previousMatch(byTrack, match, entrant) {
  const played = byTrack.get(trackKey(entrant)) || [];
  const index = played.indexOf(match);
  return index > 0 ? played[index - 1] : null;
}

/**
 * Which matches were the quarter- and semi-finals, worked out backwards from
 * the final: the semi-finals are the two matches the finalists played to get
 * there, and the quarter-finals are the four played before those.
 *
 * Derived rather than counted. Round numbers do not identify a stage here --
 * byes, repechage rounds and tie replays mean a round can hold an odd number of
 * matches and a track can play twice in one, which once produced two "QF"
 * labels in a single run. Counting survivors was closer but still approximate:
 * it called SupraDarky's semi-finals quarter-finals.
 *
 * A stage is only named when it comes out to the expected size -- two
 * semi-finals, four quarter-finals -- so a contest reached by an untidy route
 * keeps its round numbers, which are always true.
 *
 * Double elimination is skipped: a track is not out on its first loss, so the
 * match before the final is not a semi-final in the usual sense.
 */
function namedStages(tournament, decidingMatch) {
  const stages = new Map();
  const complete = (tournament?.matches || []).filter(isPublicMatch);
  if (!complete.length) return stages;
  if (complete.some((m) => m.bracket === "losersBracket")) return stages;

  const deciding =
    decidingMatch === undefined
      ? findDecidingMatch(complete, complete)
      : decidingMatch;
  const final = complete.find((m) => Number(m.match) === deciding);
  if (!final) return stages;

  const byTrack = matchesByTrack(complete);

  // A track can play twice in a row -- Favorite's "Shore Of Dreams" contested
  // match 68 and then match 69 -- which would otherwise let one match be picked
  // up as both a semi-final and a quarter-final, the later pass overwriting the
  // earlier label. Anything already placed is excluded.
  const stageBefore = (matches, taken) => {
    const found = new Map();
    for (const match of matches) {
      for (const entrant of matchEntrantList(match)) {
        const previous = previousMatch(byTrack, match, entrant);
        if (!previous) continue;
        const number = Number(previous.match);
        if (taken.has(number)) continue;
        found.set(number, previous);
      }
    }
    return found;
  };

  const placed = new Set([deciding]);
  const semis = stageBefore([final], placed);
  if (semis.size !== 2) return stages;
  for (const number of semis.keys()) {
    stages.set(number, "Semi-final");
    placed.add(number);
  }

  const quarters = stageBefore([...semis.values()], placed);
  if (quarters.size !== 4) return stages;
  for (const number of quarters.keys()) stages.set(number, "Quarter-final");

  return stages;
}

/**
 * Which match actually decided the tournament.
 *
 * Not simply the highest-numbered match in the closing round. Where a contest
 * plays its final and its third-place playoff side by side, the playoff can
 * carry the higher number: SupraDarky's match 36 is Kraken against Monolith,
 * who had both just lost their semi-finals, while the real final was match 35
 * between the two who won. Taking the higher number crowned a track that had
 * been knocked out.
 *
 * So the final is identified by who is in it. Among the matches nobody plays
 * after, the final is the one contested by tracks that won their previous
 * match; a placement playoff is contested by tracks that lost theirs.
 */
function findDecidingMatch(complete, finalRoundMatches) {
  const byTrack = matchesByTrack(complete);

  const wonPrevious = (match, entrant) => {
    const previous = previousMatch(byTrack, match, entrant);
    if (!previous) return true; // arrived by bye, so nothing was lost
    const winner = matchWinner(matchEntrantList(previous));
    return Boolean(winner && trackKey(winner) === trackKey(entrant));
  };

  // matches after which none of their participants played again
  const terminal = complete.filter((match) =>
    matchEntrantList(match).every((entrant) => {
      const played = byTrack.get(trackKey(entrant)) || [];
      return played[played.length - 1] === match;
    })
  );

  const candidates = terminal.length ? terminal : finalRoundMatches;
  const contestedByWinners = candidates.filter((match) =>
    matchEntrantList(match).every((entrant) => wonPrevious(match, entrant))
  );

  const pick = contestedByWinners.length ? contestedByWinners : candidates;
  return Math.max(...pick.map((m) => Number(m.match)), 0);
}

/**
 * The shape of a tournament's closing rounds, worked out once: which match
 * decided it, which were the named stages, and which was the third-place
 * playoff. Read by the per-track summary and by the results commands, so they
 * cannot disagree about who won what.
 */
function GetTournamentStructure(tournament) {
  const complete = (tournament?.matches || []).filter(isPublicMatch);
  const decided = complete.filter((m) => !m.isThirdPlace);
  const finalRound = Math.max(...decided.map((m) => Number(m.round)), 0);

  const finalRoundMatches = decided.filter((m) => Number(m.round) === finalRound);
  const decidingMatch = findDecidingMatch(complete, finalRoundMatches);

  // Third-place playoffs come in three shapes: flagged outright (2025 runs one
  // in round 7, before the final), sitting unflagged alongside the final as the
  // second match of the closing round (2023, 2024, 2020), or unflagged in an
  // earlier round entirely (Technology vs Nature plays it at match 63 while the
  // final is match 64 a round later) -- that last one is found by who is in it.
  const stages = namedStages(tournament, decidingMatch);
  const thirdPlaceMatches = new Set(
    complete.filter((m) => m.isThirdPlace).map((m) => Number(m.match))
  );
  if (finalRoundMatches.length === 2) {
    for (const m of finalRoundMatches) {
      if (Number(m.match) !== decidingMatch) thirdPlaceMatches.add(Number(m.match));
    }
  }
  for (const match of findPlayoffBySemiFinalLosers(complete, stages, decidingMatch)) {
    thirdPlaceMatches.add(match);
  }

  // Double elimination keeps beaten tracks alive in a losers bracket, so the
  // rounds no longer count down to the final and "quarter-final" stops meaning
  // anything. Say which bracket instead.
  const isDoubleElim = complete.some((m) => m.bracket === "losersBracket");

  return {
    complete,
    finalRound,
    decidingMatch,
    thirdPlaceMatches,
    stages,
    isDoubleElim,
  };
}

/**
 * The third-place playoff, found by who is in it: the two tracks that lost the
 * semi-finals, meeting again in a match that is not the final.
 *
 * Needed because the playoff is not reliably flagged and does not reliably sit
 * beside the final. Technology vs Nature runs it at match 63 in round 6 while
 * the final is match 64 in round 7, so looking only at the closing round missed
 * it and reported the third-place finisher as a plain round-6 exit.
 */
function findPlayoffBySemiFinalLosers(matches, stages, decidingMatch) {
  const semiLosers = new Set();
  for (const match of matches) {
    if (stages.get(Number(match.match)) !== "Semi-final") continue;
    const entrants = matchEntrantList(match);
    const winner = matchWinner(entrants);
    if (!winner) continue;
    for (const entrant of entrants) {
      if (entrant !== winner) semiLosers.add(trackKey(entrant));
    }
  }
  if (semiLosers.size !== 2) return [];

  const found = [];
  for (const match of matches) {
    if (Number(match.match) === decidingMatch) continue;
    const keys = matchEntrantList(match).map(trackKey);
    if (keys.length !== semiLosers.size) continue;
    if (keys.every((k) => semiLosers.has(k))) found.push(Number(match.match));
  }
  return found;
}

/**
 * Who is still standing in a contest, and how much of it is left to play.
 *
 * Worked out from finished matches only, so it says no more than a member could
 * work out from the results already posted: a track is out once it has lost,
 * and the tracks that have not lost are the ones still in. The rounds left
 * follow from how many are still in -- eight tracks means three more rounds --
 * rather than from the stored bracket, which has the entrants of unplayed
 * rounds already filled in and must not be read.
 *
 * Double elimination gets a track count but no round count: a first loss does
 * not put anyone out there, so a beaten track carries on in the losers bracket
 * and the halving the round count relies on no longer holds.
 */
function GetLiveStandings(tournament) {
  const matches = (tournament?.matches || []).filter(isPublicMatch);
  const isDoubleElim = matches.some((m) => m.bracket === "losersBracket");

  const field = new Set();
  const losses = new Map();
  const knockedOut = new Set();

  for (const match of matches) {
    const entrants = matchEntrantList(match);
    for (const entrant of entrants) field.add(trackKey(entrant));

    const winner = matchWinner(entrants);
    // a tie eliminates nobody: it is replayed
    if (!winner) continue;
    for (const entrant of entrants) {
      if (entrant === winner) continue;
      const key = trackKey(entrant);
      const count = (losses.get(key) || 0) + 1;
      losses.set(key, count);
      const out = isDoubleElim
        ? count >= 2 || match.bracket === "losersBracket"
        : true;
      if (out) knockedOut.add(key);
    }
  }

  const alive = new Set([...field].filter((key) => !knockedOut.has(key)));
  const tracksRemaining = alive.size;

  return {
    alive,
    tracksRemaining,
    // At least one: a contest with matches left to play has a round left,
    // whatever an irregular bracket makes of the arithmetic.
    roundsRemaining:
      isDoubleElim || tracksRemaining < 1
        ? null
        : Math.max(1, Math.ceil(Math.log2(tracksRemaining))),
    isDoubleElim,
  };
}

/**
 * A track's run through one tournament: every match it appeared in, in order,
 * with who it beat and by how much.
 */
function BuildTrackProgression(tournament, track) {
  // accepts either an index record ({ name, title }) or a bare name, in which
  // case any game matches -- fine for a unique title, ambiguous for "Main Theme"
  const wantName = normaliseTitle(typeof track === "string" ? track : track?.name);
  const wantTitle =
    typeof track === "string" ? null : normaliseTitle(track?.title);
  const rounds = [];

  const matches = (tournament?.matches || [])
    .filter(isPublicMatch)
    .sort(
      (a, b) => Number(a.round) - Number(b.round) || Number(a.match) - Number(b.match)
    );

  for (const match of matches) {
    const entrants = matchEntrantList(match);
    const self = entrants.find(
      (e) => normaliseTitle(e.name) === wantName && sameGame(e.title, wantTitle)
    );
    if (!self) continue;

    const winner = matchWinner(entrants);
    const opponents = entrants.filter((e) => e !== self);
    const runnerUp = opponents
      .slice()
      .sort((a, b) => entrantPoints(b) - entrantPoints(a))[0];

    rounds.push({
      round: Number(match.round),
      match: Number(match.match),
      voteKind: matchVoteKind(match),
      isThirdPlace: match.isThirdPlace === true,
      bracket: match.bracket || "",
      self: {
        name: self.name,
        title: self.title || "",
        points: entrantPoints(self),
        videoId: self.videoId || "",
      },
      opponents: opponents.map((e) => ({
        name: e.name,
        title: e.title || "",
        points: entrantPoints(e),
        videoId: e.videoId || "",
        beaten: winner === self,
      })),
      // null when the match was tied or unscored
      won: winner ? winner === self : null,
      // how comfortable it was: the gap to the nearest rival, either way
      margin: runnerUp ? entrantPoints(self) - entrantPoints(runnerUp) : 0,
      totalVotes: entrants.reduce((sum, e) => sum + entrantPoints(e), 0),
    });
  }

  return rounds;
}

/**
 * How many of this track's matches the given user voted for it in. Reads both
 * ballot shapes, since a ranked ballot stores voters as {first, second} rather
 * than a flat array. Returns 0 for someone who never backed it -- including
 * someone who voted in the tournament but always for the other side.
 */
function CountUserVotesForTrack(tournament, track, userId) {
  if (!userId) return 0;
  const wantName = normaliseTitle(typeof track === "string" ? track : track?.name);
  const wantTitle =
    typeof track === "string" ? null : normaliseTitle(track?.title);

  let voted = 0;
  for (const match of tournament?.matches || []) {
    if (!isPublicMatch(match)) continue;
    const self = matchEntrantList(match).find(
      (e) => normaliseTitle(e.name) === wantName && sameGame(e.title, wantTitle)
    );
    if (!self) continue;

    const voters = self.voters;
    if (Array.isArray(voters)) {
      if (voters.includes(userId)) voted++;
    } else if (voters && typeof voters === "object") {
      const first = Array.isArray(voters.first) ? voters.first : [];
      const second = Array.isArray(voters.second) ? voters.second : [];
      if (first.includes(userId) || second.includes(userId)) voted++;
    }
  }
  return voted;
}

/**
 * Headline numbers for one track in one tournament: how far it got, what it
 * won, and where it finished.
 */
function SummariseTrackRun(tournament, track, context = {}) {
  const progression = BuildTrackProgression(tournament, track);
  if (!progression.length) return null;

  // The caller knows the tournament's name and which contest the database says
  // is under way; on its own this has only the matches, so fall back to those.
  const isRunning =
    context.isRunning === undefined
      ? IsTournamentRunning(tournament)
      : Boolean(context.isRunning);

  const wins = progression.filter((r) => r.won === true).length;
  const losses = progression.filter((r) => r.won === false).length;
  const last = progression[progression.length - 1];
  const { finalRound, decidingMatch, thirdPlaceMatches, stages, isDoubleElim } =
    GetTournamentStructure(tournament);

  // an unflagged playoff still needs marking, or the renderer labels it "Final"
  //
  // None of those names hold while the contest is running. Each is read off the
  // matches played so far, so mid-contest the latest round looks like the last
  // one: a match won in round three gets labelled "Final", and four matches in
  // a round that happens to hold eight tracks become "quarter-finals". The
  // round number is the only thing still true, so it is all a live run is given.
  for (const round of progression) {
    round.isPlayoff = !isRunning && thirdPlaceMatches.has(round.match);
    round.isFinal = !isRunning && round.match === decidingMatch;
    round.stage = round.isPlayoff
      ? "Third-place match"
      : round.isFinal
      ? "Final"
      : (!isRunning && stages.get(round.match)) || null;
  }

  const standings = isRunning ? GetLiveStandings(tournament) : null;
  // Not out until it has lost: a track whose last match was a win, or a tie
  // waiting on its replay, is still in the contest.
  const stillIn = Boolean(standings && standings.alive.has(trackKey(last.self)));

  const { placement, exit } = describePlacement(last, {
    finalRound,
    decidingMatch,
    thirdPlaceMatches,
    isDoubleElim,
    isRunning,
    stillIn,
    tracksRemaining: standings ? standings.tracksRemaining : null,
    roundsRemaining: standings ? standings.roundsRemaining : null,
  });

  return {
    progression,
    wins,
    losses,
    matches: progression.length,
    totalVotes: progression.reduce((sum, r) => sum + r.self.points, 0),
    bestMargin: progression.reduce(
      (best, r) => (r.won === true && r.margin > best ? r.margin : best),
      0
    ),
    finishedAt: last.round,
    // The last round played so far, which is not the contest's last round while
    // it is still running.
    finalRound,
    isRunning,
    stillIn,
    tracksRemaining: standings ? standings.tracksRemaining : null,
    roundsRemaining: standings ? standings.roundsRemaining : null,
    // Won its last match in the deciding round and it was not the third-place
    // playoff -- that is the tournament winner.
    decidingMatch,
    isDoubleElim,
    // Never while the contest is running: mid-bracket the deciding match is
    // only a guess at the latest one played, so crowning its winner would name
    // a champion the votes have not chosen.
    isChampion: !isRunning && last.won === true && last.match === decidingMatch,
    // top four, so the summary line can be given more weight than a mid-bracket exit
    isPodium: !isRunning && PODIUM.has(placement),
    placement,
    exit,
  };
}

const PODIUM = new Set(["Winner", "Runner-up", "3rd place", "4th place"]);

/**
 * How much of a running contest a track still has in front of it.
 *
 * The count comes from how many tracks are left rather than from the stored
 * bracket, so an irregular contest -- byes, repechage rounds, tie replays --
 * can take a round longer than the halving suggests. Stages are named only
 * where they follow with certainty: two tracks left is the final, four is the
 * semi-finals.
 */
function describeRoundsLeft(tracksRemaining, roundsRemaining) {
  if (!roundsRemaining) return "Still in the running";
  if (tracksRemaining === 2) return "Still in the running — the final left to play";
  if (tracksRemaining === 4) {
    return "Still in the running — the semi-finals and the final left to play";
  }
  const rounds =
    roundsRemaining === 1 ? "1 more round" : `${roundsRemaining} more rounds`;
  return `Still in the running — ${rounds} to play, ${tracksRemaining} tracks left`;
}

/**
 * Where a track finished, and the sentence describing how it went out.
 *
 * Deliberately does not name stages like "quarter-final" from the round number.
 * Only three of thirteen contests ran a clean halving bracket -- byes, repechage
 * rounds and tie replays mean a round can hold an odd number of matches, and a
 * track can play twice in the same round (94 runs do). Counting back from the
 * final then labels two different matches "QF", which is how "Shore of Dreams"
 * came to show two quarter-finals in one run. The round number is always true;
 * the invented stage name is not.
 */
function describePlacement(last, context) {
  const {
    finalRound,
    decidingMatch,
    thirdPlaceMatches,
    isDoubleElim,
    isRunning,
    stillIn,
    tracksRemaining,
    roundsRemaining,
  } = context;

  // A running contest has decided nothing yet, so it gets its own wording
  // throughout: there is no champion, no runner-up and no third place until the
  // last vote is in.
  if (isRunning) {
    if (stillIn) {
      return {
        placement: "Still in",
        exit: describeRoundsLeft(tracksRemaining, roundsRemaining),
      };
    }
    if (last.won === null) {
      return {
        placement: `Round ${last.round}`,
        exit: `Round ${last.round} ended level, awaiting a replay`,
      };
    }
    // "of N" is deliberately absent: the contest has not reached its last round,
    // so there is no total to count towards yet.
    return {
      placement: `Out in round ${last.round}`,
      exit: `Knocked out in round ${last.round}`,
    };
  }

  if (thirdPlaceMatches.has(last.match)) {
    if (last.won === null) {
      return { placement: "Joint 3rd place", exit: "Third-place match ended level" };
    }
    return last.won
      ? { placement: "3rd place", exit: "Won the third-place match" }
      : { placement: "4th place", exit: "Lost the third-place match" };
  }

  if (last.match === decidingMatch) {
    // a tied final is left as a tie rather than crowning someone
    if (last.won === null) {
      return { placement: "Finalist (tied)", exit: "The final ended level" };
    }
    return last.won
      ? { placement: "Winner", exit: "Won the tournament" }
      : { placement: "Runner-up", exit: "Lost the final" };
  }

  if (isDoubleElim) {
    const side = last.bracket === "losersBracket" ? "losers" : "winners";
    return {
      placement: `${side === "losers" ? "Losers" : "Winners"} bracket, R${last.round}`,
      exit: `Knocked out in the ${side} bracket, round ${last.round}`,
    };
  }

  if (last.stage === "Semi-final" || last.stage === "Quarter-final") {
    return {
      placement: `${last.stage}s`,
      exit: `Knocked out in the ${last.stage.toLowerCase()}s`,
    };
  }

  return {
    placement: `Round ${last.round} of ${finalRound}`,
    exit: `Knocked out in round ${last.round} of ${finalRound}`,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    BuildTrackIndex,
    BuildTrackProgression,
    SummariseTrackRun,
    CountUserVotesForTrack,
    normaliseTitle,
    trackKey,
    isPublicMatch,
    isSettledMatch,
    IsTournamentRunning,
    GetLiveStandings,
    namedStages,
    GetTournamentStructure,
    matchWinner,
  };
}
