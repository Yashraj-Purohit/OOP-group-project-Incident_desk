import { IncidentStates } from "../domain/states.js";
import { displayId } from "../util.js";

const count = (items, keyFn) => {
  const map = new Map();
  for (const item of items) map.set(keyFn(item), (map.get(keyFn(item)) ?? 0) + 1);
  return map;
};
const avg = (nums) => (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null);

// Read-only dashboards and analytics. Data volumes in the prototype are small,
// so aggregation happens in memory; swap for SQL aggregates if volume grows.
export class ReportService {
  constructor({ incidents, users, services, categories, slaEvents, tracker, riskDetector, correlator, clock }) {
    Object.assign(this, { incidents, users, services, categories, slaEvents, tracker, riskDetector, correlator, clock });
  }

  #all() {
    return this.incidents.search({}).map((r) => ({ ...r, incident: r.incident }));
  }

  overview(actor) {
    actor.require("report:view");
    const rows = this.#all().map((r) => r.incident);
    const violated = this.slaEvents.violatedIncidentIds();
    const done = rows.filter((i) => i.resolvedAt);
    const rated = rows.filter((i) => i.feedbackRating);
    const finished = rows.filter((i) => !i.active);
    const met = finished.filter((i) => !violated.has(i.id)).length;
    return {
      total: rows.length,
      open: rows.filter((i) => i.active).length,
      critical: rows.filter((i) => i.active && i.priority === "P1").length,
      resolved: rows.filter((i) => !i.active).length,
      closed: rows.filter((i) => i.status === "Closed").length,
      unassigned: rows.filter((i) => i.active && !i.technicianId).length,
      awaitingInfo: rows.filter((i) => i.awaitingInfo).length,
      slaViolations: violated.size,
      slaCompliancePercent: finished.length ? Math.round((met / finished.length) * 100) : null,
      meanTimeToResolveMinutes: avg(done.map((i) => (i.resolvedAt - i.createdAt) / 60000)),
      meanTimeToAcknowledgeMinutes: avg(rows.filter((i) => i.acknowledgedAt).map((i) => (i.acknowledgedAt - i.createdAt) / 60000)),
      averageRating: avg(rated.map((i) => i.feedbackRating)),
      byStatus: Object.fromEntries(IncidentStates.names.map((s) => [s, rows.filter((i) => i.status === s).length])),
      byPriority: Object.fromEntries(["P1", "P2", "P3", "P4"].map((p) => [p, rows.filter((i) => i.priority === p).length])),
    };
  }

  workload(actor) {
    if (!actor.can("workload:view-all")) actor.require("workload:view-own");
    const loads = this.incidents.loads();
    const rows = this.#all().filter((r) => r.incident.active);
    return this.users.technicians({ activeOnly: false })
      .filter((t) => actor.can("workload:view-all") || t.id === actor.id)
      .map((t) => {
        const mine = rows.filter((r) => r.incident.technicianId === t.id);
        const active = loads.get(t.id) ?? 0;
        return {
          id: t.id, name: t.name, title: t.title, skills: t.skills, active: t.active, available: t.available,
          activeIncidents: active, capacity: t.maxWorkload,
          utilizationPercent: Math.round((active / t.maxWorkload) * 100),
          byPriority: Object.fromEntries(["P1", "P2", "P3", "P4"].map((p) => [p, mine.filter((r) => r.incident.priority === p).length])),
          incidents: mine.map((r) => ({ id: r.incident.id, title: r.incident.title, priority: r.incident.priority, status: r.incident.status })),
        };
      });
  }

  byService(actor) {
    actor.require("report:view");
    const rows = this.#all();
    return this.services.list().map((s) => {
      const mine = rows.filter((r) => r.incident.serviceId === s.id);
      return {
        id: s.id, service: s.name, category: s.category, criticality: s.criticality,
        total: mine.length, open: mine.filter((r) => r.incident.active).length,
        p1: mine.filter((r) => r.incident.priority === "P1").length,
      };
    }).sort((a, b) => b.total - a.total);
  }

  byCategory(actor) {
    actor.require("report:view");
    const counts = count(this.#all(), (r) => r.incident.category);
    return this.categories.list().map((c) => ({ category: c.name, total: counts.get(c.name) ?? 0 })).sort((a, b) => b.total - a.total);
  }

  trend(actor, days = 7) {
    actor.require("report:view");
    const rows = this.#all().map((r) => r.incident);
    const end = new Date(this.clock.now());
    end.setUTCHours(0, 0, 0, 0);
    return Array.from({ length: days }, (_, k) => {
      const start = end.getTime() - (days - 1 - k) * 86400000;
      const inDay = (t) => t !== null && t >= start && t < start + 86400000;
      return {
        date: new Date(start).toISOString().slice(0, 10),
        opened: rows.filter((i) => inDay(i.createdAt)).length,
        resolved: rows.filter((i) => inDay(i.resolvedAt)).length,
      };
    });
  }

  correlations(actor) {
    actor.require("report:view");
    const active = this.incidents.search({ activeOnly: true }).map(({ incident, serviceName }) => ({
      id: incident.id, title: incident.title, priority: incident.priority, serviceId: incident.serviceId, serviceName, createdAt: incident.createdAt,
    }));
    return this.correlator.correlate(active);
  }

  slaRisk(actor) {
    actor.require("report:view");
    const now = this.clock.now();
    const loads = this.incidents.loads();
    const techs = new Map(this.users.technicians({ activeOnly: false }).map((t) => [t.id, t]));
    return this.incidents.search({ activeOnly: true })
      .map(({ incident, serviceName }) => {
        const sla = this.tracker.evaluate(incident, now);
        const tech = techs.get(incident.technicianId);
        const risk = this.riskDetector.assess(incident, sla, loads.get(incident.technicianId) ?? 0, tech?.maxWorkload ?? 5, now);
        return { id: incident.id, displayId: displayId(incident.id), title: incident.title, priority: incident.priority, service: serviceName, status: incident.status, sla: sla.label, remainingMinutes: sla.remainingMinutes, ...risk };
      })
      .filter((r) => r.level !== "low")
      .sort((a, b) => b.score - a.score);
  }

  violations(actor) {
    actor.require("report:view");
    return this.slaEvents.violations();
  }
}
