import assert from "node:assert/strict";
import test from "node:test";
import { AssignmentEngine, ExperienceBasedStrategy, LoadBasedStrategy, RoundRobinStrategy, SkillBasedStrategy } from "../domain/assignment.js";
import { Incident } from "../domain/Incident.js";
import { PriorityCalculator } from "../domain/priority.js";
import { SlaTracker } from "../domain/sla.js";
import { IncidentStates } from "../domain/states.js";
import { SYSTEM, UserFactory } from "../domain/users.js";
import { hashPassword, verifyPassword } from "../auth/auth.js";
import { InvalidTransitionError, TechnicianUnavailableError, WorkloadExceededError, AuthorizationError } from "../errors.js";
import { CategoryClassifier, DuplicateDetector, EscalationPolicy, IncidentCorrelator } from "../intelligence/analyzers.js";

const tech = (id, name, skills, experience, extra = {}) =>
  UserFactory.create({ id, name, email: `${name}@x.test`, role: "Technician", skills, experience, active: true, ...extra });
const candidate = (technician, load = 0, skillMatch = true, serviceExperience = 0) => ({ technician, load, skillMatch, serviceExperience });

const newIncident = (overrides = {}) =>
  Incident.create({
    title: "Test incident", description: "A test incident description", reporterId: 10, serviceId: 1, category: "Application",
    impact: 2, urgency: 2, affectedUsers: 1, criticality: 2, score: 8, priority: "P3", responseDue: 3600000, resolutionDue: 28800000, ...overrides,
  }, 0);

test("State pattern blocks New → Closed and lists the allowed next states", () => {
  const incident = newIncident();
  assert.throws(() => incident.close(SYSTEM, 1), InvalidTransitionError);
  assert.deepEqual(IncidentStates.of("New").next, ["Classified"]);
  assert.equal(IncidentStates.of("Closed").next.length, 0);
});

test("only the system may classify; employees cannot jump ahead", () => {
  const incident = newIncident();
  const employee = UserFactory.create({ id: 10, name: "E", email: "e@x.test", role: "Employee", active: true });
  assert.throws(() => incident.classify("Application", 1, employee), AuthorizationError);
  incident.classify("Application", 1, SYSTEM);
  assert.equal(incident.status, "Classified");
});

test("weighted priority uses impact × urgency × criticality with an affected-users factor", () => {
  const calc = new PriorityCalculator().get("weighted");
  assert.equal(calc.calculate({ impact: 3, urgency: 3, criticality: 3 }).priority, "P1");
  assert.equal(calc.calculate({ impact: 1, urgency: 1, criticality: 1 }).priority, "P4");
  assert.equal(calc.calculate({ impact: 2, urgency: 2, criticality: 2 }).priority, "P3");
  assert.equal(calc.calculate({ impact: 2, urgency: 2, criticality: 2, affectedUsers: 80 }).priority, "P2"); // 8 × 1.5 = 12
  const rules = new PriorityCalculator().get("rules");
  assert.equal(rules.calculate({ impact: 1, urgency: 2, criticality: 3, affectedUsers: 500 }).priority, "P1");
});

test("skill-based strategy prefers the specialist; load-based prefers the idle technician", () => {
  const specialist = tech(1, "Spec", ["Network"], 2);
  const generalist = tech(2, "Gen", ["Network", "Cloud", "Hardware"], 9);
  const engine = new AssignmentEngine([new SkillBasedStrategy(), new LoadBasedStrategy()]);
  const list = [candidate(specialist, 3), candidate(generalist, 0)];
  assert.equal(engine.choose("skill", list, { incident: { category: "Network" } }).technician.name, "Spec");
  assert.equal(engine.choose("load", list, { incident: { category: "Network" } }).technician.name, "Gen");
});

test("experience-based strategy weights service history; round robin rotates", () => {
  const a = tech(1, "A", ["Cloud"], 5);
  const b = tech(2, "B", ["Cloud"], 4);
  const store = { v: 0, get() { return this.v; }, set(x) { this.v = x; } };
  const engine = new AssignmentEngine([new ExperienceBasedStrategy(), new RoundRobinStrategy(store)]);
  const incident = { category: "Cloud", priority: "P3" };
  assert.equal(engine.choose("experience", [candidate(a, 0, true, 0), candidate(b, 0, true, 2)], { incident }).technician.name, "B");
  const picks = [1, 2, 3].map(() => engine.choose("round-robin", [candidate(a), candidate(b)], { incident }).technician.name);
  assert.deepEqual(picks, ["A", "B", "A"]);
});

test("assignment reports why nobody could be chosen", () => {
  const engine = new AssignmentEngine([new SkillBasedStrategy()]);
  const full = candidate(tech(1, "Full", ["Cloud"], 1, { maxWorkload: 2 }), 2);
  assert.throws(() => engine.choose("skill", [], { incident: { category: "Cloud" } }, [full]), WorkloadExceededError);
  assert.throws(() => engine.choose("skill", [], { incident: { category: "Cloud" } }, []), TechnicianUnavailableError);
  assert.throws(() => engine.choose("skill", [candidate(tech(2, "Wrong", ["Network"], 1), 0, false)], { incident: { category: "Cloud" } }), TechnicianUnavailableError);
});

test("SLA tracker reports on track, at risk, breached and met", () => {
  const tracker = new SlaTracker();
  const incident = newIncident({ responseDue: 10 * 60000, resolutionDue: 100 * 60000 });
  assert.equal(tracker.evaluate(incident, 1 * 60000).label, "On track");
  assert.equal(tracker.evaluate(incident, 9 * 60000).label, "At risk"); // response window nearly gone
  assert.equal(tracker.evaluate(incident, 11 * 60000).label, "Breached");
  incident.classify("Application", 0, SYSTEM);
  incident.assign(tech(5, "T", ["Application"], 1), SYSTEM, 0);
  const technician = tech(5, "T", ["Application"], 1);
  incident.acknowledge(technician, 2 * 60000);
  assert.equal(tracker.evaluate(incident, 30 * 60000).label, "On track");
  assert.equal(tracker.evaluate(incident, 80 * 60000).label, "At risk");
  incident.startInvestigation(technician, 3 * 60000);
  incident.resolve(technician, 50 * 60000, "Restarted the service");
  assert.equal(tracker.evaluate(incident, 500 * 60000).label, "Met");
});

test("duplicate detector links the PDF's payment examples but not unrelated reports", () => {
  const detector = new DuplicateDetector();
  const open = [
    { id: 101, title: "Payment application unavailable", description: "", serviceId: 1 },
    { id: 105, title: "Printer out of toner", description: "", serviceId: 2 },
  ];
  for (const title of ["Payment transaction failing", "Unable to make payment"]) {
    const hits = detector.find({ title, serviceId: 1 }, open);
    assert.deepEqual(hits.map((h) => h.id), [101], title);
  }
  assert.equal(detector.find({ title: "Wi-Fi slow in library", serviceId: 3 }, open).length, 0);
});

test("category classifier suggests from keywords and correlator groups bursts", () => {
  const cats = [{ name: "Network", keywords: ["wifi", "vpn"] }, { name: "Hardware", keywords: ["laptop", "printer"] }];
  assert.equal(new CategoryClassifier().suggest("VPN keeps disconnecting", "", cats)[0].category, "Network");
  assert.equal(new CategoryClassifier().suggest("Quarterly report", "", cats).length, 0);
  const at = (m) => m * 60000;
  const cluster = new IncidentCorrelator({ windowMinutes: 30, minimum: 3 }).correlate([
    { id: 1, serviceId: 1, serviceName: "Pay", title: "a", priority: "P1", createdAt: at(0) },
    { id: 2, serviceId: 1, serviceName: "Pay", title: "b", priority: "P2", createdAt: at(10) },
    { id: 3, serviceId: 1, serviceName: "Pay", title: "c", priority: "P2", createdAt: at(20) },
    { id: 4, serviceId: 2, serviceName: "Wifi", title: "d", priority: "P3", createdAt: at(21) },
  ]);
  assert.equal(cluster.length, 1);
  assert.equal(cluster[0].count, 3);
});

test("escalation climbs one level per missed response window for P1/P2 only", () => {
  const policy = new EscalationPolicy();
  const i = newIncident({ priority: "P1", responseDue: 5 * 60000 });
  i.classify("Application", 0, SYSTEM);
  assert.equal(policy.levelFor(i, 4 * 60000), 0);
  assert.equal(policy.levelFor(i, 6 * 60000), 1);
  assert.equal(policy.levelFor(i, 11 * 60000), 2);
  assert.equal(policy.levelFor(i, 500 * 60000), 3);
  const low = newIncident({ priority: "P3", responseDue: 5 * 60000 });
  assert.equal(policy.levelFor(low, 500 * 60000), 0);
});

test("passwords are salted scrypt hashes", () => {
  const a = hashPassword("Secret123");
  assert.notEqual(a, hashPassword("Secret123"));
  assert.ok(verifyPassword("Secret123", a));
  assert.ok(!verifyPassword("secret123", a));
});
