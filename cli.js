#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { TerminalSession, safeText } from "./terminal-session.js";

// Start the web server first with npm start. No packages or shell commands are executed here.
const base = process.env.INCIDENT_DESK_URL || "http://127.0.0.1:4173";
const url = new URL(base);
if (
  url.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(url.hostname)
) {
  throw Error("The prototype CLI connects only to a localhost HTTP server.");
}

async function api(input) {
  let response;
  try {
    response = await fetch(new URL("/api/terminal", url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw Error(
      "Cannot reach Incident Desk. Run npm start in another terminal, then try again.",
    );
  }
  const result = await response.json();
  if (!response.ok) {
    throw Error(result.error || "The request failed.");
  }
  return result;
}

const session = new TerminalSession(api);
function printNewEntries() {
  for (const entry of session.entries) {
    if (entry.kind !== "input") {
      console.log(safeText(entry.text));
    }
    if (entry.kind === "error") {
      process.exitCode = 1;
    }
  }
  session.entries = [];
}

const firstCommand = process.argv.slice(2).join(" ");
const reader = createInterface({
  input: stdin,
  output: stdout,
  terminal: Boolean(stdin.isTTY),
});
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
    const line = await reader.question(session.prompt + " ");
    if (!session.report && ["exit", "quit"].includes(line.trim())) {
      break;
    }
    await session.send(line);
    printNewEntries();
  }
} catch (error) {
  if (error.code !== "ERR_USE_AFTER_CLOSE") {
    console.error(safeText(error.message));
  }
} finally {
  reader.close();
}
