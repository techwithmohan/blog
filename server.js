const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8000);
const API_KEY = process.env.GEMINI_API_KEY || "";
const ROOT = __dirname;
const ROOT_PREFIX = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
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

async function searchDuckDuckGo(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const q = (parsed.searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(parsed.searchParams.get("limit") || 6), 1), 10);

  if (!q) {
    send(res, 400, JSON.stringify({ error: { message: "Missing search query." } }));
    return;
  }

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
    send(res, upstream.status, JSON.stringify({ error: { message: `DuckDuckGo search failed with ${upstream.status}.` } }));
    return;
  }

  const html = await upstream.text();
  send(res, 200, JSON.stringify({ query: q, results: extractDuckDuckGoResults(html, limit) }));
}

async function proxyGemini(req, res, stream) {
  if (!API_KEY) {
    send(res, 500, JSON.stringify({ error: { message: "Server missing GEMINI_API_KEY." } }));
    return;
  }

  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const model = parsed.searchParams.get("model") || "gemini-2.5-flash";
  const body = await readBody(req);
  const action = stream ? "streamGenerateContent" : "generateContent";
  const params = stream ? `alt=sse&key=${encodeURIComponent(API_KEY)}` : `key=${encodeURIComponent(API_KEY)}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}?${params}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") || (stream ? "text/event-stream" : "application/json"),
    "Cache-Control": "no-store",
  });

  if (!upstream.body) {
    res.end(await upstream.text());
    return;
  }

  for await (const chunk of upstream.body) {
    res.write(chunk);
  }
  res.end();
}

function serveStatic(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname === "/" ? "/index.html" : parsed.pathname;
  const filePath = path.resolve(ROOT, "." + decodeURIComponent(pathname));

  if (filePath !== ROOT && !filePath.startsWith(ROOT_PREFIX)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    const type = MIME[path.extname(filePath)] || "application/octet-stream";
    send(res, 200, data, type);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url.startsWith("/api/search")) {
      await searchDuckDuckGo(req, res);
      return;
    }
    if (req.method === "POST" && req.url.startsWith("/api/gemini/generate")) {
      await proxyGemini(req, res, false);
      return;
    }
    if (req.method === "POST" && req.url.startsWith("/api/gemini/stream")) {
      await proxyGemini(req, res, true);
      return;
    }
    if (req.method === "GET") {
      serveStatic(req, res);
      return;
    }
    send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
  } catch (err) {
    send(res, 500, JSON.stringify({ error: { message: err.message || "Server error" } }));
  }
});

server.listen(PORT, () => {
  console.log(`BlogForge running at http://localhost:${PORT}`);
});
