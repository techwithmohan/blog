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
