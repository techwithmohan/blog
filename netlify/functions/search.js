exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: { message: "Method not allowed." } });
  }

  const q = (event.queryStringParameters?.q || "").trim();
  const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit || 6), 1), 10);
  if (!q) return json(400, { error: { message: "Missing search query." } });

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let upstream;
    try {
      upstream = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 BlogForgeAI/1.0",
          "Accept": "text/html",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!upstream.ok) {
      return json(upstream.status, { error: { message: `DuckDuckGo search failed with ${upstream.status}.` } });
    }

    const html = await upstream.text();
    return json(200, { query: q, results: extractDuckDuckGoResults(html, limit) });
  } catch (err) {
    return json(500, { error: { message: err.message || "DuckDuckGo search failed." } });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripHtml(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractDuckDuckGoResults(html, limit) {
  const results = [];
  const blocks = html.match(/<div class="result[\s\S]*?(?=<div class="result|\<\/body>)/g) || [];

  for (const block of blocks) {
    const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;

    let url = decodeEntities(linkMatch[1]);
    try {
      const parsed = new URL(url, "https://duckduckgo.com");
      if (parsed.pathname === "/l/") url = parsed.searchParams.get("uddg") || url;
    } catch {}

    const snippetMatch = block.match(/<a[^>]+class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/)
      || block.match(/<div[^>]+class="result__snippet"[\s\S]*?>([\s\S]*?)<\/div>/);
    const title = stripHtml(linkMatch[2]);
    const snippet = stripHtml(snippetMatch?.[1] || "");

    if (title && url) results.push({ title, url, snippet });
    if (results.length >= limit) break;
  }

  return results;
}
