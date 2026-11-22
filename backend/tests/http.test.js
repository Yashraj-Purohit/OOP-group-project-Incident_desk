import assert from "node:assert/strict";
import test from "node:test";
import { createApiServer } from "../http/server.js";
import { makeApp, PASSWORD } from "./helpers.js";

async function boot() {
  const app = makeApp();
  const server = createApiServer(app.container);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token, body, headers = {}, raw } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { ...(body || raw ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    return { status: response.status, body: await response.json() };
  };
  const login = async (name) => (await call("POST", "/api/auth/login", { body: { email: `${name}@incidentdesk.test`, password: PASSWORD } })).body.token;
  return { app, server, call, login, close: () => server.close() };
}

test("HTTP: authentication is required and errors use stable codes", async () => {
  const h = await boot();
  try {
    assert.equal((await h.call("GET", "/api/health")).status, 200);
    const noToken = await h.call("GET", "/api/incidents");
    assert.equal(noToken.status, 401);
    assert.equal(noToken.body.code, "AUTHENTICATION_FAILED");
    assert.equal((await h.call("GET", "/api/incidents", { token: "x".repeat(40) })).status, 401);
    const bad = await h.call("POST", "/api/auth/login", { body: { email: "jordan@incidentdesk.test", password: "nope-nope-1" } });
    assert.equal(bad.status, 401);
    assert.equal((await h.call("POST", "/api/auth/login", { raw: "{not json" })).status, 400);
    assert.equal((await h.call("GET", "/api/nothing")).status, 404);
    assert.equal((await h.call("DELETE", "/api/incidents")).status, 405);
    assert.equal((await h.call("GET", "/api/health", { headers: { Origin: "http://evil.example" } })).status, 403);
  } finally { h.close(); }
});

test("HTTP: report → assign → resolve workflow with role-based authorization", async () => {
  const h = await boot();
  try {
    const jordan = await h.login("jordan");
    const admin = await h.login("admin");
    const maya = await h.login("maya");
    const me = await h.call("GET", "/api/auth/me", { token: jordan });
    assert.equal(me.body.role, "Employee");
    assert.equal(JSON.stringify(me.body).includes("password"), false);

    const payload = h.app.report();
    const preview = await h.call("POST", "/api/incidents/preview", { token: jordan, body: payload });
    assert.equal(preview.body.priority, "P1");
    assert.ok(preview.body.recommendedTechnician);

    const created = await h.call("POST", "/api/incidents", { token: jordan, body: payload });
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.deepEqual(created.body.actions.sort(), ["edit", "respond"]);

    assert.equal((await h.call("GET", `/api/incidents/${id}`, { token: maya })).status, 404);
    assert.equal((await h.call("POST", `/api/incidents/${id}/assign`, { token: jordan, body: {} })).status, 403);
    assert.equal((await h.call("GET", "/api/admin/users", { token: jordan })).status, 403);
    assert.equal((await h.call("GET", "/api/reports/overview", { token: jordan })).status, 403);
    assert.equal((await h.call("POST", `/api/incidents/${id}/close`, { token: admin })).status, 409);

    const assignedTo = created.body.technician.id;
    const techEmail = h.app.container.repos.users.findById(assignedTo).email.split("@")[0];
    const tech = await h.login(techEmail);
    assert.equal((await h.call("POST", `/api/incidents/${id}/acknowledge`, { token: tech })).body.status, "Acknowledged");
    assert.equal((await h.call("POST", `/api/incidents/${id}/start`, { token: tech })).body.status, "In progress");
    assert.equal((await h.call("POST", `/api/incidents/${id}/resolve`, { token: tech, body: { resolution: "x" } })).status, 400);
    const resolved = await h.call("POST", `/api/incidents/${id}/resolve`, { token: tech, body: { resolution: "Restarted the payment worker pool." } });
    assert.equal(resolved.body.status, "Resolved");
    assert.deepEqual(resolved.body.actions.sort(), []);
    assert.equal((await h.call("POST", `/api/incidents/${id}/verify`, { token: jordan })).body.status, "Verified");

    const list = await h.call("GET", "/api/incidents?priority=P1&state=open", { token: admin });
    assert.equal(list.status, 200);
    const notifications = await h.call("GET", "/api/notifications", { token: jordan });
    assert.ok(notifications.body.unread > 0);
    const history = await h.call("GET", `/api/incidents/${id}/history`, { token: admin });
    assert.ok(history.body.length >= 6);
    const audit = await h.call("GET", `/api/admin/audit?incident=${id}`, { token: admin });
    assert.equal(audit.status, 200);
    assert.equal((await h.call("POST", "/api/auth/logout", { token: jordan })).status, 200);
    assert.equal((await h.call("GET", "/api/auth/me", { token: jordan })).status, 401);
  } finally { h.close(); }
});

test("HTTP: self-registration only creates employees and enforces password rules", async () => {
  const h = await boot();
  try {
    const weak = await h.call("POST", "/api/auth/register", { body: { name: "Sneaky", email: "s@incidentdesk.test", password: "weak" } });
    assert.equal(weak.status, 400);
    const created = await h.call("POST", "/api/auth/register", { body: { name: "Sneaky", email: "s@incidentdesk.test", password: "Strong123", role: "Administrator" } });
    assert.equal(created.status, 201);
    assert.equal(created.body.role, "Employee");
  } finally { h.close(); }
});

test("HTTP: oversized bodies are rejected", async () => {
  const h = await boot();
  try {
    const jordan = await h.login("jordan");
    const response = await fetch(`http://127.0.0.1:${h.server.address().port}/api/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jordan}` },
      body: JSON.stringify({ title: "x".repeat(200000) }),
    }).catch(() => null);
    assert.ok(response === null || response.status === 413);
  } finally { h.close(); }
});

test("HTTP: the sign-in screen can list the demo accounts, and the hint can be switched off", async () => {
  const h = await boot();
  const previous = process.env.INCIDENT_DESK_SHOW_DEMO;
  try {
    const on = await h.call("GET", "/api/auth/demo");
    assert.equal(on.status, 200, "public: no sign-in needed");
    assert.equal(on.body.enabled, true);
    assert.equal(on.body.accounts.length, 8);
    assert.ok(on.body.accounts.every((a) => a.email.endsWith("@incidentdesk.test") && !("hash" in a) && !("password" in a)));
    const jordan = on.body.accounts.find((a) => a.email.startsWith("jordan"));
    const login = await h.call("POST", "/api/auth/login", { body: { email: jordan.email, password: on.body.password } });
    assert.equal(login.status, 200, "the advertised password really signs in");
    process.env.INCIDENT_DESK_SHOW_DEMO = "0";
    assert.deepEqual((await h.call("GET", "/api/auth/demo")).body, { enabled: false });
  } finally {
    if (previous === undefined) delete process.env.INCIDENT_DESK_SHOW_DEMO;
    else process.env.INCIDENT_DESK_SHOW_DEMO = previous;
    h.close();
  }
});
