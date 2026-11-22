// Demo / recording mode.
//   npm run demo          clean database (reference data only), so you create incidents live
//   npm run demo:rich     database with sample incidents, for dashboards and reports
// The clock stands still and the background SLA monitor is off: SLA time only
// moves when you press "Advance clock" on the SLA & assignment page, and the
// monitor only runs when you press "Advance clock" or "Run monitor now".
// Running the command again resets the demo database.
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startBackend } from "../backend/server.js";

const mode = process.argv[2] === "rich" ? "rich" : "clean";
const dbPath = fileURLToPath(new URL(`../.local-data/demo-${mode}.sqlite`, import.meta.url));
for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true });

console.log(`Demo mode (${mode}): frozen clock, SLA monitor off, fresh database.`);
startBackend({ dbPath, demoData: mode === "rich", monitorIntervalMs: 0, manualClock: true });
