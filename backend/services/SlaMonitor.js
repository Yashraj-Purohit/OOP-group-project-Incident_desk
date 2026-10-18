import { EventType } from "../events.js";
import { EscalationPolicy } from "../intelligence/analyzers.js";
import { displayId } from "../util.js";

// Continuous SLA monitoring: warnings before deadlines, recorded violations and
// automatic escalation of critical incidents nobody has acknowledged.
export class SlaMonitor {
  #timer = null;

  constructor({ db, incidents, users, slaEvents, tracker, escalation, bus, clock, log }) {
    Object.assign(this, { db, incidents, users, slaEvents, tracker, escalation, bus, clock, log });
  }

  // Records warnings/violations for one incident. Events are raised on the
  // aggregate; the caller publishes them with the rest of its changes.
  inspect(incident, now) {
    const sla = this.tracker.evaluate(incident, now);
    const id = incident.id;
    if (id === undefined) return sla;
    const label = displayId(id);
    if (sla.responseBreached && this.slaEvents.record(id, "response_violation", now)) {
      incident.raiseSla(EventType.SLA_VIOLATED, now, `${label} breached its response SLA`, { kind: "response" });
    } else if (sla.responseAtRisk && !sla.responseBreached && this.slaEvents.record(id, "response_warning", now)) {
      incident.raiseSla(EventType.SLA_WARNING, now, `${label} is close to its response deadline`, { kind: "response" });
    }
    if (sla.resolutionBreached && this.slaEvents.record(id, "resolution_violation", now)) {
      incident.raiseSla(EventType.SLA_VIOLATED, now, `${label} breached its resolution SLA`, { kind: "resolution" });
    } else if (sla.resolutionAtRisk && !sla.resolutionBreached && this.slaEvents.record(id, "resolution_warning", now)) {
      incident.raiseSla(EventType.SLA_WARNING, now, `${label} is close to its resolution deadline`, { kind: "resolution" });
    }
    return sla;
  }

  tick() {
    const now = this.clock.now();
    const summary = { checked: 0, warnings: 0, violations: 0, escalations: 0 };
    for (const { incident } of this.incidents.search({ activeOnly: true })) {
      this.db.transaction(() => {
        summary.checked += 1;
        this.inspect(incident, now);
        const level = this.escalation.levelFor(incident, now);
        if (level > incident.escalationLevel) {
          const target = this.users.byTitle(EscalationPolicy.LADDER[level]) ?? this.users.administrators()[0];
          if (target) incident.escalate(level, target, now);
        }
        const events = incident.pullEvents();
        for (const e of events) {
          if (e.type === EventType.SLA_WARNING) summary.warnings += 1;
          if (e.type === EventType.SLA_VIOLATED) summary.violations += 1;
          if (e.type === EventType.INCIDENT_ESCALATED) summary.escalations += 1;
        }
        if (events.some((e) => e.type === EventType.INCIDENT_ESCALATED)) this.incidents.save(incident);
        this.bus.publishAll(events);
      });
    }
    return summary;
  }

  start(intervalMs = 30000) {
    this.stop();
    this.#timer = setInterval(() => {
      try { this.tick(); } catch (error) { this.log?.(`SLA monitor error: ${error.message}`); }
    }, intervalMs);
    this.#timer.unref?.();
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}
