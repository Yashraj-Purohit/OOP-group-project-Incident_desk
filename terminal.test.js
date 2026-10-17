import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TicketStore, terminalAction } from "./ticket-store.js";
import { TerminalSession, safeText } from "./terminal-session.js";
import { seed } from "./domain.js";

const report = {
  title: "Payment portal unavailable from terminal",
  description:
    "Several departments cannot complete a payment through the portal.",
  service: "Payment portal",
  impact: 3,
  urgency: 3,
  proposal: "Show an outage banner before users attempt payment.",
};

async function fixture(t) {
  const folder = await mkdtemp(join(tmpdir(), "incident-desk-test-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  return new TicketStore(join(folder, "incidents.json")).load();
}

test("terminal preview is read-only; submission persists incidents, proposals and notifications", async (t) => {
  const store = await fixture(t);
  const preview = await terminalAction(store, {
    action: "preview",
    report,
    role: "Employee",
  });
  assert.equal(preview.priority, "P1");
  assert.ok(preview.duplicates.some((incident) => incident.id === 1024));
  assert.equal(store.snapshot().data.incidents.length, 8);
  const incident = await terminalAction(store, {
    action: "create",
    report,
    role: "Employee",
  });
  assert.equal(incident.reporter, "Ananya Rao");
  assert.equal(incident.source, "Terminal");
  assert.equal(incident.proposal.status, "Proposed");
  assert.equal(incident.technician, "Asha Mehta");
  const restored = await new TicketStore(store.path).load();
  assert.equal(restored.snapshot().data.incidents[0].id, incident.id);
  assert.ok(
    restored
      .snapshot()
      .data.notifications.some((note) => note.channel === "Email simulation"),
  );
});

test("concurrent terminal reports receive unique IDs and stale UI saves are rejected", async (t) => {
  const store = await fixture(t);
  const old = store.snapshot();
  await Promise.all([
    store.create(report, "Employee"),
    store.create(report, "Employee"),
  ]);
  const ids = store.snapshot().data.incidents.map((incident) => incident.id);
  assert.equal(new Set(ids).size, 10);
  await assert.rejects(
    store.replace(old.data, old.revision),
    /Another interface/,
  );
  assert.equal(store.snapshot().data.incidents.length, 10);
});

test("saved UI updates appear in terminal views and old browser data imports only once", async (t) => {
  const store = await fixture(t);
  const browser = seed();
  browser.incidents[0].title = "Existing browser incident";
  await store.bootstrap(browser);
  await store.bootstrap(seed());
  const snapshot = store.snapshot();
  snapshot.data.incidents[0].status = "Resolved";
  snapshot.data.incidents[0].resolution = "Service has been restored.";
  await store.replace(snapshot.data, snapshot.revision);
  const incident = await terminalAction(store, {
    action: "view",
    id: "INC-1024",
    role: "Employee",
  });
  assert.equal(incident.title, "Existing browser incident");
  assert.equal(incident.status, "Resolved");
});

test("role visibility excludes other reporters and employee views exclude internal notes", async (t) => {
  const store = await fixture(t);
  const snapshot = store.snapshot();
  snapshot.data.incidents[0].notes.push({
    text: "Support-only investigation",
    internal: true,
  });
  await store.replace(snapshot.data, snapshot.revision);
  await assert.rejects(
    terminalAction(store, { action: "view", id: 1029, role: "Employee" }),
    /not found/,
  );
  const employee = await terminalAction(store, {
    action: "view",
    id: 1024,
    role: "Employee",
  });
  assert.ok(employee.notes.every((note) => !note.internal));
  const technician = await terminalAction(store, {
    action: "view",
    id: 1024,
    role: "Technician",
  });
  assert.ok(technician.notes.some((note) => note.internal));
});

test("invalid terminal reports and priorities do not mutate the store", async (t) => {
  const store = await fixture(t);
  for (const patch of [
    { title: "bad" },
    { impact: 8 },
    { service: "Unknown service" },
    { description: "" },
  ]) {
    await assert.rejects(store.create({ ...report, ...patch }, "Employee"));
  }
  await assert.rejects(
    terminalAction(store, { action: "list", priority: "P9" }),
  );
  assert.equal(store.snapshot().data.incidents.length, 8);
});

test("interactive report requires explicit confirmation, supports back, and optional improvement", async (t) => {
  const store = await fixture(t);
  const session = new TerminalSession((input) => terminalAction(store, input));
  for (const line of [
    "report",
    report.title,
    "1",
    "3",
    "back",
    "2",
    "3",
    report.description,
    "",
  ]) {
    await session.send(line);
  }
  assert.equal(session.report.impact, 2);
  assert.equal(session.report.proposal, "");
  assert.equal(store.snapshot().data.incidents.length, 8);
  assert.match(session.entries.at(-1).text, /REVIEW BEFORE SUBMISSION/);
  await session.send("submit");
  assert.equal(store.snapshot().data.incidents.length, 9);
  assert.equal(session.report, null);
});

test("cancel and invalid wizard inputs never submit, and list filters reach the API", async (t) => {
  const store = await fixture(t);
  const session = new TerminalSession((input) => terminalAction(store, input));
  await session.send("report");
  await session.send("bad");
  assert.equal(session.step, 0);
  assert.equal(session.entries.at(-1).kind, "error");
  await session.send("cancel");
  await session.send("incidentdesk list --mine --priority P1");
  assert.match(session.entries.at(-1).text, /INC-1024/);
  assert.doesNotMatch(session.entries.at(-1).text, /INC-1025/);
  await session.send("rm -rf anything");
  assert.match(session.entries.at(-1).text, /not a system shell/);
  assert.equal(store.snapshot().data.incidents.length, 8);
});

test("terminal control characters are stripped without losing normal line breaks", () => {
  assert.equal(safeText("hello\u001b[31m\u0000\nworld"), "hello[31m\nworld");
});
