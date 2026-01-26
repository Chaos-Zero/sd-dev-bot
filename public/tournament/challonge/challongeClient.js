const qs = require("qs");
const axios = require("axios");

const BASE_URL = "https://api.challonge.com/v1";
const challongeKey = process.env.CHALLONGE_KEY;

// Create a pre-configured Axios instance
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
});

function getHeaders() {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Challonge API Client",
    Authorization: `Bearer ${challongeKey}`,
  };
}

function getStartHeaders(apiKey) {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function get(endpoint) {
  try {
    const response = await axiosInstance.get(endpoint, {
      headers: getHeaders(challongeKey),
    });
    return response.data;
  } catch (error) {
    console.error("GET request failed:", error);
    throw error;
  }
}

async function participantsGet(endpoint) {
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
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
      headers: getHeaders(challongeKey),
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
      headers: getHeaders(challongeKey),
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
      headers: getHeaders(apiKey),
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
  /*  // Endpoint with the API key as a query parameter
  const endpoint = `${BASE_URL}/tournaments/${tournamentUrl}/participants/bulk_add.json?api_key=${challongeKey}`;

  const participants = names.map((name, index) => ({ 
        name,
        seed: index + 1  // Seeds start from 1 for the first participant
    }));

  try {
    // Send the POST request
    const response = await axios.post(
      endpoint,
      { participants },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Challonge API Client",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "Bulk addition of participants failed:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}
*/
  for (const name of names) {
    await addParticipant(tournamentName, name, challongeKey);
  }
}

async function addParticipant(tournamentName, name, apiKey) {
  const endpoint = `${BASE_URL}/tournaments/${tournamentName}/participants.json?api_key=${apiKey}`;

  try {
    const response = await axios.post(
      endpoint,
      { participant: { name } },
      {
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
    // Fetch participants
    const participantsData = await participantsGet(
      `/tournaments/${tournamentUrl}/participants.json`
    );

    // Ensure participants are fetched correctly
    if (!participantsData || participantsData.length === 0) {
      throw new Error("No participants found.");
    }

    const participants = participantsData.map((p) => ({
      id: p.participant.id,
      name: p.participant.name,
    }));

    // Fetch matches
    const matchesData = await participantsGet(
      `/tournaments/${tournamentUrl}/matches.json`
    );

    if (!matchesData || matchesData.length === 0) {
      throw new Error("No matches found.");
    }

    const matches = matchesData.map((m) => ({
      challongeMatchId: m.match.id,
      player1Id: m.match.player1_id,
      player2Id: m.match.player2_id,
      round: m.match.round,
      state: m.match.state,
      matchNumber: m.match.suggested_play_order, // Derived match number
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
    const response = await axios.post(
      `${BASE_URL}/tournaments/${tournamentName}/start.json`,
      qs.stringify({ api_key: challongeKey }),
      {
        headers: getHeaders(challongeKey),
      }
    );
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
        headers: getStartHeaders(challongeKey),
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
        headers: getStartHeaders(challongeKey),
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
          challongeId: match.id,
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

async function endChallongeMatch(tournamentUrl, matchId, scoresCsv) {
  try {
    const match = await getChallongeMatch(tournamentUrl, matchId);

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
    const response = await axiosInstance.put(endpoint, qs.stringify(data));
    
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
  const endpoint = `${BASE_URL}/tournaments/${tournamentUrl}/matches/${matchId}.json?api_key=${challongeKey}`;
  try {
    const response = await axios.get(endpoint);
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
  const endpoint = `${BASE_URL}/tournaments/${tournamentUrl}/matches/${matchId}.json`;
  const data = {
    "match[state]": "complete",
    api_key: challongeKey,
  };

  try {
    const response = await axios.put(endpoint, qs.stringify(data));
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
  const endpoint = `${BASE_URL}/tournaments/${tournamentUrl}.json`;
  const data = {
    "tournament[state]": "complete",
    api_key: challongeKey,
  };
  try {
    const response = await axios.put(endpoint, qs.stringify(data), {
      headers: getHeaders(challongeKey),
    });
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
    const participantsResponse = await axios.get(
      `${BASE_URL}/tournaments/${tournamentName}/participants.json`,
      {
        params: {
          api_key: challongeKey,
        },
      }
    );
    const participants = participantsResponse.data;

    // Step 2: Find the participant with the given seed number
    const participant = participants.find(
      (p) => p.participant.seed === seedNumber
    );

    if (!participant) {
      console.log(`No participant found with seed number ${seedNumber}`);
      return;
    }

    // Step 3: Update the participant's name
    const participantId = participant.participant.id;
    const updateData = {
      api_key: challongeKey,
      "participant[name]": newName,
    };

    const updateResponse = await axios.put(
      `${BASE_URL}/tournaments/${tournamentName}/participants/${participantId}.json`,
      qs.stringify(updateData),
      {
        headers: getHeaders(challongeKey),
      }
    );

    if (updateResponse.status === 200) {
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

async function getMatchIdByNumber(tournamentName, matchNumber, options = {}) {
  try {
    // Log the request URL
    console.log(`Requesting matches for tournament: ${tournamentName}`);

    const response = await axios.get(
      `${BASE_URL}/tournaments/${tournamentName}/matches.json`,
      {
        params: {
          api_key: challongeKey,
        },
      }
    );

    const matches = response.data.map((m) => m.match || m);

    // Log the matches array to ensure it's not empty
    if (!matches.length) {
      console.error('No matches found for this tournament');
      return null;
    }

    // Log the match number being searched for
    console.log(`Searching for match number: ${matchNumber}`);

    let match = null;
    if (options.matchType === "third_place") {
      match = matches.find((m) => m.is_third_place_match === true);
    } else if (options.matchType === "final") {
      const nonThirdPlace = matches.filter(
        (m) => m.is_third_place_match !== true
      );
      match = nonThirdPlace
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
    } else {
      match = matches.find(
        (m) => m.suggested_play_order === matchNumber
      );
    }

    if (!match) {
      console.error(`No match found with match number ${matchNumber}`);
      return null;
    }

    // Log the found match ID
    console.log(`Found match ID: ${match.id}`);

    return match.id;
  } catch (error) {
    console.error("Failed to retrieve matches:", error);
    throw error;
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
