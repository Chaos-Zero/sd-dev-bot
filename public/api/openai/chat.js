const { Client, ButtonBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"; // Use GPT-3.5 Turbo engine URL

const fs = require("fs");
eval(fs.readFileSync("./public/collections/blacklist.js") + "");

const userConversations = {};

async function aiRespond(bot, message, aiPrefix) {
  const userId = message.author.id; // Assuming `message.author.id` is unique per user
  var myMessage = await message.channel.send("💭");
  let intiUserQuery = message.content.slice(aiPrefix.length).trim();
  const userQuery = removeStartingPunctuation(intiUserQuery);

  var isInlist = (list) =>
    list.some(
      (word) =>
        userQuery.toLowerCase().match(new RegExp("\\b" + word + "\\b")) != null
    );

  if (isInlist(badWords)) {
    myMessage.edit(
      "http://91.99.239.6/files/assets/Prompt-Throwl.gif"
    );
    return;
  }

  // If the user has no existing conversation, start a new one
  if (!userConversations[userId]) {
    userConversations[userId] = [
      {
        role: "system",
        content:
          "You are a bot called Domo who works in the Discord server 'Supradarky's VGM Club'. Your answers are concise and brief, but humorous. Do not be too whimsical and don't user gamer speak. You can be PG-13 but nothing explicit. Never admit you are chatgpt or AI.",
      },
    ];
  }

  // Append the user's current query to their conversation
  userConversations[userId].push({ role: "user", content: userQuery });

  const payload = {
    //model: "gpt-3.5-turbo",
    model: "gpt-4-1106-preview",
    messages: userConversations[userId],
  };

  try {
    const response = await axios.post(OPENAI_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    var botResponse = response.data.choices[0].message.content;

    if (
      botResponse.toLowerCase().includes("openai") ||
      botResponse.toLowerCase().includes("chatgpt") ||
      botResponse.toLowerCase().includes("language model")
    ) {
      botResponse =
        "http://91.99.239.6/files/assets/Prompt-Throwl.gif?v=1695416870032";
    }

    console.log(message.author.username + " has sent this prompt: " + userQuery)
    // Update the conversation history for the user
    userConversations[userId].push({ role: "assistant", content: botResponse });

    // Limit the conversation history to the last few messages to avoid excessive memory use.
    // For instance, only keep the last 6 messages (3 turns) in this example.
    while (userConversations[userId].length > 6) {
      userConversations[userId].shift();
    }
  
    // Send the response to the user
    myMessage.edit(botResponse);
    console.log("Response: " + botResponse)
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("Error response data:", error.response.data);
      console.error("Error status:", error.response.status);
      console.error("Error headers:", error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.error("No response received:", error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error("Error", error.message);
    }
    myMessage.edit("Brain's unplugged. Try again later.");
  }
}

function removeStartingPunctuation(str) {
  let index = 0;
  while (index < str.length && !/[a-zA-Z0-9]/.test(str[index])) {
    index++;
  }
  return str.slice(index);
}
