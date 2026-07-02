const allowedOrigins = new Set([
  "https://nyxweb.space",
  "https://www.nyxweb.space",
  "https://nyxisadev.github.io",
  "http://127.0.0.1:5173",
]);

function clean(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export default async function handler(request, response) {
  const origin = request.headers.origin;

  if (allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    return response.status(204).end();
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return response.status(405).json({ message: "Method not allowed." });
  }

  const nickname = clean(request.body?.nickname, 32);
  const suggestion = clean(request.body?.suggestion, 600);
  const website = clean(request.body?.website, 200);

  if (website) return response.status(200).json({ ok: true });

  if (!nickname || !suggestion) {
    return response.status(400).json({ message: "Vyplň přezdívku i svůj nápad." });
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return response.status(503).json({ message: "Streamový inbox zatím není připojený." });
  }

  try {
    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "NYX Stream Signal",
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: "Nový návrh na stream",
            color: 0x9146ff,
            fields: [
              { name: "Od", value: nickname, inline: true },
              { name: "Nápad", value: suggestion, inline: false },
            ],
            footer: { text: "nyx / stream signal" },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    if (!discordResponse.ok) {
      return response.status(502).json({ message: "Discord signál teď neodpovídá." });
    }

    return response.status(200).json({ ok: true });
  } catch {
    return response.status(500).json({ message: "Signál se nepodařilo odeslat." });
  }
}
