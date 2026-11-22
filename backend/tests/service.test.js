import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthenticationError, AuthorizationError, DuplicateIncidentError, IncidentNotFoundError, InvalidTransitionError,
  MissingSlaConfigError, RateLimitError, ServiceNotFoundError, TechnicianUnavailableError, ValidationError, WorkloadExceededError,
} from "../errors.js";
import { makeApp, PASSWORD } from "./helpers.js";

const techFor = (app, view) => app.container.repos.users.findById(view.technician.id);

test("reporting creates, classifies, prioritises, SLA-stamps, assigns and notifies", () => {
  const app = makeApp();
  const view = app.container.incidents.create(app.jordan, app.report());
  assert.equal(view.status, "Assigned");
  assert.equal(view.priority, "P1");
  assert.equal(view.category, "Application");
  assert.ok(view.technician.name);
  assert.equal(view.sla.label, "On track");
  // the Payment portal has a stricter P1 override: 3 min response / 20 min resolution
  assert.equal(view.sla.responseDue - view.createdAt, 3 * 60000);
  assert.equal(view.sla.resolutionDue - view.createdAt, 20 * 60000);
  const actions = view.history.map((h) => h.action);
  assert.deepEqual(actions, ["INCIDENT_CREATED", "INCIDENT_CLASSIFIED", "TECHNICIAN_ASSIGNED"]);
  assert.equal(view.history[2].previousState, "Classified");
  assert.equal(view.history[2].newState, "Assigned");
  const techNotes = app.container.repos.notifications.forUser(view.technician.id);
  assert.ok(techNotes.some((n) => n.event === "TECHNICIAN_ASSIGNED"));
  assert.ok(app.container.repos.notifications.forUser(app.admin.id).some((n) => n.event === "INCIDENT_CREATED"));
  assert.ok(app.container.repos.notifications.outbox().some((n) => n.event === "TECHNICIAN_ASSIGNED"), "simulated e-mail channel is used");
});

test("full lifecycle by role: acknowledge → investigate → resolve → verify → close, with audit trail", () => {
  const app = makeApp();
  const { incidents } = app.container;
  const created = incidents.create(app.jordan, app.report({ title: "Campus Wi-Fi down", description: "No wireless at all in block B.", serviceId: app.service("Campus Wi-Fi") }));
  const tech = techFor(app, created);
  const id = created.id;
  app.clock.advance(2);
  assert.equal(incidents.acknowledge(tech, id).status, "Acknowledged");
  assert.equal(incidents.startInvestigation(tech, id).status, "In progress");
  incidents.addNote(tech, id, { text: "Switch uplink flapping", internal: true });
  assert.throws(() => incidents.resolve(tech, id, { resolution: "" }), ValidationError);
  assert.equal(incidents.resolve(tech, id, { resolution: "Replaced the uplink cable." }).status, "Resolved");
  assert.equal(incidents.verify(app.jordan, id).status, "Verified");
  const closed = incidents.close(tech, id);
  assert.equal(closed.status, "Closed");
  const trail = closed.history.map((h) => h.action);
  assert.deepEqual(trail.slice(-6), ["INCIDENT_ACKNOWLEDGED", "INVESTIGATION_STARTED", "NOTE_ADDED", "INCIDENT_RESOLVED", "INCIDENT_VERIFIED", "INCIDENT_CLOSED"]);
  // internal notes are hidden from the reporter
  assert.equal(incidents.get(app.jordan, id).notes.length, 0);
  assert.equal(incidents.get(tech, id).notes.length, 1);
});

test("invalid transitions and wrong actors are rejected", () => {
  const app = makeApp();
  const { incidents } = app.container;
  const view = incidents.create(app.jordan, app.report());
  const assigned = techFor(app, view);
  const other = [app.asha, app.ravi, app.neha, app.lead].find((t) => t.id !== assigned.id);
  assert.throws(() => incidents.close(app.admin, view.id), InvalidTransitionError);
  assert.throws(() => incidents.resolve(assigned, view.id, { resolution: "too early" }), InvalidTransitionError);
  assert.throws(() => incidents.acknowledge(other, view.id), IncidentNotFoundError); // not visible to unrelated technician
  assert.throws(() => incidents.acknowledge(app.jordan, view.id), AuthorizationError);
  assert.throws(() => incidents.assign(app.jordan, view.id, {}), AuthorizationError);
  assert.throws(() => incidents.assign(assigned, view.id, {}), AuthorizationError);
});

test("employees only see their own incidents; technicians their assigned ones", () => {
  const app = makeApp();
  const { incidents } = app.container;
  const mine = incidents.create(app.jordan, app.report());
  incidents.create(app.maya, app.report({ title: "Laptop screen flickers badly", description: "It flickers after waking up.", serviceId: app.service("Office workstation"), impact: 1, urgency: 1 }));
  assert.equal(incidents.list(app.jordan).total, 1);
  assert.equal(incidents.list(app.admin).total, 2);
  assert.throws(() => incidents.get(app.maya, mine.id), IncidentNotFoundError);
  const tech = techFor(app, mine);
  assert.ok(incidents.list(tech).items.every((i) => i.technician?.id === tech.id || i.reporter.id === tech.id));
});

test("input validation and unknown services", () => {
  const app = makeApp();
  const { incidents } = app.container;
  assert.throws(() => incidents.create(app.jordan, app.report({ title: "bad" })), ValidationError);
  assert.throws(() => incidents.create(app.jordan, app.report({ impact: 9 })), ValidationError);
  assert.throws(() => incidents.create(app.jordan, app.report({ description: 42 })), ValidationError);
  assert.throws(() => incidents.create(app.jordan, app.report({ serviceId: 9999 })), ServiceNotFoundError);
  assert.throws(() => incidents.create(app.jordan, app.report({ category: "Nonsense" })), ValidationError);
  assert.throws(() => incidents.list(app.admin, { priority: "P9" }), ValidationError);
  assert.throws(() => incidents.get(app.admin, "not-an-id"), ValidationError);
  assert.throws(() => incidents.get(app.admin, "INC-424242"), IncidentNotFoundError);
});

test("near-identical open reports from the same person are blocked unless forced; related ones are linked", () => {
  const app = makeApp();
  const { incidents } = app.container;
  const first = incidents.create(app.jordan, app.report());
  assert.throws(() => incidents.create(app.jordan, app.report()), DuplicateIncidentError);
  const forced = incidents.create(app.jordan, app.report({ force: true }));
  assert.ok(incidents.get(app.admin, forced.id).related.some((r) => r.id === first.id));
  assert.equal(forced.related.length, 0, "duplicate links are staff-only");
  const related = incidents.create(app.maya, app.report({ title: "Unable to make payment", description: "The fee payment keeps failing at checkout.", impact: 3, urgency: 2 }));
  const relatedDetail = incidents.get(app.admin, related.id);
  assert.ok(relatedDetail.related.some((r) => r.id === first.id && r.kind === "duplicate"));
  assert.ok(relatedDetail.history.some((h) => h.action === "DUPLICATE_FLAGGED"));
  assert.equal(app.container.reports.correlations(app.admin).length, 1, "3 payment reports in an hour correlate");
});

test("search supports id, text, status, priority, category, service, technician, SLA and date filters", () => {
  const app = makeApp();
  const { incidents } = app.container;
  const a = incidents.create(app.jordan, app.report());
  const b = incidents.create(app.maya, app.report({ title: "Printer jam on floor two", description: "Paper keeps jamming in the office printer.", serviceId: app.service("Office workstation"), impact: 1, urgency: 1 }));
  const q = (query) => incidents.list(app.admin, query).items.map((i) => i.id);
  assert.deepEqual(q({ id: `INC-${a.id}` }), [a.id]);
  assert.deepEqual(q({ q: "printer" }), [b.id]);
  assert.deepEqual(q({ priority: "P1" }), [a.id]);
  assert.deepEqual(q({ category: "Hardware" }), [b.id]);
  assert.deepEqual(q({ service: "Payment portal" }), [a.id]);
  assert.deepEqual(q({ technician: String(a.technician.id) }).includes(a.id), true);
  assert.deepEqual(q({ status: "Assigned" }).sort(), [a.id, b.id].sort());
  assert.deepEqual(q({ status: "Closed" }), []);
  assert.deepEqual(q({ sla: "On track" }).sort(), [a.id, b.id].sort());
  assert.deepEqual(q({ from: "2026-10-18", to: "2026-10-18" }).sort(), [a.id, b.id].sort());
  assert.deepEqual(q({ from: "2030-01-01" }), []);
  assert.equal(incidents.list(app.admin, { limit: 1 }).items.length, 1);
});

test("request-info / respond loop, reopen and one-time feedback", () => {
  const app = makeApp();
  const { incidents } = app.container;
  const created = incidents.create(app.jordan, app.report({ title: "Cannot open shared folder", description: "Access denied on the cloud storage share.", serviceId: app.service("Cloud storage"), impact: 2, urgency: 2 }));
  const tech = techFor(app, created);
  incidents.acknowledge(tech, created.id);
  const asked = incidents.requestInfo(tech, created.id, { question: "Which folder path fails?" });
  assert.equal(asked.awaitingInfo, true);
  assert.ok(app.container.repos.notifications.forUser(app.jordan.id).some((n) => n.event === "INFO_REQUESTED"));
  const answered = incidents.respond(app.jordan, created.id, { text: "/projects/finance" });
  assert.equal(answered.awaitingInfo, false);
  assert.deepEqual(answered.notes.map((n) => n.kind), ["info_request", "reporter_info"]);
  incidents.startInvestigation(tech, created.id);
  incidents.resolve(tech, created.id, { resolution: "Restored the ACL on the folder." });
  assert.equal(incidents.reopen(app.jordan, created.id, { reason: "Still denied for me" }).status, "In progress");
  incidents.resolve(tech, created.id, { resolution: "Cleared the cached token as well." });
  incidents.verify(app.jordan, created.id);
  assert.throws(() => incidents.feedback(app.maya, created.id, { rating: 5 }), IncidentNotFoundError);
  assert.equal(incidents.feedback(app.jordan, created.id, { rating: 4, comment: "Quick" }).feedback.rating, 4);
  assert.throws(() => incidents.feedback(app.jordan, created.id, { rating: 5 }), ValidationError);
});

test("changing impact/urgency recalculates priority, SLA deadlines and notifies", () => {
  const app = makeApp();
  const { incidents } = app.container;
  const created = incidents.create(app.jordan, app.report({ title: "Slow shared drive access", description: "Opening files from the drive is slow.", serviceId: app.service("Cloud storage"), impact: 1, urgency: 1 }));
  assert.equal(created.priority, "P4");
  const updated = incidents.update(app.jordan, created.id, { impact: 3, urgency: 2 });
  assert.equal(updated.priority, "P2");
  assert.ok(updated.sla.resolutionDue < created.sla.resolutionDue);
  assert.ok(updated.history.some((h) => h.action === "PRIORITY_CHANGED"));
  incidents.acknowledge(techFor(app, created), created.id);
  assert.throws(() => incidents.update(app.jordan, created.id, { title: "Changed my mind about it" }), ValidationError);
});

test("SLA monitor warns once, records violations once, and escalates unacknowledged P1s up the ladder", () => {
  const app = makeApp();
  const { incidents, slaMonitor, repos, reports } = app.container;
  const created = incidents.create(app.jordan, app.report());
  app.clock.advance(2.5); // response target 3 min → inside the warning window
  assert.equal(slaMonitor.tick().warnings, 1);
  assert.equal(slaMonitor.tick().warnings, 0, "warning is not repeated");
  app.clock.advance(1); // 3.5 min: response breached; first window passed → level 1 (Team Lead)
  const first = slaMonitor.tick();
  assert.equal(first.violations, 1);
  assert.equal(first.escalations, 1);
  assert.equal(incidents.get(app.admin, created.id).escalatedTo, "Team Lead");
  app.clock.advance(3); // another response window → System Administrator
  slaMonitor.tick();
  assert.equal(incidents.get(app.admin, created.id).escalatedTo, "System Administrator");
  app.clock.advance(3);
  slaMonitor.tick();
  assert.equal(incidents.get(app.admin, created.id).escalatedTo, "IT Manager");
  app.clock.advance(60);
  assert.equal(slaMonitor.tick().violations, 1, "resolution breach recorded separately");
  assert.equal(slaMonitor.tick().violations, 0);
  assert.equal(reports.violations(app.admin).length, 2);
  assert.ok(repos.notifications.forUser(app.manager.id).some((n) => n.event === "INCIDENT_ESCALATED"));
  assert.ok(repos.notifications.forUser(app.lead.id).some((n) => n.event === "INCIDENT_ESCALATED"));
  assert.equal(incidents.get(app.admin, created.id).sla.label, "Breached");
});

test("acknowledging in time stops escalation; acknowledging late still records the breach", () => {
  const app = makeApp();
  const { incidents, slaMonitor } = app.container;
  const ok = incidents.create(app.jordan, app.report({ title: "Campus login fails for everyone", description: "Nobody can sign in to campus login.", serviceId: app.service("Campus login") }));
  incidents.acknowledge(techFor(app, ok), ok.id);
  app.clock.advance(30);
  assert.equal(slaMonitor.tick().escalations, 0);
  const late = incidents.create(app.maya, app.report({ title: "Payment gateway timeouts again", description: "Gateway responds with timeouts for card payments.", impact: 3, urgency: 3 }));
  app.clock.advance(10);
  incidents.acknowledge(techFor(app, late), late.id);
  assert.ok(app.container.reports.violations(app.admin).some((v) => v.incidentId === late.id && v.kind === "response_violation"));
});

test("missing SLA configuration is reported as a domain error", () => {
  const app = makeApp();
  app.container.db.run("DELETE FROM sla_policies WHERE priority = 'P4'");
  assert.throws(() => app.container.incidents.create(app.jordan, app.report({ title: "Tiny cosmetic glitch", description: "The logo looks slightly off.", serviceId: app.service("Office workstation"), impact: 1, urgency: 1 })), MissingSlaConfigError);
});

test("no skilled technician leaves the incident Classified and tells the admins; admin can assign manually", () => {
  const app = makeApp();
  const { incidents, repos } = app.container;
  const database = app.container.admin.createService(app.admin, { name: "Legacy fax", category: "Storage", criticality: 1 });
  // no seeded technician has Storage except Ravi; make him unavailable
  app.container.admin.updateUser(app.admin, app.ravi.id, { available: false });
  const view = incidents.create(app.jordan, { title: "Fax archive cannot be restored", description: "Old fax archive restore is failing.", serviceId: database.id, impact: 2, urgency: 2 });
  assert.equal(view.status, "Classified");
  assert.equal(view.technician, null);
  assert.ok(repos.notifications.forUser(app.admin.id).some((n) => n.event === "ASSIGNMENT_FAILED"));
  assert.throws(() => incidents.assign(app.admin, view.id, { technicianId: app.ravi.id }), TechnicianUnavailableError);
  assert.equal(incidents.assign(app.admin, view.id, { technicianId: app.neha.id }).status, "Assigned");
});

test("workload limits are enforced on manual assignment", () => {
  const app = makeApp();
  const { incidents, admin } = app.container;
  admin.updateUser(app.admin, app.neha.id, { maxWorkload: 1 });
  const make = (n) => incidents.create(app.jordan, app.report({ title: `Workstation fault number ${n}`, description: `Unique hardware problem number ${n} on the desk.`, serviceId: app.service("Office workstation"), impact: 1, urgency: 1, force: true }));
  const a = make(1);
  const b = make(2);
  const target = incidents.assign(app.admin, a.id, { technicianId: app.neha.id });
  assert.equal(target.technician.id, app.neha.id);
  assert.throws(() => incidents.assign(app.admin, b.id, { technicianId: app.neha.id }), WorkloadExceededError);
});

test("admin can switch assignment strategy; non-admins cannot", () => {
  const app = makeApp();
  const { admin } = app.container;
  assert.throws(() => admin.updateSettings(app.jordan, { assignmentStrategy: "load" }), AuthorizationError);
  assert.throws(() => admin.updateSettings(app.admin, { assignmentStrategy: "magic" }), ValidationError);
  assert.equal(admin.updateSettings(app.admin, { assignmentStrategy: "load" }).assignmentStrategy, "load");
  const view = app.container.incidents.create(app.jordan, app.report({ title: "Cloud bucket permissions broken", description: "Cannot write to the shared cloud bucket.", serviceId: app.service("Cloud storage") }));
  assert.equal(view.status, "Assigned");
});

test("admin manages users, services, categories and SLA policies; rules are validated", () => {
  const app = makeApp();
  const { admin } = app.container;
  const tech = admin.createUser(app.admin, { name: "Kim Park", email: "kim@incidentdesk.test", role: "Technician", password: PASSWORD, skills: ["Security"], experience: 4 });
  assert.deepEqual(tech.skills, ["Security"]);
  assert.throws(() => admin.createUser(app.admin, { name: "Kim Dup", email: "KIM@incidentdesk.test", role: "Employee", password: PASSWORD }), ValidationError);
  assert.throws(() => admin.createUser(app.admin, { name: "Weak", email: "weak@incidentdesk.test", role: "Employee", password: "short" }), ValidationError);
  assert.throws(() => admin.createUser(app.jordan, { name: "Nope", email: "nope@incidentdesk.test", role: "Employee", password: PASSWORD }), AuthorizationError);
  assert.throws(() => admin.updateUser(app.admin, app.admin.id, { active: false }), ValidationError);
  admin.saveCategory(app.admin, { name: "Telephony", keywords: ["phone", "voip"] });
  const svc = admin.createService(app.admin, { name: "Desk phones", category: "Telephony", criticality: 2 });
  assert.throws(() => admin.createService(app.admin, { name: "Bad", category: "Missing", criticality: 2 }), ValidationError);
  admin.saveSlaPolicy(app.admin, { serviceId: svc.id, priority: "P3", responseMinutes: 30, resolutionMinutes: 240 });
  assert.throws(() => admin.saveSlaPolicy(app.admin, { priority: "P3", responseMinutes: 60, resolutionMinutes: 30 }), ValidationError);
  assert.throws(() => admin.removeCategory(app.admin, "Telephony"), ValidationError, "category in use by a service");
  const view = app.container.incidents.create(app.jordan, { title: "Desk phone has no dial tone", description: "The VoIP desk phone shows no dial tone at all.", serviceId: svc.id, impact: 2, urgency: 2 });
  assert.equal(view.category, "Telephony");
  assert.equal(view.sla.responseDue - view.createdAt, 30 * 60000);
});

test("reports: overview, workload, service analysis, risk and suggestions", () => {
  const app = makeApp();
  const { incidents, reports } = app.container;
  const first = incidents.create(app.jordan, app.report({ title: "Campus login rejects password", description: "Password rejected for campus login after reset.", serviceId: app.service("Campus login"), impact: 2, urgency: 2 }));
  const tech = techFor(app, first);
  incidents.acknowledge(tech, first.id);
  incidents.startInvestigation(tech, first.id);
  incidents.resolve(tech, first.id, { resolution: "Cleared the stale password hash in the identity cache." });
  incidents.verify(app.jordan, first.id);
  incidents.close(tech, first.id);
  incidents.create(app.maya, app.report({ title: "Campus login rejects my password", description: "Password rejected at campus login.", serviceId: app.service("Campus login"), impact: 2, urgency: 2 }));
  const overview = reports.overview(app.admin);
  assert.equal(overview.total, 2);
  assert.equal(overview.open, 1);
  assert.equal(overview.closed, 1);
  assert.equal(reports.byService(app.admin)[0].service, "Campus login");
  assert.ok(reports.workload(app.admin).some((w) => w.activeIncidents === 1));
  assert.equal(reports.workload(tech).length, 1, "technicians only see their own workload");
  assert.throws(() => reports.overview(app.jordan), AuthorizationError);
  const second = incidents.list(app.admin, { state: "open" }).items[0];
  const detail = incidents.get(app.admin, second.id);
  assert.ok(detail.suggestedResolutions[0].resolution.includes("identity cache"));
  assert.ok(["low", "medium", "high"].includes(detail.risk.level));
  assert.equal(reports.trend(app.admin, 3).length, 3);
});

test("authentication: registration, login, wrong password, throttling and logout", () => {
  const app = makeApp();
  const { auth } = app.container;
  const employee = auth.register({ name: "New Hire", email: "new.hire@incidentdesk.test", password: "Welcome123" });
  assert.equal(employee.role, "Employee");
  assert.throws(() => auth.register({ name: "New Hire", email: "new.hire@incidentdesk.test", password: "Welcome123" }), ValidationError);
  assert.throws(() => auth.register({ name: "X", email: "not-an-email", password: "Welcome123" }), ValidationError);
  const session = auth.login("NEW.HIRE@incidentdesk.test", "Welcome123");
  assert.equal(auth.authenticate(session.token).id, employee.id);
  auth.logout(session.token);
  assert.throws(() => auth.authenticate(session.token), AuthenticationError);
  assert.throws(() => auth.authenticate(undefined), AuthenticationError);
  for (let i = 0; i < 5; i += 1) assert.throws(() => auth.login("jordan@incidentdesk.test", "wrong-pass-1"), AuthenticationError);
  assert.throws(() => auth.login("jordan@incidentdesk.test", PASSWORD), RateLimitError);
  app.clock.advance(16);
  assert.ok(auth.login("jordan@incidentdesk.test", PASSWORD).token);
  assert.throws(() => auth.login("ghost@incidentdesk.test", "whatever123"), AuthenticationError);
});

test("sessions expire and deactivated users lose access", () => {
  const app = makeApp();
  const { auth, admin } = app.container;
  const session = auth.login("maya@incidentdesk.test", PASSWORD);
  app.clock.advance(9 * 60);
  assert.throws(() => auth.authenticate(session.token), AuthenticationError);
  const again = auth.login("maya@incidentdesk.test", PASSWORD);
  admin.updateUser(app.admin, app.maya.id, { active: false });
  assert.throws(() => auth.authenticate(again.token), AuthenticationError);
  assert.throws(() => auth.login("maya@incidentdesk.test", PASSWORD), AuthenticationError);
});

test("a failed write rolls the whole operation back (no half-created incident)", () => {
  const app = makeApp();
  const { incidents, bus, db } = app.container;
  const unsubscribe = bus.subscribe("TECHNICIAN_ASSIGNED", () => { throw new Error("observer exploded"); });
  assert.throws(() => incidents.create(app.jordan, app.report()), /observer exploded/);
  unsubscribe();
  assert.equal(db.get("SELECT COUNT(*) AS n FROM incidents").n, 0);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM audit_log").n, 0);
});

test("improvement proposals: submitted with the report, reviewed only by the assigned technician, with a valid decision path", () => {
  const app = makeApp();
  const { incidents, repos } = app.container;
  const created = incidents.create(app.jordan, app.report({ title: "Campus Wi-Fi is down in block C", description: "No wireless anywhere in block C.", serviceId: app.service("Campus Wi-Fi"), proposal: "Add a wireless status banner." }));
  assert.equal(created.proposal.status, "Proposed");
  assert.ok(created.history.some((h) => h.action === "PROPOSAL_SUBMITTED"));
  const tech = techFor(app, created);
  assert.ok(incidents.get(tech, created.id).actions.includes("review-proposal"));
  assert.throws(() => incidents.reviewProposal(app.jordan, created.id, { decision: "Accepted" }), AuthorizationError);
  assert.throws(() => incidents.reviewProposal(tech, created.id, { decision: "Implemented" }), ValidationError, "cannot skip acceptance");
  const accepted = incidents.reviewProposal(tech, created.id, { decision: "Accepted", note: "Scheduled for next sprint." });
  assert.equal(accepted.proposal.status, "Accepted");
  assert.equal(accepted.proposal.reviewer.id, tech.id);
  assert.ok(repos.notifications.forUser(app.jordan.id).some((n) => n.event === "PROPOSAL_REVIEWED"));
  assert.equal(incidents.reviewProposal(tech, created.id, { decision: "Implemented" }).proposal.status, "Implemented");
  assert.throws(() => incidents.reviewProposal(tech, created.id, { decision: "Declined" }), ValidationError, "implemented is final");
  const plain = incidents.create(app.maya, app.report({ title: "Printer jams constantly", description: "The office printer jams on every job.", serviceId: app.service("Office workstation"), impact: 1, urgency: 1 }));
  assert.throws(() => incidents.reviewProposal(techFor(app, plain), plain.id, { decision: "Accepted" }), ValidationError, "no proposal on this incident");
});

test("knowledge base: staff see all resolutions, employees only their own", () => {
  const app = makeApp();
  const { incidents } = app.container;
  const solve = (reporter, title) => {
    const view = incidents.create(reporter, app.report({ title, description: `${title} - details of the problem.`, serviceId: app.service("Cloud storage"), impact: 1, urgency: 1, force: true }));
    const tech = techFor(app, view);
    incidents.acknowledge(tech, view.id);
    incidents.startInvestigation(tech, view.id);
    incidents.resolve(tech, view.id, { resolution: `Fix for ${title}` });
    return view.id;
  };
  solve(app.jordan, "Jordan quota problem");
  solve(app.maya, "Maya upload problem");
  assert.equal(incidents.knowledge(app.admin).length, 2);
  assert.deepEqual(incidents.knowledge(app.jordan).map((k) => k.title), ["Jordan quota problem"]);
});

test("opening an older database adds the proposal columns without losing data", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { DatabaseSync } = await import("node:sqlite");
  const { Database } = await import("../persistence/database.js");
  const folder = mkdtempSync(join(tmpdir(), "incident-desk-migrate-"));
  const path = join(folder, "old.sqlite");
  try {
    const old = new DatabaseSync(path);
    const { SCHEMA } = await import("../persistence/database.js");
    const previous = SCHEMA.replace(/,\n  proposal_text TEXT,\n  proposal_status TEXT,\n  proposal_reviewer_id INTEGER,\n  proposal_note TEXT,\n  proposal_reviewed_at INTEGER/, "");
    assert.ok(!previous.includes("proposal_text"), "fixture models the pre-proposal schema");
    for (const statement of previous.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean)) old.prepare(statement).run();
    old.prepare("INSERT INTO users (name, email, role, password_hash, created_at) VALUES ('U', 'u@x.test', 'Employee', 'x', 1)").run();
    old.prepare("INSERT INTO services (name, category, criticality) VALUES ('S', 'Hardware', 1)").run();
    old.prepare(`INSERT INTO incidents (title, description, reporter_id, category, service_id, impact, urgency, criticality, score, priority, status, created_at, updated_at, response_due, resolution_due)
      VALUES ('kept', 'desc', 1, 'Hardware', 1, 1, 1, 1, 1, 'P4', 'New', 1, 1, 2, 3)`).run();
    old.close();
    const db = new Database(path);
    const columns = db.all("PRAGMA table_info(incidents)").map((c) => c.name);
    assert.ok(["proposal_text", "proposal_status", "proposal_reviewer_id", "proposal_note", "proposal_reviewed_at"].every((c) => columns.includes(c)));
    assert.equal(db.get("SELECT title FROM incidents").title, "kept");
    db.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test("a manual clock only moves when advanced (used for repeatable demos)", async () => {
  const { Clock } = await import("../util.js");
  const manual = new Clock({ manual: true });
  const start = manual.now();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(manual.now(), start);
  assert.equal(manual.advance(5), start + 5 * 60000);
  const live = new Clock();
  const before = live.now();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.ok(live.now() > before);
});
