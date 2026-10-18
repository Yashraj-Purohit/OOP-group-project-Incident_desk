// Observer pattern: domain objects raise events; observers (audit, notifications)
// react without the domain knowing about them.
export const EventType = Object.freeze({
  INCIDENT_CREATED: "INCIDENT_CREATED",
  INCIDENT_CLASSIFIED: "INCIDENT_CLASSIFIED",
  PRIORITY_CHANGED: "PRIORITY_CHANGED",
  TECHNICIAN_ASSIGNED: "TECHNICIAN_ASSIGNED",
  ASSIGNMENT_FAILED: "ASSIGNMENT_FAILED",
  INCIDENT_ACKNOWLEDGED: "INCIDENT_ACKNOWLEDGED",
  INVESTIGATION_STARTED: "INVESTIGATION_STARTED",
  INCIDENT_RESOLVED: "INCIDENT_RESOLVED",
  INCIDENT_VERIFIED: "INCIDENT_VERIFIED",
  INCIDENT_REOPENED: "INCIDENT_REOPENED",
  INCIDENT_CLOSED: "INCIDENT_CLOSED",
  NOTE_ADDED: "NOTE_ADDED",
  INFO_REQUESTED: "INFO_REQUESTED",
  INFO_PROVIDED: "INFO_PROVIDED",
  DETAILS_UPDATED: "DETAILS_UPDATED",
  FEEDBACK_GIVEN: "FEEDBACK_GIVEN",
  PROPOSAL_SUBMITTED: "PROPOSAL_SUBMITTED",
  PROPOSAL_REVIEWED: "PROPOSAL_REVIEWED",
  DUPLICATE_FLAGGED: "DUPLICATE_FLAGGED",
  SLA_WARNING: "SLA_WARNING",
  SLA_VIOLATED: "SLA_VIOLATED",
  INCIDENT_ESCALATED: "INCIDENT_ESCALATED",
});

export class EventBus {
  #handlers = new Map();

  subscribe(type, handler) {
    const key = type ?? "*";
    if (!this.#handlers.has(key)) this.#handlers.set(key, []);
    this.#handlers.get(key).push(handler);
    return () => {
      const list = this.#handlers.get(key);
      list.splice(list.indexOf(handler), 1);
    };
  }

  // Handlers run synchronously, in subscription order, so that audit rows and
  // notifications are written in the same transaction as the change itself.
  publish(event) {
    for (const handler of [...(this.#handlers.get(event.type) ?? []), ...(this.#handlers.get("*") ?? [])]) {
      handler(event);
    }
  }

  publishAll(events) {
    for (const event of events) this.publish(event);
  }
}
