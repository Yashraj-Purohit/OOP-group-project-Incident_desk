import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { TicketStore, RequestError, terminalAction } from "./ticket-store.js";

const assets = {
  "/": ["index.html", "text/html"],
  "/index.html": ["index.html", "text/html"],
  "/styles.css": ["styles.css", "text/css"],
  "/app.js": ["app.js", "text/javascript"],
  "/domain.js": ["domain.js", "text/javascript"],
  "/loader.gif": ["loader.gif", "image/gif"],
  "/terminal-session.js": ["terminal-session.js", "text/javascript"],
};

function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) {
      throw new RequestError("Request is too large.", 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new RequestError("Invalid JSON request.");
  }
}

export function createAppServer(store) {
  return http.createServer(async (request, response) => {
    try {
      const host = request.headers.host;
      if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host || "")) {
        throw new RequestError("Localhost access only.", 403);
      }
      const url = new URL(request.url, `http://${host}`);
      if (url.pathname.startsWith("/api/")) {
        // Roles are demo identities, not production authentication.
        const origin = request.headers.origin;
        if (origin && origin !== `http://${host}`) {
          throw new RequestError("Cross-origin requests are not allowed.", 403);
        }
        if (request.method === "GET" && url.pathname === "/api/state") {
          return json(response, 200, store.snapshot());
        }
        if (request.method === "POST" && url.pathname === "/api/bootstrap") {
          const body = await readJson(request);
          return json(response, 200, await store.bootstrap(body.data));
        }
        if (request.method === "PUT" && url.pathname === "/api/state") {
          const body = await readJson(request);
          return json(
            response,
            200,
            await store.replace(body.data, body.revision),
          );
        }
        if (request.method === "POST" && url.pathname === "/api/terminal") {
          return json(
            response,
            200,
            await terminalAction(store, await readJson(request)),
          );
        }
        throw new RequestError("Unknown API route.", 404);
      }
      const asset = assets[url.pathname];
      if (!asset || !["GET", "HEAD"].includes(request.method)) {
        throw new RequestError("Not found.", 404);
      }
      const body = await readFile(new URL(asset[0], import.meta.url));
      response.writeHead(200, {
        "Content-Type": asset[1] + "; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      if (!response.headersSent) {
        json(response, error.status || 500, {
          error: error.status
            ? error.message
            : "Could not save or load data. Please try again.",
        });
      }
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path =
    process.env.INCIDENT_DESK_DATA_FILE ||
    fileURLToPath(new URL(".local-data/incidents.json", import.meta.url));
  const store = await new TicketStore(path).load();
  const port = Number(process.env.PORT || 4173);
  const server = createAppServer(store);
  server.on("error", (error) => {
    console.error("Could not start Incident Desk:", error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Incident Desk is ready: http://localhost:${port}`),
  );
}