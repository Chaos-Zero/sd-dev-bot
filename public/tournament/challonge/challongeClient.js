const qs = require("qs");
const axios = require("axios");

const BASE_URL = "https://api.challonge.com/v1";
const challongeKey = process.env.CHALLONGE_KEY;

// Create a pre-configured Axios instance
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
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
  tournamentFormat
) {
  if (tournamentFormat == "Double Elimination") {
    try {
      const data = {
        api_key: challongeKey,
        "tournament[name]": name,
        "tournament[tournament_type]": "double elimination",
        "tournament[url]": url,
        "tournament[description]": description,
        "tournament[sequential_pairings]": "True",
      };

      //console.log(data);
      return await post("/tournaments.json", data);
    } catch (error) {
      console.error("Failed to create tournament:", error.response.errors);
      throw error;
    }
  } else {
    try {
      const data = {
        api_key: challongeKey,
        "tournament[name]": name,
        "tournament[url]": url,
        "tournament[description]": description,
        "tournament[sequential_pairings]": "True",
      };

      //console.log(data);
      return await post("/tournaments.json", data);
    } catch (error) {
      console.error("Failed to create tournament:", error.response.errors);
      throw error;
    }
  }
}
async function addChallongeEntrants(names, tournamentUrl) {
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
    await addParticipant(tournamentUrl, name, challongeKey);
  }
}

async function addParticipant(tournamentUrl, name, apiKey) {
  const endpoint = `${BASE_URL}/tournaments/${tournamentUrl}/participants.json?api_key=${apiKey}`;

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
    const participants = participantsData.map((p) => ({
      id: p.participant.id,
      name: p.participant.name,
    }));

    // Fetch matches
    const matchesData = await participantsGet(
      `/tournaments/${tournamentUrl}/matches.json`
    );
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
    };
  } catch (error) {
    console.error("Failed to fetch tournament structure:", error);
    throw error;
  }
}

async function startTournament(tournamentUrl) {
  try {
    // Endpoint to start the tournament
    const endpoint = `/tournaments/${tournamentUrl}/start.json`;

    // Using the POST function we defined before to "start" the tournament
    return await put(endpoint, {
      api_key: challongeKey,
    });
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
  var brackets = [];
  getTournamentStructure(urlName)
    /*
     const matches = matchesData.map((m) => ({
      id: m.match.id,
      player1Id: m.match.player1_id,
      player2Id: m.match.player2_id,
      round: m.match.round,
      state: m.match.state,
      matchNumber: m.match.suggested_play_order, // Derived match number
    }));
*/

    .then((matches) => {
      for (var match of matches.matches) {
        //console.log(match);
        var matchEntrant1, matchEntrant2;
        if (!match.player1) {
          matchEntrant1 = {
            match: match.matchNumber,
            challongeId: match.challongeMatchId,
            bracket: match.bracket,
            round: match.round,
          };
        } else {
          //console.log(match.player1);
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
      }
      db.read();

      getCurrentTournament(db)
        .then((currentTournamentName) => {
          db.get("tournaments")
            .nth(0)
            .set(`${currentTournamentName}.brackets`, brackets)
            .write();
        })
        .catch((error) => {
          console.error("Error: ", "Coulnd't get name");
        });
    })
    .catch((error) => {
      console.error("Error: ", error);
    });
}

function findObjectByName(arr, searchString) {
  return arr.find((entry) => searchString.includes(entry.name));
}

async function endChallongeMatch(tournamentUrl, matchId, scoresCsv, winnerId) {
  try {
    const data = {
      api_key: challongeKey,
      "match[winner_id]": winnerId.toString(),
      "match[scores_csv]": scoresCsv,
    };

    const endpoint = `/tournaments/${tournamentUrl}/matches/${matchId}.json`;
    const response = await axiosInstance.put(endpoint, qs.stringify(data));
    return response.data;
  } catch (error) {
    console.error(
      "Update match request failed:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

/*async function completeChallongeMatch(tournamentUrl, matchId) {
  const endpoint = `${BASE_URL}/tournaments/${tournamentUrl}/matches/${matchId}.json`;

  const data = {
    "match[state]": "complete", // Setting the match to its completed state
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
}*/

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
