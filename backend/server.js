import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContainer } from "./container.js";
import { Clock } from "./util.js";
import { createApiServer } from "./http/server.js";
import { seedDemoIncidents, seedReferenceData, DEMO_ACCOUNTS } from "./seed.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const projectRoot = new URL("../", import.meta.url);

// Browser files served next to the API: the page, styles and the ES modules.
function webAssets() {
  const assets = { "/": "index.html", "/index.html": "index.html" };
  for (const file of ["styles.css", "app.js", "theme-init.js", "loader.gif", "terminal-session.js", "terminal-client.js"]) assets[`/${file}`] = file;
  for (const file of readdirSync(new URL("ui/", projectRoot))) if (file.endsWith(".js")) assets[`/ui/${file}`] = `ui/${file}`;
  return assets;
}

export function startBackend({
  dbPath = process.env.INCIDENT_DESK_DB || here("../.local-data/incident-desk.sqlite"),
  port = Number(process.env.PORT || 4173),
  demoData = process.env.INCIDENT_DESK_DEMO_DATA !== "0",
  monitorIntervalMs = Number(process.env.INCIDENT_DESK_MONITOR_MS ?? 30000),
  manualClock = process.env.INCIDENT_DESK_CLOCK === "manual",
} = {}) {
  const container = createContainer({ dbPath, log: (m) => console.log(m), clock: new Clock({ manual: manualClock }) });
  if (seedReferenceData(container, container.clock.now())) {
    if (demoData) seedDemoIncidents(container);
    console.log(`Seeded ${DEMO_ACCOUNTS.length} demo accounts; emails and the demo password are listed in backend/seed.js.`);
  }
  const server = createApiServer(container, { assets: webAssets(), root: projectRoot });
  // 0 turns the background monitor off; use "Run monitor now" on the SLA page instead.
  if (monitorIntervalMs > 0) container.slaMonitor.start(monitorIntervalMs);
  server.on("error", (error) => {
    console.error("Could not start Incident Desk:", error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => console.log(`Incident Desk is ready: http://localhost:${port}`));
  server.on("close", () => container.close());
  return { container, server };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) startBackend();
