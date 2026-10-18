import assert from "node:assert/strict";
import test from "node:test";
import { createApiServer } from "../backend/http/server.js";
import { makeApp, PASSWORD } from "../backend/tests/helpers.js";
import { createTerminalApi } from "../terminal-client.js";
import { TerminalSession, getCommandReference, getHelp, safeText } from "../terminal-session.js";

async function boot() {
  const app = makeApp();
  const server = createApiServer(app.container);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const signIn = async (name) => {
    let token = null;
    const request = async (method, path, body) => {
      const response = await fetch(base + path, {
        method,
        headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json();
      if (!response.ok) throw Error(payload.error);
      return payload;
    };
    const login = await request("POST", "/api/auth/login", { email: `${name}@incidentdesk.test`, password: PASSWORD });
    token = login.token;
    return { request, user: login.user, session: new TerminalSession(createTerminalApi(request, login.user), login.user) };
  };
  return { app, signIn, close: () => server.close() };
}

const text = (session) => session.entries.map((e) => e.text).join("\n");

test("terminal report flow requires explicit submit, supports back/edit, and creates a real incident", async () => {
  const h = await boot();
  try {
    const { session, request } = await h.signIn("jordan");
    for (const line of ["report", "Payment portal unavailable from terminal", "99", "5", "3", "back", "3", "3", "Several departments cannot complete a payment through the portal.", "Show an outage banner before payment."]) {
      await session.send(line);
    }
    assert.match(text(session), /Choose a service number/, "unknown service number is rejected, not silently accepted");
    assert.equal(session.context, "review");
    assert.match(text(session), /REVIEW BEFORE SUBMISSION/);
    assert.match(text(session), /Calculated priority: P1/);
    assert.equal((await request("GET", "/api/incidents")).total, 0, "preview creates nothing");
    await session.send("maybe");
    assert.match(text(session), /Type submit/);
    await session.send("submit");
    assert.match(text(session), /Created INC-\d+ · P1/);
    const list = await request("GET", "/api/incidents");
    assert.equal(list.total, 1);
    assert.equal(list.items[0].proposal.status, "Proposed");
  } finally { h.close(); }
});

test("terminal accepts any listed service number (more than five services)", async () => {
  const h = await boot();
  try {
    const { session } = await h.signIn("jordan");
    await session.send("report");
    await session.send("A title that is long enough");
    await session.send("6");
    assert.equal(session.report.service, session.serviceList[5].name);
  } finally { h.close(); }
});

test("terminal list/view respect the signed-in user's visibility and hide internal notes", async () => {
  const h = await boot();
  try {
    const { app } = h;
    const incidents = app.container.incidents;
    const mine = incidents.create(app.jordan, app.report());
    incidents.create(app.maya, app.report({ title: "Laptop screen flickers badly", description: "It flickers after waking up.", serviceId: app.service("Office workstation"), impact: 1, urgency: 1 }));
    const tech = app.container.repos.users.findById(mine.technician.id);
    incidents.addNote(tech, mine.id, { text: "Support-only theory", internal: true });
    incidents.addNote(tech, mine.id, { text: "Looking into the gateway", internal: false });

    const jordan = await h.signIn("jordan");
    await jordan.session.send("list");
    assert.match(text(jordan.session), new RegExp(`INC-${mine.id}`));
    assert.doesNotMatch(text(jordan.session), /Laptop screen/);
    await jordan.session.send(`view INC-${mine.id}`);
    assert.match(text(jordan.session), /Looking into the gateway/);
    assert.doesNotMatch(text(jordan.session), /Support-only theory/);

    const techSession = await h.signIn(tech.email.split("@")[0]);
    await techSession.session.send(`view ${mine.id}`);
    assert.match(text(techSession.session), /Support-only theory/);

    const maya = await h.signIn("maya");
    await maya.session.send(`view INC-${mine.id}`);
    assert.match(text(maya.session), /not found/i);
  } finally { h.close(); }
});

test("terminal filters, whoami, errors and non-shell behaviour", async () => {
  const h = await boot();
  try {
    const { app } = h;
    app.container.incidents.create(app.jordan, app.report());
    const admin = await h.signIn("admin");
    await admin.session.send("whoami");
    assert.match(text(admin.session), /Sam Rivera · Administrator/);
    await admin.session.send("list --priority P4");
    assert.match(text(admin.session), /No incidents match/);
    await admin.session.send("list --priority P9");
    assert.match(text(admin.session), /Use --priority/);
    await admin.session.send("list --mine");
    assert.match(text(admin.session), /No incidents match/, "admin reported nothing");
    await admin.session.send("rm -rf /");
    assert.match(text(admin.session), /not a system shell/);
    await admin.session.send("role admin");
    assert.match(text(admin.session), /Unknown command/, "demo role switching no longer exists");
    await admin.session.send("clear");
    assert.equal(admin.session.entries.filter((e) => e.kind !== "input").length, 0);
  } finally { h.close(); }
});

test("an expired or missing session surfaces as a readable terminal error", async () => {
  const h = await boot();
  try {
    const { session } = await h.signIn("jordan");
    h.app.clock.advance(60 * 12);
    await session.send("list");
    assert.match(text(session), /expired|Sign in/i);
  } finally { h.close(); }
});

test("command references are role specific and contain no role switching", () => {
  for (const role of ["Employee", "Technician", "Administrator"]) {
    const reference = getCommandReference(role);
    assert.equal(reference.title, `${role} commands`);
    const syntaxes = reference.sections.flatMap((s) => s.commands.map((c) => c.syntax));
    assert.ok(syntaxes.includes("report") && syntaxes.includes("whoami"));
    assert.ok(!syntaxes.some((s) => s.startsWith("role ")));
    assert.doesNotMatch(getHelp(role), /demo identit/i);
  }
  assert.throws(() => getCommandReference("Nobody"), /Unknown/);
  assert.equal(safeText("a\u0007b\u001bc"), "abc");
});
