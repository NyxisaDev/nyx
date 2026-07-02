const allowedOrigins = new Set([
  "https://nyxweb.space",
  "https://www.nyxweb.space",
  "https://nyxisadev.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

const channelLogin = "psychosocial_nyx";
let tokenCache = null;

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function getAppToken(clientId, clientSecret) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });
  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenResponse.ok) throw new Error("Twitch token request failed.");
  const token = await tokenResponse.json();
  tokenCache = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max(0, token.expires_in - 120) * 1_000,
  };
  return tokenCache.value;
}

export default async function handler(request, response) {
  applyCors(request, response);
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  if (request.method !== "GET") {
    response.status(405).json({ message: "Method not allowed." });
    return;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    response.status(503).json({ configured: false, live: false });
    return;
  }

  try {
    const token = await getAppToken(clientId, clientSecret);
    const streamResponse = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channelLogin)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId,
        },
      },
    );

    if (!streamResponse.ok) {
      if (streamResponse.status === 401) tokenCache = null;
      throw new Error("Twitch stream request failed.");
    }

    const payload = await streamResponse.json();
    const stream = payload.data?.[0];
    response.setHeader("Cache-Control", "s-maxage=45, stale-while-revalidate=120");

    if (!stream) {
      response.status(200).json({
        configured: true,
        live: false,
        channelUrl: `https://www.twitch.tv/${channelLogin}`,
      });
      return;
    }

    response.status(200).json({
      configured: true,
      live: true,
      title: stream.title,
      category: stream.game_name,
      viewers: stream.viewer_count,
      startedAt: stream.started_at,
      thumbnail: stream.thumbnail_url
        ?.replace("{width}", "640")
        .replace("{height}", "360"),
      channelUrl: `https://www.twitch.tv/${channelLogin}`,
    });
  } catch (error) {
    console.error("Twitch status failed.", error);
    response.status(502).json({ message: "Twitch status is unavailable." });
  }
}
