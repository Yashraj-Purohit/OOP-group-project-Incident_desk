import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApiServer } from "../backend/http/server.js";
import { makeApp } from "../backend/tests/helpers.js";
import { auditPage, peoplePage, reportsPage, servicesPage, settingsPage } from "../ui/adminViews.js";
import { csvCell, escapeHtml } from "../ui/helpers.js";
import { NAV, authScreen, detail, incidentRows, knowledge, notifications, overview, shell, terminalPage } from "../ui/views.js";
import { TerminalSession } from "../terminal-session.js";

const incident = (over = {}) => ({
  id: 1010, displayId: "INC-1010", title: "Printer jam", description: "Paper keeps jamming", category: "Hardware",
  service: { id: 1, name: "Office workstation" }, reporter: { id: 7, name: "Jordan Lee" }, technician: { id: 4, name: "Asha Mehta" },
  impact: 2, urgency: 2, affectedUsers: 1, criticality: 2, score: 8, priority: "P3", status: "Assigned", createdAt: 1, acknowledgedAt: null,
  resolvedAt: null, closedAt: null, resolution: null, awaitingInfo: false, escalationLevel: 0, escalatedTo: null, feedback: null, proposal: null,
  sla: { label: "On track", responseDue: 2, resolutionDue: 3, responseBreached: false, resolutionBreached: false, remainingMinutes: 40 },
  actions: [], notes: [], history: [], related: [], ...over,
});

const state = (role, over = {}) => ({
  user: { id: 4, name: "Asha Mehta", email: "a@x.test", role }, page: "Overview", selected: null, tab: "All incidents", filters: {}, notifTab: "in-app",
  ref: { services: [{ id: 1, name: "Office workstation" }], categories: [{ name: "Hardware", description: "", keywords: [] }], technicians: [] },
  data: { list: { items: [incident()], total: 1 }, all: [incident()], workload: [] }, unread: 2, openCount: 1, auditActions: [], ...over,
});

test("navigation is role specific: employees and technicians never see administrator pages", () => {
  assert.ok(NAV.Administrator.includes("Audit log") && NAV.Administrator.includes("SLA & assignment"));
  for (const role of ["Employee", "Technician"]) {
    const html = shell(state(role), "", "light");
    assert.doesNotMatch(html, /Audit log|SLA &amp; assignment|data-page="People"/);
    assert.match(html, /data-page="Terminal"/);
    assert.match(html, /Sign out/);
  }
  assert.match(shell(state("Administrator"), "", "dark"), /data-page="People"/);
});

test("untrusted text from the API is escaped everywhere it is rendered", () => {
  const evil = '<img src=x onerror="alert(1)">';
  const bad = incident({
    title: evil, description: evil, reporter: { id: 1, name: evil }, technician: { id: 2, name: evil }, resolution: evil,
    notes: [{ author: evil, body: evil, kind: "reporter_info", internal: false, at: 1 }],
    history: [{ at: 1, user: evil, description: evil, previousState: evil, newState: "x" }],
    proposal: { text: evil, status: "Proposed", reviewer: null, note: "", reviewedAt: null },
    related: [{ id: 2, title: evil, status: "Assigned" }], suggestedResolutions: [{ incidentId: 3, title: evil, resolution: evil, score: 0.5 }],
    risk: { level: "low", score: 0.1, reasons: [evil] }, actions: ["review-proposal", "add-note"],
  });
  const s = state("Technician", { selected: 1010, data: { incident: bad, list: { items: [bad], total: 1 }, all: [bad], workload: [], knowledge: [{ id: 1, title: evil, resolution: evil }], notifications: { items: [{ id: 1, subject: evil, message: evil, at: 1, read: false }], unread: 1 } } });
  for (const html of [detail(s), incidentRows(s), overview(s), knowledge(s), notifications(s), authScreen({ error: evil })]) {
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /<[^>]*\sonerror\s*=/i, "no element may carry an event-handler attribute");
  }
  assert.equal(escapeHtml(evil), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

test("incident detail offers exactly the actions the API grants, and shows SLA, priority reasoning and history", () => {
  const html = (role, actions, over = {}) => detail(state(role, { selected: 1010, data: { incident: incident({ actions, ...over }) } }));
  const tech = html("Technician", ["acknowledge", "request-info", "add-note"]);
  assert.match(tech, /data-action="acknowledge"/);
  assert.match(tech, /data-action="request-info"/);
  assert.doesNotMatch(tech, /data-action="close"/);
  assert.match(tech, /Impact 2 × urgency 2 × service criticality 2 = score 8/);
  assert.match(tech, /id="note-form"/);
  assert.match(html("Employee", ["verify", "reopen", "respond"], { status: "Resolved" }), /data-action="verify"[\s\S]*Reject resolution/);
  const reply = html("Employee", ["respond"], { awaitingInfo: true });
  assert.match(reply, /Support needs more information/);
  assert.doesNotMatch(reply, /Internal note/);
  assert.match(html("Administrator", ["reassign", "edit"]), /Change assignment/);
  assert.match(html("Employee", ["feedback"], { status: "Closed" }), /Leave feedback/);
  assert.match(html("Technician", [], { escalatedTo: "IT Manager" }), /Escalated to IT Manager/);
});

test("administrator pages render from API-shaped data", () => {
  const s = state("Administrator", {
    ref: { services: [{ id: 1, name: "Payment portal", category: "Application", criticality: 3, owner: "Apps", active: true }], categories: [{ name: "Application", description: "Apps", keywords: ["app", "payment"] }], technicians: [] },
    data: {
      serviceStats: [{ id: 1, service: "Payment portal", total: 3, open: 2, p1: 1 }], users: [{ id: 4, name: "Asha Mehta", email: "asha@x.test", role: "Technician", active: true, title: "Technician", skills: ["Application"], experience: 5, maxWorkload: 5, available: true }],
      workload: [{ id: 4, name: "Asha Mehta", activeIncidents: 2, capacity: 5, utilizationPercent: 40 }],
      overview: { total: 7, open: 5, critical: 3, resolved: 2, closed: 2, slaViolations: 3, slaCompliancePercent: 100, meanTimeToResolveMinutes: 15, meanTimeToAcknowledgeMinutes: 2, averageRating: 4.5 },
      categoryStats: [{ category: "Application", total: 3 }], trend: [{ date: "2026-10-18", opened: 3, resolved: 1 }],
      correlations: [{ serviceName: "Payment portal", count: 3, incidents: [{ id: 1 }, { id: 2 }, { id: 3 }], suggestion: "Investigate a shared cause." }],
      slaRisk: [{ id: 1, displayId: "INC-1", title: "Payment down", level: "high", reasons: ["No technician"] }],
      violations: [{ incidentId: 1, title: "Payment down", service: "Payment portal", kind: "response_violation", priority: "P1", at: 1 }],
      policies: [{ id: 1, serviceId: null, priority: "P1", responseMinutes: 5, resolutionMinutes: 30 }, { id: 2, serviceId: 1, priority: "P1", responseMinutes: 3, resolutionMinutes: 20 }],
      settings: { assignmentStrategy: "skill", priorityStrategy: "weighted", assignmentStrategies: [{ name: "skill", label: "Skill based", description: "d" }], priorityStrategies: [{ name: "weighted", label: "Weighted score", description: "d" }] },
      audit: [{ id: 1, at: 1, user: "System", action: "INCIDENT_CREATED", incidentId: 1, previousState: null, newState: "New", description: "Incident created" }],
    },
  });
  assert.match(servicesPage(s), /Payment portal[\s\S]*2 active incidents/);
  assert.match(servicesPage(s), /payment/);
  assert.match(peoplePage(s), /Asha Mehta[\s\S]*Application[\s\S]*2\/5 active/);
  assert.match(reportsPage(s), /Correlated incidents[\s\S]*3 related reports/);
  assert.match(reportsPage(s), /Recorded SLA violations/);
  assert.match(settingsPage(s), /name="P1-response"[\s\S]*value="5"/);
  assert.match(settingsPage(s), /Service-specific targets[\s\S]*Payment portal/);
  assert.match(auditPage(s), /INCIDENT_CREATED/);
});

test("terminal view lists the commands for the signed-in role", () => {
  const user = { id: 1, name: "Jordan Lee", email: "j@x.test", role: "Employee" };
  const s = state("Employee", { user, terminal: { session: new TerminalSession(async () => [], user), busy: false } });
  const html = terminalPage(s);
  assert.match(html, /Employee commands/);
  assert.match(html, /data-terminal-command="whoami"/);
  assert.doesNotMatch(html, /role admin/);
});

test("CSV export neutralises spreadsheet formulas", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell("plain"), '"plain"');
});

test("static assets are served with a strict CSP; code, data and traversal paths are not", async () => {
  const app = makeApp();
  const assets = { "/": "index.html", "/app.js": "app.js", "/ui/views.js": "ui/views.js", "/theme-init.js": "theme-init.js" };
  const server = createApiServer(app.container, { assets, root: new URL("../", import.meta.url) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
    assert.doesNotMatch(await page.text(), /<script>/, "no inline scripts (CSP)");
    assert.equal((await fetch(`${base}/app.js`)).headers.get("content-type").split(";")[0], "text/javascript");
    for (const path of ["/backend/seed.js", "/package.json", "/.local-data/incident-desk.sqlite", "/ui/../backend/seed.js", "/%2e%2e/package.json"]) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
    const rebindStatus = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port: server.address().port, path: "/api/health", headers: { Host: "evil.example" } }, (res) => { res.resume(); resolve(res.statusCode); }).on("error", reject);
    });
    assert.equal(rebindStatus, 403, "unexpected Host headers are refused (DNS rebinding)");
  } finally { server.close(); }
});

test("sign-in screen lists the demo accounts and password when the server offers them, and escapes them", () => {
  const demo = { enabled: true, password: "DemoPass123", accounts: [{ name: "Jordan Lee", email: "jordan@incidentdesk.test", role: "Employee", title: null }, { name: "Sam Rivera", email: "admin@incidentdesk.test", role: "Administrator", title: "System Administrator" }] };
  const html = authScreen({ demo });
  assert.match(html, /Demo accounts/);
  assert.match(html, /DemoPass123/);
  assert.match(html, /data-demo-email="jordan@incidentdesk\.test"/);
  assert.match(html, /System Administrator/);
  assert.doesNotMatch(authScreen({ demo: { enabled: false } }), /Demo accounts/);
  assert.doesNotMatch(authScreen({}), /Demo accounts/);
  assert.doesNotMatch(authScreen({ mode: "register", demo }), /Demo accounts/, "not shown while registering");
  const evil = '"><img src=x onerror=alert(1)>';
  const escaped = authScreen({ demo: { enabled: true, password: evil, accounts: [{ name: evil, email: evil, role: evil, title: evil }] } });
  assert.doesNotMatch(escaped, /<img/i);
});
