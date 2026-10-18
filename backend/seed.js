import { hashPassword } from "./auth/auth.js";
import { Titles } from "./domain/roles.js";

// Local demo accounts only. Override the shared password with
// INCIDENT_DESK_DEMO_PASSWORD; never reuse a real password here.
export const DEMO_PASSWORD = process.env.INCIDENT_DESK_DEMO_PASSWORD || "DemoPass123";

export const DEMO_ACCOUNTS = [
  { name: "Dana Whitfield", email: "manager@incidentdesk.test", role: "Administrator", title: Titles.IT_MANAGER },
  { name: "Sam Rivera", email: "admin@incidentdesk.test", role: "Administrator", title: Titles.SYSTEM_ADMIN },
  { name: "Priya Nair", email: "lead@incidentdesk.test", role: "Technician", title: Titles.TEAM_LEAD, skills: ["Application", "Authentication", "Network", "Database", "Cloud", "Security"], experience: 9, maxWorkload: 6 },
  { name: "Asha Mehta", email: "asha@incidentdesk.test", role: "Technician", skills: ["Application", "Authentication", "Software"], experience: 5, maxWorkload: 5 },
  { name: "Ravi Kumar", email: "ravi@incidentdesk.test", role: "Technician", skills: ["Network", "Cloud", "Storage"], experience: 7, maxWorkload: 5 },
  { name: "Neha Shah", email: "neha@incidentdesk.test", role: "Technician", skills: ["Hardware", "Application", "Cloud"], experience: 3, maxWorkload: 4 },
  { name: "Jordan Lee", email: "jordan@incidentdesk.test", role: "Employee" },
  { name: "Maya Chen", email: "maya@incidentdesk.test", role: "Employee" },
];

const CATEGORIES = [
  ["Hardware", "Devices and peripherals", ["laptop", "printer", "monitor", "keyboard", "battery", "screen", "workstation", "dock"]],
  ["Software", "Installed software and licences", ["install", "update", "licence", "license", "office", "excel", "crash"]],
  ["Network", "Connectivity and network equipment", ["wifi", "network", "vpn", "internet", "router", "switch", "dns", "latency"]],
  ["Database", "Database servers and queries", ["database", "sql", "query", "replication", "deadlock", "table"]],
  ["Cloud", "Cloud platforms and hosting", ["cloud", "aws", "azure", "instance", "bucket", "container", "kubernetes"]],
  ["Security", "Security incidents", ["phishing", "malware", "virus", "breach", "suspicious", "ransomware", "spam"]],
  ["Authentication", "Sign-in and access", ["login", "password", "mfa", "locked", "sso", "access", "token"]],
  ["Application", "Business applications", ["application", "app", "payment", "portal", "checkout", "transaction", "website"]],
  ["Storage", "File and backup storage", ["storage", "disk", "backup", "drive", "quota", "restore", "share"]],
];

const SERVICES = [
  ["Payment portal", "Application", 3, "Applications team"],
  ["Campus Wi-Fi", "Network", 2, "Network team"],
  ["Campus login", "Authentication", 3, "Identity team"],
  ["Cloud storage", "Cloud", 2, "Infrastructure team"],
  ["Office workstation", "Hardware", 1, "Desktop support"],
  ["Student database", "Database", 3, "Data team"],
];

const SLA_DEFAULTS = [
  ["P1", 5, 30],
  ["P2", 15, 120],
  ["P3", 60, 480],
  ["P4", 240, 1440],
];

// Reference data: categories, services, SLA policies and staff accounts.
export function seedReferenceData({ repos, settings }, now) {
  if (repos.users.count() > 0) return false;
  for (const [name, description, keywords] of CATEGORIES) repos.categories.upsert({ name, description, keywords });
  const services = SERVICES.map(([name, category, criticality, owner]) => repos.services.insert({ name, category, criticality, owner }));
  for (const [priority, responseMinutes, resolutionMinutes] of SLA_DEFAULTS) {
    repos.slaPolicies.upsert({ priority, responseMinutes, resolutionMinutes });
  }
  // The payment portal has a stricter P1 target than the default.
  repos.slaPolicies.upsert({ serviceId: services[0].id, priority: "P1", responseMinutes: 3, resolutionMinutes: 20 });
  const hash = hashPassword(DEMO_PASSWORD);
  for (const account of DEMO_ACCOUNTS) repos.users.insert({ ...account, active: true }, hash, now);
  settings.set("assignmentStrategy", "skill");
  settings.set("priorityStrategy", "weighted");
  return true;
}

// A handful of incidents across the lifecycle so dashboards are not empty.
export function seedDemoIncidents(container) {
  const { repos, incidents, clock } = container;
  const user = (email) => repos.users.findByEmail(email).user;
  const jordan = user("jordan@incidentdesk.test");
  const maya = user("maya@incidentdesk.test");
  const service = (name) => repos.services.findByName(name).id;
  const begin = clock.now();
  const step = (minutes) => clock.advance(minutes);

  const finish = (actor, id, resolution) => {
    const view = incidents.get(user("admin@incidentdesk.test"), id);
    const tech = repos.users.findById(view.technician.id);
    step(2); incidents.acknowledge(tech, id);
    step(3); incidents.startInvestigation(tech, id);
    step(10); incidents.resolve(tech, id, { resolution });
    incidents.verify(actor, id);
    incidents.close(tech, id);
  };

  clock.advance(-60 * 24 * 3);
  const a = incidents.create(jordan, { title: "Cannot log in to campus portal", description: "Password reset email never arrives and my account shows as locked.", serviceId: service("Campus login"), impact: 2, urgency: 2 });
  finish(jordan, a.id, "Unlocked the account in the identity console and re-sent the reset email after fixing the mail relay rule.");
  step(90);
  const b = incidents.create(maya, { title: "Wi-Fi drops every few minutes in library", description: "Wireless connection keeps disconnecting on the second floor of the library.", serviceId: service("Campus Wi-Fi"), impact: 2, urgency: 2, affectedUsers: 20 });
  finish(maya, b.id, "Replaced a faulty access point and moved clients to the 5GHz band.");
  step(60 * 24 * 3 - 200);

  incidents.create(jordan, { title: "Payment application unavailable", description: "Users are unable to complete transactions in the payment application.", serviceId: service("Payment portal"), impact: 3, urgency: 3, affectedUsers: 120 });
  step(4);
  incidents.create(maya, { title: "Payment transaction failing", description: "Checkout shows an error when paying the fees online.", serviceId: service("Payment portal"), impact: 3, urgency: 2, affectedUsers: 15 });
  step(3);
  incidents.create(jordan, { title: "Unable to make fee payment online", description: "Checkout spins and then fails when paying fees by card.", serviceId: service("Payment portal"), impact: 3, urgency: 2, affectedUsers: 8, force: true });
  step(2);
  incidents.create(maya, { title: "Laptop screen flickers", description: "The monitor of my office workstation flickers after waking from sleep.", serviceId: service("Office workstation"), impact: 1, urgency: 1 });
  const c = incidents.create(jordan, { title: "Shared drive quota exceeded", description: "Cloud storage says my quota is full and uploads fail.", serviceId: service("Cloud storage"), impact: 2, urgency: 2 });
  const tech = repos.users.findById(c.technician.id);
  step(2); incidents.acknowledge(tech, c.id);
  step(3); incidents.startInvestigation(tech, c.id);
  incidents.requestInfo(tech, c.id, { question: "Which folder are you uploading to and what is the error message?" });
  step(5);
  clock.advance((begin - clock.now()) / 60000); // back to the real present
}
