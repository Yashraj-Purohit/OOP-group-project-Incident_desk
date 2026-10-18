import { AppError, AuthorizationError, NotFoundError } from "../errors.js";
import { integer } from "../util.js";

// Declarative route table. `public: true` skips authentication; otherwise the
// handler receives the authenticated User and each service enforces permissions.
export function buildRoutes(c) {
  const { auth, incidents, reports, admin, repos, clock } = c;
  const id = (p) => integer(p.id, "id", { min: 1 });
  const none = () => ({ ok: true });

  return [
    // ---- health & auth ---------------------------------------------------
    { method: "GET", path: "/api/health", public: true, handler: () => ({ status: "ok", time: clock.now() }) },
    { method: "POST", path: "/api/auth/register", public: true, status: 201, handler: ({ body }) => auth.register(body).toJSON() },
    {
      method: "POST", path: "/api/auth/login", public: true,
      handler: ({ body }) => {
        const { token, user, expiresAt } = auth.login(body?.email, body?.password);
        return { token, expiresAt, user: user.toJSON() };
      },
    },
    { method: "POST", path: "/api/auth/logout", handler: ({ token }) => { auth.logout(token); return none(); } },
    { method: "GET", path: "/api/auth/me", handler: ({ user }) => user.toJSON() },
    { method: "POST", path: "/api/auth/password", handler: ({ user, body }) => { auth.changePassword(user, body?.current, body?.next); return none(); } },

    // ---- reference data (any signed-in user) --------------------------------
    { method: "GET", path: "/api/services", handler: ({ user }) => admin.listServices(user) },
    { method: "GET", path: "/api/categories", handler: ({ user }) => admin.listCategories(user) },
    { method: "GET", path: "/api/sla-policies", handler: ({ user }) => admin.listSlaPolicies(user) },
    { method: "GET", path: "/api/knowledge", handler: ({ user }) => incidents.knowledge(user) },
    { method: "GET", path: "/api/technicians", handler: ({ user }) => admin.listTechnicians(user) },

    // ---- incidents --------------------------------------------------------------
    { method: "POST", path: "/api/incidents/preview", handler: ({ user, body }) => incidents.preview(user, body) },
    { method: "POST", path: "/api/incidents", status: 201, handler: ({ user, body }) => incidents.create(user, body) },
    { method: "GET", path: "/api/incidents", handler: ({ user, query }) => incidents.list(user, query) },
    { method: "GET", path: "/api/incidents/:id", handler: ({ user, params }) => incidents.get(user, params.id) },
    { method: "PATCH", path: "/api/incidents/:id", handler: ({ user, params, body }) => incidents.update(user, params.id, body) },
    { method: "GET", path: "/api/incidents/:id/history", handler: ({ user, params }) => incidents.history(user, params.id) },
    { method: "GET", path: "/api/incidents/:id/recommendations", handler: ({ user, params }) => incidents.recommendations(user, params.id) },
    { method: "POST", path: "/api/incidents/:id/category", handler: ({ user, params, body }) => incidents.setCategory(user, params.id, body) },
    { method: "POST", path: "/api/incidents/:id/assign", handler: ({ user, params, body }) => incidents.assign(user, params.id, body) },
    { method: "POST", path: "/api/incidents/:id/acknowledge", handler: ({ user, params }) => incidents.acknowledge(user, params.id) },
    { method: "POST", path: "/api/incidents/:id/start", handler: ({ user, params }) => incidents.startInvestigation(user, params.id) },
    { method: "POST", path: "/api/incidents/:id/notes", status: 201, handler: ({ user, params, body }) => incidents.addNote(user, params.id, body) },
    { method: "POST", path: "/api/incidents/:id/request-info", handler: ({ user, params, body }) => incidents.requestInfo(user, params.id, body) },
    { method: "POST", path: "/api/incidents/:id/respond", handler: ({ user, params, body }) => incidents.respond(user, params.id, body) },
    { method: "POST", path: "/api/incidents/:id/resolve", handler: ({ user, params, body }) => incidents.resolve(user, params.id, body) },
    { method: "POST", path: "/api/incidents/:id/verify", handler: ({ user, params }) => incidents.verify(user, params.id) },
    { method: "POST", path: "/api/incidents/:id/reopen", handler: ({ user, params, body }) => incidents.reopen(user, params.id, body) },
    { method: "POST", path: "/api/incidents/:id/close", handler: ({ user, params }) => incidents.close(user, params.id) },
    { method: "POST", path: "/api/incidents/:id/proposal", handler: ({ user, params, body }) => incidents.reviewProposal(user, params.id, body) },
    { method: "POST", path: "/api/incidents/:id/feedback", handler: ({ user, params, body }) => incidents.feedback(user, params.id, body) },

    // ---- notifications ----------------------------------------------------------
    {
      method: "GET", path: "/api/notifications",
      handler: ({ user, query }) => {
        user.require("notification:view");
        return {
          unread: repos.notifications.unreadCount(user.id),
          items: repos.notifications.forUser(user.id, { channel: query.channel === "email" ? "email" : "in-app", unreadOnly: query.unread === "true", limit: integer(query.limit, "limit", { min: 1, max: 200, fallback: 50 }) }),
        };
      },
    },
    { method: "POST", path: "/api/notifications/read-all", handler: ({ user }) => { repos.notifications.markAllRead(user.id); return none(); } },
    { method: "POST", path: "/api/notifications/:id/read", handler: ({ user, params }) => { repos.notifications.markRead(user.id, id(params)); return none(); } },
    {
      method: "GET", path: "/api/admin/email-outbox",
      handler: ({ user }) => { user.require("audit:view"); return repos.notifications.outbox(); },
    },

    // ---- reports ---------------------------------------------------------------------
    { method: "GET", path: "/api/reports/overview", handler: ({ user }) => reports.overview(user) },
    { method: "GET", path: "/api/reports/workload", handler: ({ user }) => reports.workload(user) },
    { method: "GET", path: "/api/reports/services", handler: ({ user }) => reports.byService(user) },
    { method: "GET", path: "/api/reports/categories", handler: ({ user }) => reports.byCategory(user) },
    { method: "GET", path: "/api/reports/trend", handler: ({ user, query }) => reports.trend(user, integer(query.days, "days", { min: 1, max: 90, fallback: 7 })) },
    { method: "GET", path: "/api/reports/correlations", handler: ({ user }) => reports.correlations(user) },
    { method: "GET", path: "/api/reports/sla-risk", handler: ({ user }) => reports.slaRisk(user) },
    { method: "GET", path: "/api/reports/sla-violations", handler: ({ user }) => reports.violations(user) },

    // ---- administration -----------------------------------------------------------------
    { method: "GET", path: "/api/admin/users", handler: ({ user, query }) => admin.listUsers(user, query) },
    { method: "POST", path: "/api/admin/users", status: 201, handler: ({ user, body }) => admin.createUser(user, body) },
    { method: "PATCH", path: "/api/admin/users/:id", handler: ({ user, params, body }) => admin.updateUser(user, id(params), body) },
    { method: "POST", path: "/api/admin/users/:id/password", handler: ({ user, params, body }) => { admin.resetPassword(user, id(params), body); return none(); } },
    { method: "POST", path: "/api/admin/services", status: 201, handler: ({ user, body }) => admin.createService(user, body) },
    { method: "PATCH", path: "/api/admin/services/:id", handler: ({ user, params, body }) => admin.updateService(user, id(params), body) },
    { method: "POST", path: "/api/admin/categories", status: 201, handler: ({ user, body }) => admin.saveCategory(user, body) },
    { method: "DELETE", path: "/api/admin/categories/:id", handler: ({ user, params }) => { admin.removeCategory(user, params.id); return none(); } },
    { method: "POST", path: "/api/admin/sla-policies", status: 201, handler: ({ user, body }) => admin.saveSlaPolicy(user, body) },
    { method: "DELETE", path: "/api/admin/sla-policies/:id", handler: ({ user, params }) => { admin.removeSlaPolicy(user, id(params)); return none(); } },
    { method: "GET", path: "/api/admin/settings", handler: ({ user }) => admin.getSettings(user) },
    { method: "PATCH", path: "/api/admin/settings", handler: ({ user, body }) => admin.updateSettings(user, body) },
    { method: "GET", path: "/api/admin/audit", handler: ({ user, query }) => admin.auditLog(user, query) },
    {
      // Demo/testing aid: moves the shared clock forward and runs the monitor.
      method: "POST", path: "/api/admin/simulate-time",
      handler: ({ user, body }) => {
        user.require("settings:manage");
        if (!c.allowClockControl) throw new AuthorizationError("Clock control is disabled on this server.");
        const minutes = integer(body?.minutes, "minutes", { min: 1, max: 10080 });
        clock.advance(minutes);
        return { now: clock.now(), monitor: c.slaMonitor.tick() };
      },
    },
    {
      method: "POST", path: "/api/admin/run-sla-monitor",
      handler: ({ user }) => { user.require("settings:manage"); return c.slaMonitor.tick(); },
    },
  ];
}

// Compile "/api/incidents/:id/notes" into a matcher.
export function compile(routes) {
  return routes.map((route) => {
    const keys = [];
    const pattern = new RegExp(`^${route.path.replace(/:([a-z]+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`);
    return { ...route, keys, pattern };
  });
}

export function match(compiled, method, pathname) {
  let pathMatched = false;
  for (const route of compiled) {
    const m = pathname.match(route.pattern);
    if (!m) continue;
    pathMatched = true;
    if (route.method !== method) continue;
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    return { route, params };
  }
  if (pathMatched) throw new AppError("Method not allowed for this route.", { status: 405, code: "METHOD_NOT_ALLOWED" });
  throw new NotFoundError("Unknown API route.");
}
