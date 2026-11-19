export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (request.headers.get("Authorization") !== `Bearer ${env.AUTH_KEY}`) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: cors }
      );
    }

    return Response.json({
      status: "connected",
      bot: "WingoBot",
      message: "Cloudflare connection successful"
    }, { headers: cors });
  }
};
