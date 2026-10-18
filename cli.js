#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { TerminalSession, safeText } from "./terminal-session.js";
import { createTerminalApi } from "./terminal-client.js";

// Start the server first with npm start. No packages or shell commands are executed here.
// Sign in interactively, or set INCIDENT_DESK_EMAIL and INCIDENT_DESK_PASSWORD.
const base = process.env.INCIDENT_DESK_URL || "http://127.0.0.1:4173";
const url = new URL(base);
if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw Error("The prototype CLI connects only to a localhost HTTP server.");
}

let token = null;
async function request(method, path, body) {
  let response;
  try {
    response = await fetch(new URL(path, url), {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw Error("Cannot reach Incident Desk. Run npm start in another terminal, then try again.");
  }
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "The request failed.");
  return result;
}

// Reads lines through one iterator so piped input is never dropped.
const reader = createInterface({ input: stdin, output: stdout, terminal: Boolean(stdin.isTTY) });
const lines = reader[Symbol.asyncIterator]();
let inputClosed = false;
reader.on("close", () => (inputClosed = true));
async function ask(prompt) {
  if (!inputClosed) {
    reader.setPrompt(prompt);
    reader.prompt();
  }
  const { value, done } = await lines.next();
  return done ? null : value;
}

// Reads a line without echoing it (falls back to a plain read when piped).
function askHidden(prompt) {
  if (!stdin.isTTY) return ask(prompt);
  return new Promise((resolve) => {
    stdout.write(prompt);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const firstCommand = process.argv.slice(2).join(" ");
let session;

try {
  const email = process.env.INCIDENT_DESK_EMAIL || (await ask("Email: "));
  const password = process.env.INCIDENT_DESK_PASSWORD || (await askHidden("Password: "));
  const login = await request("POST", "/api/auth/login", { email, password });
  token = login.token;
  session = new TerminalSession(createTerminalApi(request, login.user), login.user);
  session.entries = [{ kind: "output", text: `Signed in as ${login.user.name} (${login.user.role}). Type help to begin.` }];
} catch (error) {
  console.error(safeText(error.message));
  reader.close();
  process.exit(1);
}

function printNewEntries() {
  for (const entry of session.entries) {
    if (entry.kind !== "input") console.log(safeText(entry.text));
    if (entry.kind === "error") process.exitCode = 1;
  }
  session.entries = [];
}

reader.on("SIGINT", () => {
  session.report = null;
  reader.close();
});
printNewEntries();
if (firstCommand) {
  await session.send(firstCommand);
  printNewEntries();
}
try {
  while (!firstCommand || session.report) {
    const line = await ask(session.prompt + " ");
    if (line === null || (!session.report && ["exit", "quit"].includes(line.trim()))) break;
    await session.send(line);
    printNewEntries();
  }
} catch (error) {
  if (error.code !== "ERR_USE_AFTER_CLOSE") console.error(safeText(error.message));
} finally {
  if (token) await request("POST", "/api/auth/logout").catch(() => {});
  reader.close();
}
