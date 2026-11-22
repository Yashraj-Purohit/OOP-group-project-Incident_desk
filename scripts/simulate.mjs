// Fires a burst of realistic incidents at the RUNNING server through its real HTTP API
// (sign-in, validation, priority, SLA, assignment, notifications all run as normal).
//   npm run simulate            8 incidents
//   npm run simulate -- 12      12 incidents
// Watch Reports -> Team workload (or an incident list) while it runs, then change the
// assignment strategy on "SLA & assignment" and run it again to compare.
import { DEMO_PASSWORD } from "../backend/seed.js";

const base = process.env.INCIDENT_DESK_URL || "http://localhost:4173";
const count = Math.max(1, Math.min(40, Number(process.argv[2]) || 8));
const TEMPLATES = [
  ["Laptop will not boot after the update", "The office workstation hangs on the logo screen after last night's update.", "Office workstation", 1, 2, 1],
  ["Cannot open the shared project folder", "Access denied when opening the team folder on cloud storage.", "Cloud storage", 2, 2, 6],
  ["Locked out of campus login", "My account shows as locked after several password attempts.", "Campus login", 2, 3, 1],
  ["Wi-Fi extremely slow in the lecture hall", "Wireless speed drops to almost nothing during morning lectures.", "Campus Wi-Fi", 2, 2, 40],
  ["Student records query timing out", "Reports on the student database time out after thirty seconds.", "Student database", 3, 2, 12],
  ["Printer not detected on my workstation", "The office printer no longer appears after the driver change.", "Office workstation", 1, 1, 1],
  ["Uploads to cloud storage keep failing", "Large file uploads stop halfway with an error message.", "Cloud storage", 2, 2, 4],
  ["Password reset email never arrives", "I requested a campus login password reset but nothing arrives.", "Campus login", 2, 2, 2],
  ["VPN disconnects every ten minutes", "The remote connection to campus drops repeatedly while working from home.", "Campus Wi-Fi", 2, 2, 5],
  ["Backup restore stuck at ninety percent", "Restoring last week's backup of the research drive freezes near the end.", "Cloud storage", 2, 3, 3],
];

async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => { throw new Error(`Cannot reach ${base}. Start the app first (npm run demo).`); });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error}`);
  return data;
}

const login = async (name) => (await call("POST", "/api/auth/login", null, { email: `${name}@incidentdesk.test`, password: DEMO_PASSWORD })).token;
const tokens = { jordan: await login("jordan"), maya: await login("maya") };
const services = Object.fromEntries((await call("GET", "/api/services", tokens.jordan)).map((s) => [s.name, s.id]));
const strategy = (await call("GET", "/api/admin/settings", await login("admin"))).assignmentStrategy;

console.log(`Simulating ${count} incidents (assignment strategy: ${strategy})\n`);
const tally = {};
for (let i = 0; i < count; i += 1) {
  const [title, description, service, impact, urgency, affectedUsers] = TEMPLATES[i % TEMPLATES.length];
  const reporter = i % 2 ? "maya" : "jordan";
  const created = await call("POST", "/api/incidents", tokens[reporter], {
    title: i < TEMPLATES.length ? title : `${title} (${Math.floor(i / TEMPLATES.length) + 1})`,
    description, serviceId: services[service], impact, urgency, affectedUsers, force: true,
  });
  const who = created.technician?.name ?? "unassigned";
  tally[who] = (tally[who] ?? 0) + 1;
  console.log(`${created.displayId}  ${created.priority}  ${service.padEnd(18)} ${reporter.padEnd(6)} -> ${who}`);
}
console.log("\nAssigned per technician:", Object.entries(tally).map(([n, c]) => `${n} ${c}`).join(" · "));
