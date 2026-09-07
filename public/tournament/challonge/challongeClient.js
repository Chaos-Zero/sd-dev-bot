const qs = require("qs");
const axios = require("axios");

const BASE_URL = "https://api.challonge.com/v1";
const challongeKey = process.env.CHALLONGE_KEY;

// Create a pre-configured Axios instance
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
});

// This file is eval'd into several module scopes (tournamentFunctions,
// singleTournament, doubleElimTournament, ...), so each copy gets its own
// module-level variables. Shared state therefore lives on `global` so the
// cache and the rate-limit breaker are shared across all of them.
const challongeState = (global.__challongeState = global.__challongeState || {
  participants: new Map(), // tournamentUrl -> participant array
  matches: new Map(), // tournamentUrl -> match array
  blockedUntil: 0, // epoch ms; set when Challonge returns 429
});

// Challonge allows 500 requests per 30 days on the free plan. Once we are over
// the limit every further call is wasted, so short-circuit them locally until
// the window Challonge told us about has passed.
function challongeBlockedFor() {
  return Math.max(0, challongeState.blockedUntil - Date.now());
}

// The quota allowance is a rolling window, so it frees up continuously rather
// than at a single reset time - and Challonge's retry-after on a quota 429 is a
// fixed 30 day constant, not a real countdown. Honouring it literally would
// park the bot for a month. Instead cap the pause: long enough to stop
// hammering, short enough that the tournament resumes on its own as requests
// age out of the window.
const RATE_LIMIT_MAX_COOLDOWN_MS = 15 * 60 * 1000;

function noteRateLimit(error) {
  if (error?.response?.status !== 429) return;
  const retryAfter = Number(error.response.headers?.["retry-after"]);
  const requested =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : RATE_LIMIT_MAX_COOLDOWN_MS;
  // Respect a genuinely short retry-after (a burst limit), cap a long one.
  const waitMs = Math.min(requested, RATE_LIMIT_MAX_COOLDOWN_MS);
  challongeState.blockedUntil = Date.now() + waitMs;
  console.error(
    `Challonge request limit exceeded. Backing off ${Math.round(
      waitMs / 60000
    )} min, then retrying (quota frees up gradually).`
  );
}

axiosInstance.interceptors.request.use((config) => {
  const remaining = challongeBlockedFor();
  if (remaining > 0) {
    throw new Error(
      `Challonge request limit exceeded; skipping call (retry in ~${Math.ceil(
        remaining / 60000
      )} minutes)`
    );
  }

  // API v1 authenticates on the api_key param (or HTTP basic); it has no bearer
  // token scheme. Attaching the key here means no call site can forget it, and
  // callers that pass their own key still win.
  config.params = config.params || {};
  if (config.params.api_key == null) {
    config.params.api_key = challongeKey;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    noteRateLimit(error);
    // A 404/410 means we acted on an id Challonge no longer recognises, which
    // normally means the bracket was reset or participants were changed by hand
    // on the site. Drop the cached ids for that tournament so the next call
    // refetches instead of reusing ids that no longer exist.
    const status = error?.response?.status;
    if (status === 404 || status === 410) {
      const match = /\/tournaments\/([^/.?]+)/.exec(error?.config?.url || "");
      if (match) {
        console.warn(
          `Challonge returned ${status} for tournament ${match[1]}; clearing cached ids.`
        );
        invalidateChallongeCache(match[1]);
      }
    }
    return Promise.reject(error);
  }
);

// Cached reads. Match ids and participant ids are stable for the life of a
// tournament, so the expensive "fetch every match / every participant" calls
// only need to happen once per tournament instead of once per match.
function invalidateChallongeCache(tournamentUrl) {
  challongeState.participants.delete(tournamentUrl);
  challongeState.matches.delete(tournamentUrl);
}

// Form headers for the write endpoints. Authentication is not done here - see
// the api_key interceptor above.
function getHeaders() {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Challonge API Client",
  };
}

async function get(endpoint) {
  try {
    const response = await axiosInstance.get(endpoint);
    return response.data;
  } catch (error) {
    console.error("GET request failed:", error);
    throw error;
  }
}

async function participantsGet(endpoint) {
  try {
    const response = await axiosInstance.get(endpoint, {
      params: {
        api_key: challongeKey,
      },
    });
    return response.data;
  } catch (error) {
    console.error(
      "GET request failed:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function post(endpoint, data) {
  try {
    const response = await axiosInstance.post(endpoint, qs.stringify(data), {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error(
      "POST request failed:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function put(endpoint, data) {
  try {
    const response = await axiosInstance.put(endpoint, qs.stringify(data), {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error(
      "PUT request failed:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function postBulk(endpoint, data, apiKey) {
  try {
    // Serialize the data into 'x-www-form-urlencoded' format
    const serializedData = qs.stringify(data, {
      arrayFormat: "indices",
      encode: false,
    });

    // Make the POST request
    const response = await axiosInstance.post(endpoint, serializedData, {
      headers: getHeaders(),
    });

    return response.data;
  } catch (error) {
    console.error(
      "POST request failed:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function createChallongeTournament(
  name,
  url,
  description,
  tournamentFormat,
  isHiddenBracket
) {
  try {
    const data = {
      api_key: challongeKey,
      "tournament[name]": name,
      "tournament[url]": url,
      "tournament[description]": description,
      "tournament[sequential_pairings]": "true",
      "tournament[hold_third_place_match]": "true",
      "tournament[tournament_type]":
        tournamentFormat == "Double Elimination"
          ? "double elimination"
          : "single elimination",
      "tournament[hide_seeds]": isHiddenBracket ? "true" : "false", // needs to be lowercase string value
    };
    return await post("/tournaments.json", data);
  } catch (error) {
    console.error(
      "Failed to create tournament:",
      error.response?.data?.errors || error.message
    );
    throw error;
    //console.l
  }
}

async function addChallongeEntrants(names, tournamentName) {
  if (!names || names.length === 0) return;

  const participants = names.map((name, index) => ({
    name,
    seed: index + 1, // seeds start at 1
  }));

  // One bulk_add call instead of one POST per entrant: a 64-entrant bracket
  // goes from 64 requests to 1.
  try {
    const response = await axiosInstance.post(
      `/tournaments/${tournamentName}/participants/bulk_add.json`,
      { participants },
      {
        params: { api_key: challongeKey },
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Challonge API Client",
        },
      }
    );
    invalidateChallongeCache(tournamentName);
    return response.data;
  } catch (error) {
    // Don't burn the remaining quota on a retry loop if we are rate limited.
    if (error?.response?.status === 429 || challongeBlockedFor() > 0) {
      throw error;
    }
    console.warn(
      "bulk_add failed, falling back to one request per participant:",
      error.response ? error.response.data : error.message
    );
  }

  for (const name of names) {
    await addParticipant(tournamentName, name, challongeKey);
  }
  invalidateChallongeCache(tournamentName);
}

async function addParticipant(tournamentName, name, apiKey) {
  const endpoint = `/tournaments/${tournamentName}/participants.json`;

  try {
    const response = await axiosInstance.post(
      endpoint,
      { participant: { name } },
      {
        params: { api_key: apiKey },
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Challonge API Client",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      "Failed to add participant:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function updateOrder(tournamentUrl) {
  try {
    const data = {
      api_key: challongeKey,
      "tournament[sequential_pairings]": true,
    };

    const endpoint = `/tournaments/${tournamentUrl}.json`;

    //console.log(data);
    return await put(endpoint, data);
  } catch (error) {
    console.error("Failed to update tournament:", error.response.errors);
    throw error;
  }
}

async function getTournamentStructure(tournamentUrl) {
  try {
    // This reads volatile per-match state (current players, winner, loser) and
    // is the "what does the bracket actually look like now" call, so it always
    // goes to Challonge - a warm cache here would silently mask results entered
    // by hand on the Challonge site.
    const participantsData = await getChallongeParticipants(tournamentUrl, {
      forceRefresh: true,
    });

    // Ensure participants are fetched correctly
    if (!participantsData || participantsData.length === 0) {
      throw new Error("No participants found.");
    }

    const participants = participantsData.map((p) => ({
      id: p.id,
      name: p.name,
    }));

    const matchesData = await getChallongeMatches(tournamentUrl, {
      forceRefresh: true,
    });

    if (!matchesData || matchesData.length === 0) {
      throw new Error("No matches found.");
    }

    const matches = matchesData.map((m) => ({
      challongeMatchId: m.id,
      player1Id: m.player1_id,
      player2Id: m.player2_id,
      winnerId: m.winner_id,
      loserId: m.loser_id,
      round: m.round,
      state: m.state,
      matchNumber: m.suggested_play_order, // Derived match number
    }));

    // Convert player IDs to player names for easier readability
    matches.forEach((match) => {
      var bracket =
        parseInt(match.round) < 0 ? "losersBracket" : "winnersBracket";

      var roundNumber =
        bracket == "losersBracket"
          ? Math.abs(parseInt(match.round))
          : match.round;

      match.bracket = bracket;
      match.player1 = participants.find((p) => p.id === match.player1Id)?.name;
      match.player2 = participants.find((p) => p.id === match.player2Id)?.name;
      match.winner = participants.find((p) => p.id === match.winnerId)?.name;
      match.loser = participants.find((p) => p.id === match.loserId)?.name;
      match.round = roundNumber;
    });

    //console.log(matches);
    return {
      matches,
      participants,
    };
  } catch (error) {
    console.error("Failed to fetch tournament structure:", error);
    throw error;
  }
}

async function startTournament(tournamentName) {
  try {
    const response = await axiosInstance.post(
      `/tournaments/${tournamentName}/start.json`,
      qs.stringify({ api_key: challongeKey }),
      {
        headers: getHeaders(),
      }
    );
    // Starting the tournament is what generates the matches, so anything
    // cached before this point is stale.
    invalidateChallongeCache(tournamentName);
    console.log(`Tournament ${tournamentName} started successfully`);
    return response.data;
  } catch (error) {
    console.error("Failed to start the tournament:", error);
    throw error;
  }
}

async function startChallongeMatch(tournamentUrl, matchId) {
  try {
    const endpoint = `/tournaments/${tournamentUrl}/matches/${matchId}/mark_as_underway.json`;

    const response = await axiosInstance.post(
      endpoint,
      qs.stringify({ api_key: challongeKey }),
      {
        headers: getHeaders(),
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      "POST request failed:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function unmarkChallongeMatch(tournamentUrl, matchId) {
  try {
    const endpoint = `/tournaments/${tournamentUrl}/matches/${matchId}/unmark_as_underway.json`;

    const response = await axiosInstance.post(
      endpoint,
      qs.stringify({ api_key: challongeKey }),
      {
        headers: getHeaders(),
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      "POST request failed:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getCurrentMatch(tournamentUrl) {
  const matchesData = await get(`/tournaments/${tournamentUrl}/matches.json`);
  return matchesData.find((m) => m.match.state === "open");
}

async function saveTournamentStructure(urlName, tournamentDb, db) {
  try {
    const { matches, participants } = await getTournamentStructure(urlName);

    if (!matches || matches.length === 0) {
      throw new Error("No matches to save.");
    }

    if (!participants || participants.length === 0) {
      throw new Error("No participants to save.");
    }

    // Assign participants to tournamentDb
    tournamentDb.entrants = participants;

    var brackets = [];
    matches.forEach((match) => {
      var matchEntrant1, matchEntrant2;
      if (!match.player1) {
        matchEntrant1 = {
          match: match.matchNumber,
          challongeId: match.challongeMatchId,
          bracket: match.bracket,
          round: match.round,
        };
      } else {
        var entrant1 = findObjectByName(tournamentDb.entrants, match.player1);
        matchEntrant1 = {
          name: entrant1.name,
          title: entrant1.title,
          link: entrant1.link,
          userId: match.player1Id,
          match: match.matchNumber,
          challongeId: match.challongeMatchId,
          bracket: match.bracket,
          round: match.round,
        };
      }
      if (!match.player2) {
        matchEntrant2 = {
          match: match.matchNumber,
          challongeId: match.challongeMatchId,
          bracket: match.bracket,
          round: match.round,
        };
      } else {
        var entrant2 = findObjectByName(tournamentDb.entrants, match.player2);
        matchEntrant2 = {
          name: entrant2.name,
          title: entrant2.title,
          link: entrant2.link,
          userId: match.player2Id,
          match: match.matchNumber,
          challongeId: match.challongeMatchId,
          bracket: match.bracket,
          round: match.round,
        };
      }
      brackets.push(matchEntrant1);
      brackets.push(matchEntrant2);
    });

    db.read();

    getCurrentTournament(db)
      .then((currentTournamentName) => {
        db.get("tournaments")
          .nth(0)
          .set(`${currentTournamentName}.brackets`, brackets)
          .write();
      })
      .catch((error) => {
        console.error("Error: Couldn't get the current tournament name.");
      });
  } catch (error) {
    console.error("Error saving tournament structure:", error);
  }
}

function findObjectByName(arr, searchString) {
  if (!Array.isArray(arr)) {
    console.error(
      "findObjectByName: Provided array is not an array or is undefined."
    );
    return undefined;
  }

  const result = arr.find((entry) => searchString.includes(entry.name));

  if (!result) {
    console.error(`findObjectByName: No match found for "${searchString}"`);
  }

  return result;
}

async function endChallongeMatch(
  tournamentUrl,
  matchId,
  scoresCsv,
  prefetchedMatch
) {
  try {
    // Callers that already hold the match (endMatchByIdWithEntrants) pass it in
    // rather than making us fetch the same match a second time. The double elim
    // path passes a winnerId here, which older versions of this function
    // ignored, so only accept an actual match object.
    const usablePrefetch =
      prefetchedMatch && typeof prefetchedMatch === "object"
        ? prefetchedMatch
        : null;
    const match =
      usablePrefetch || (await getChallongeMatch(tournamentUrl, matchId));

    if (!match) {
      throw new Error("Match not found.");
    }

    // Determine the winner ID based on the scores
    const [score1, score2] = scoresCsv.split("-").map(Number);
    let winnerId;

    if (score1 > score2) {
      winnerId = match.player1_id;
    } else if (score2 > score1) {
      winnerId = match.player2_id;
    } else {
      throw new Error("Scores must result in a clear winner.");
    }

    // Prepare the data for ending the match
    const data = {
      api_key: challongeKey,
      "match[scores_csv]": scoresCsv,
      "match[winner_id]": winnerId,
      "match[state]": "complete",
    };

    const endpoint = `/tournaments/${tournamentUrl}/matches/${matchId}.json`;
    const response = await axiosInstance.put(endpoint, qs.stringify(data), {
      headers: getHeaders(),
    });

     if (response.status === 200) {
      console.log(`Match ${matchId} completed successfully.`);
    } else {
      console.error("Failed to complete the match:", response.data);
    }

    return response.data;
  } catch (error) {
    console.error(
     "Failed to complete the match:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getChallongeMatch(tournamentUrl, matchId) {
  const endpoint = `/tournaments/${tournamentUrl}/matches/${matchId}.json`;
  try {
    const response = await axiosInstance.get(endpoint, {
      params: { api_key: challongeKey },
    });
    return response.data.match;
  } catch (error) {
    console.error(
      "Failed to retrieve match:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function completeChallongeMatch(tournamentUrl, matchId) {
  const match = await getChallongeMatch(tournamentUrl, matchId);
  if (!match) {
    throw new Error("Failed to retrieve match data");
  }

  // Check if scores are set
  //console.log("Current scores:", match.scores_csv);

  if (!match.scores_csv) {
    throw new Error("Scores are not set for this match");
  }

  // If scores are set, try to complete the match
  const endpoint = `/tournaments/${tournamentUrl}/matches/${matchId}.json`;
  const data = {
    "match[state]": "complete",
    api_key: challongeKey,
  };

  try {
    const response = await axiosInstance.put(endpoint, qs.stringify(data), {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error(
      "Failed to complete match:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function completeChallongeTournament(tournamentUrl) {
  const endpoint = `/tournaments/${tournamentUrl}.json`;
  const data = {
    "tournament[state]": "complete",
    api_key: challongeKey,
  };
  try {
    const response = await axiosInstance.put(endpoint, qs.stringify(data), {
      headers: getHeaders(),
    });
    invalidateChallongeCache(tournamentUrl);
    return response.data;
  } catch (error) {
    console.error(
      "Failed to complete tournament:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function updateParticipantNameBySeed(
  tournamentName,
  seedNumber,
  newName
) {
  try {
    // Served from cache after the first call, so a round's worth of renames
    // costs one participants fetch rather than one per entrant.
    const participants = await getChallongeParticipants(tournamentName);

    // Step 2: Find the participant with the given seed number
    const participant = participants.find((p) => p.seed === seedNumber);

    if (!participant) {
      console.log(`No participant found with seed number ${seedNumber}`);
      return;
    }

    // Already correct (e.g. a resend) - nothing to spend a request on.
    if (participant.name === newName) {
      return;
    }

    // Step 3: Update the participant's name
    const participantId = participant.id;
    const updateData = {
      api_key: challongeKey,
      "participant[name]": newName,
    };

    const updateResponse = await axiosInstance.put(
      `/tournaments/${tournamentName}/participants/${participantId}.json`,
      qs.stringify(updateData),
      {
        headers: getHeaders(),
      }
    );

    if (updateResponse.status === 200) {
      participant.name = newName; // keep the cache in step with Challonge
      console.log(
        `Participant with seed ${seedNumber} updated to "${newName}"`
      );
    } else {
      console.error("Failed to update participant:", updateResponse.data);
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

async function getChallongeParticipants(tournamentName, options = {}) {
  if (
    !options.forceRefresh &&
    challongeState.participants.has(tournamentName)
  ) {
    return challongeState.participants.get(tournamentName);
  }

  const response = await axiosInstance.get(
    `/tournaments/${tournamentName}/participants.json`,
    {
      params: {
        api_key: challongeKey,
      },
    }
  );
  const participants = response.data.map((p) => p.participant || p);
  challongeState.participants.set(tournamentName, participants);
  return participants;
}

// Match ids and their play order are fixed once the tournament starts, and
// every caller here only needs those stable fields, so this list is cached for
// the life of the tournament. Volatile per-match data (current players, scores)
// still comes from getChallongeMatch.
async function getChallongeMatches(tournamentName, options = {}) {
  if (!options.forceRefresh && challongeState.matches.has(tournamentName)) {
    return challongeState.matches.get(tournamentName);
  }

  const response = await axiosInstance.get(
    `/tournaments/${tournamentName}/matches.json`,
    {
      params: {
        api_key: challongeKey,
      },
    }
  );
  const matches = response.data.map((m) => m.match || m);
  // Don't cache an empty list: the bracket may simply not be generated yet
  // (startTournament is fired without await at some call sites), and caching
  // that would make every later lookup miss.
  if (matches.length) {
    challongeState.matches.set(tournamentName, matches);
  }
  return matches;
}

async function getChallongeParticipantMaps(tournamentName) {
  const participants = await getChallongeParticipants(tournamentName);
  const bySeed = {};
  const byName = {};
  for (const participant of participants) {
    if (participant?.seed != null) {
      bySeed[participant.seed] = participant.id;
    }
    if (participant?.name) {
      byName[participant.name] = participant.id;
    }
  }
  return { bySeed, byName };
}

function selectMatch(matches, matchNumber, options = {}) {
  if (options.matchType === "third_place") {
    return matches.find((m) => m.is_third_place_match === true);
  }

  if (options.matchType === "final") {
    const nonThirdPlace = matches.filter((m) => m.is_third_place_match !== true);
    return nonThirdPlace
      .slice()
      .sort((a, b) => {
        const roundA = a.round ?? 0;
        const roundB = b.round ?? 0;
        if (roundA !== roundB) {
          return roundA - roundB;
        }
        const orderA = a.suggested_play_order ?? 0;
        const orderB = b.suggested_play_order ?? 0;
        return orderA - orderB;
      })
      .pop();
  }

  return matches.find((m) => m.suggested_play_order === matchNumber);
}

async function getMatchIdByNumber(tournamentName, matchNumber, options = {}) {
  try {
    let matches = await getChallongeMatches(tournamentName);
    let match = selectMatch(matches, matchNumber, options);

    // A miss can mean the cache predates the bracket being generated, so pay
    // for one refresh before giving up.
    if (!match && challongeState.matches.has(tournamentName)) {
      matches = await getChallongeMatches(tournamentName, {
        forceRefresh: true,
      });
      match = selectMatch(matches, matchNumber, options);
    }

    if (!matches.length) {
      console.error("No matches found for this tournament");
      return null;
    }

    if (!match) {
      console.error(`No match found with match number ${matchNumber}`);
      return null;
    }

    return match.id;
  } catch (error) {
    console.error("Failed to retrieve matches:", error);
    throw error;
  }
}

async function endMatchByIdWithEntrants(
  tournamentName,
  matchId,
  entrant1Id,
  entrant2Id,
  entrant1Score,
  entrant2Score
) {
  try {
    const match = await getChallongeMatch(tournamentName, matchId);
    if (!match) {
      throw new Error("Match not found.");
    }

    const player1Id = match.player1_id;
    const player2Id = match.player2_id;
    if (!player1Id || !player2Id) {
      throw new Error("Match is missing player IDs.");
    }

    let scoresCsv;
    if (player1Id === entrant1Id && player2Id === entrant2Id) {
      scoresCsv = `${entrant1Score}-${entrant2Score}`;
    } else if (player1Id === entrant2Id && player2Id === entrant1Id) {
      scoresCsv = `${entrant2Score}-${entrant1Score}`;
    } else {
      throw new Error("Entrant IDs do not match match player IDs.");
    }

    await endChallongeMatch(tournamentName, matchId, scoresCsv, match);
    console.log(`Match ${matchId} updated successfully.`);
  } catch (error) {
    console.error("Failed to update match by ID:", error);
  }
}


async function endMatchByNumber(
  tournamentName,
  matchNumber,
  scoresCsv,
  options = {}
) {
  try {
    // Get the match ID based on the match number
    const matchId = await getMatchIdByNumber(
      tournamentName,
      matchNumber,
      options
    );

    if (!matchId) {
      console.error(`Could not find a match with number ${matchNumber}`);
      return;
    }

    // Update the match with the provided scores
    await endChallongeMatch(tournamentName, matchId, scoresCsv);
    console.log(`Match ${matchNumber} updated successfully`);
  } catch (error) {
    console.error("Failed to update match by number:", error);
  }
}

async function startMatchByNumber(tournamentName, matchNumber, options = {}) {
  try {
    // Get the match ID based on the match number
    const matchId = await getMatchIdByNumber(
      tournamentName,
      matchNumber,
      options
    );

    if (!matchId) {
      console.error(`Could not find a match with number ${matchNumber}`);
      return;
    }

    // Start the match
    await startChallongeMatch(tournamentName, matchId);
    console.log(`Match ${matchNumber} started successfully`);
  } catch (error) {
    console.error("Failed to start match by number:", error);
  }
}
