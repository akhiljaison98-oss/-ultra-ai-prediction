export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    const reply = (data, status = 200) =>
      Response.json(data, { status, headers: cors });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (request.method !== "GET") {
      return reply({ error: "Method not allowed" }, 405);
    }

    if (
      request.headers.get("Authorization") !==
      `Bearer ${env.AUTH_KEY}`
    ) {
      return reply({ error: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const game = url.searchParams.get("game");

    let endpoint;

    if (game === "30s") {
      endpoint = "30-sec-game-history";
    } else if (game === "1m") {
      endpoint = "1-min-game-history";
    } else {
      return reply({ error: "Invalid game. Use 30s or 1m." }, 400);
    }

    try {
      const response = await fetch(
        `https://api.wingobot.com/v2/${endpoint}`,
        {
          headers: {
            "Authorization": `Bearer ${env.WINGOBOT_API_TOKEN}`
          }
        }
      );

      if (!response.ok) {
        return reply({
          error: "WingoBot API request failed",
          upstreamStatus: response.status
        }, 502);
      }

      const data = await response.json();
      return reply(data);

    } catch (error) {
      return reply({ error: "Unable to fetch game history" }, 500);
    }
  }
};

    
