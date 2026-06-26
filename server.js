const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const EVENTS_FILE = path.join(ROOT, "events.json");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === "/api/events" && request.method === "GET") {
      return sendJson(response, await readEvents());
    }

    if (request.url === "/api/events" && request.method === "POST") {
      const body = await readBody(request);
      const events = JSON.parse(body || "[]");
      if (!Array.isArray(events)) {
        return sendJson(response, { error: "Events must be an array" }, 400);
      }

      await fs.writeFile(EVENTS_FILE, JSON.stringify(events, null, 2));
      return sendJson(response, { ok: true });
    }

    return await serveStatic(request, response);
  } catch (error) {
    return sendJson(response, { error: error.message }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Memo Day is running at http://${HOST}:${PORT}/index.html`);
});

async function readEvents() {
  try {
    const contents = await fs.readFile(EVENTS_FILE, "utf8");
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const extension = path.extname(filePath);
  let contents;
  try {
    contents = await fs.readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    throw error;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(contents);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}
