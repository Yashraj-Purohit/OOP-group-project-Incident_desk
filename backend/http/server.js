import { readFile } from "node:fs/promises";
import http from "node:http";
import { AppError, AuthenticationError, ValidationError } from "../errors.js";
import { buildRoutes, compile, match } from "./routes.js";

const MAX_BODY = 100 * 1024;

function readJson(request) {
  return new Promise((resolve, reject) => {
    if (!["POST", "PUT", "PATCH"].includes(request.method)) return resolve({});
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new AppError("Request body is too large.", { status: 413, code: "PAYLOAD_TOO_LARGE" }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!size) return resolve({});
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
        resolve(body);
      } catch {
        reject(new ValidationError("Request body must be a JSON object."));
      }
    });
    request.on("error", reject);
  });
}

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".gif": "image/gif", ".svg": "image/svg+xml" };

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS });
  response.end(body);
}

// Serves only the files listed in `assets` ({ "/url": "path/relative/to/root" }).
async function sendAsset(request, response, assets, root) {
  const file = assets[new URL(request.url, "http://localhost").pathname];
  if (!file || !["GET", "HEAD"].includes(request.method)) {
    throw new AppError("Not found.", { status: 404, code: "NOT_FOUND" });
  }
  const type = MIME[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream";
  const body = await readFile(new URL(file, root));
  response.writeHead(200, { "Content-Type": `${type}${type.startsWith("text") ? "; charset=utf-8" : ""}`, ...SECURITY_HEADERS });
  response.end(request.method === "HEAD" ? undefined : body);
}

function bearer(request) {
  const header = request.headers.authorization ?? "";
  const m = header.match(/^Bearer\s+([A-Za-z0-9_-]{20,200})$/);
  return m ? m[1] : null;
}

// Plain node:http adapter. Authentication happens here; authorization is
// enforced by the services (permissions on the User object).
export function createApiServer(container, { allowedOrigins = [], assets = {}, root = null, localOnly = true } = {}) {
  const routes = compile(buildRoutes(container));
  return http.createServer(async (request, response) => {
    try {
      // Reject unexpected Host headers (DNS-rebinding protection for a localhost server).
      if (localOnly && !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(request.headers.host ?? "")) {
        throw new AppError("Localhost access only.", { status: 403, code: "FORBIDDEN_HOST" });
      }
      const url = new URL(request.url, "http://localhost");
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.includes(origin) && origin !== `http://${request.headers.host}`) {
        throw new AppError("Cross-origin requests are not allowed.", { status: 403, code: "FORBIDDEN_ORIGIN" });
      }
      if (!url.pathname.startsWith("/api/")) {
        return await sendAsset(request, response, assets, root);
      }
      const { route, params } = match(routes, request.method, url.pathname);
      const token = bearer(request);
      const user = route.public ? null : container.auth.authenticate(token);
      const body = await readJson(request);
      const query = Object.fromEntries(url.searchParams);
      const result = route.handler({ user, token, params, query, body });
      send(response, route.status ?? 200, result ?? { ok: true });
    } catch (error) {
      if (error instanceof AppError) {
        if (error instanceof AuthenticationError) response.setHeader("WWW-Authenticate", "Bearer");
        return send(response, error.status, error.toJSON());
      }
      container.log?.(`Unhandled error: ${error?.stack ?? error}`);
      send(response, 500, { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" });
    }
  });
}
