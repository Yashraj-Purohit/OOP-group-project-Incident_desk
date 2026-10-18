import { NotificationError } from "../errors.js";
import { EventType } from "../events.js";
import { displayId } from "../util.js";

// ---- channels (Strategy + Factory + Adapter-style plug-ins) ----------------
// A channel delivers a prepared notification. Adding SMS/push later means
// writing one more subclass and registering it; nothing else changes.
export class NotificationChannel {
  get name() { throw new TypeError("Subclasses must define name."); }
  supports() { return true; }
  send() { throw new TypeError("Subclasses must implement send()."); }
}

export class InAppChannel extends NotificationChannel {
  constructor(repository) { super(); this.repository = repository; }
  get name() { return "in-app"; }
  send(notification) { this.repository.insert({ ...notification, channel: this.name }); }
}

// Simulated e-mail: stored in an outbox table (and optionally logged) instead
// of calling an SMTP server. Only important events are e-mailed.
const EMAIL_EVENTS = new Set([
  EventType.TECHNICIAN_ASSIGNED, EventType.INCIDENT_RESOLVED, EventType.INCIDENT_CLOSED,
  EventType.SLA_WARNING, EventType.SLA_VIOLATED, EventType.INCIDENT_ESCALATED, EventType.INFO_REQUESTED,
]);

export class EmailChannel extends NotificationChannel {
  constructor(repository, log = null) { super(); this.repository = repository; this.log = log; }
  get name() { return "email"; }
  supports(notification) { return EMAIL_EVENTS.has(notification.event) || notification.priority === "P1"; }
  send(notification) {
    this.repository.insert({ ...notification, channel: this.name });
    this.log?.(`[email -> ${notification.recipientEmail}] ${notification.subject}`);
  }
}

export class ChannelFactory {
  static create(name, deps) {
    switch (name) {
      case "in-app": return new InAppChannel(deps.notifications);
      case "email": return new EmailChannel(deps.notifications, deps.log);
      default: throw new NotificationError(`Unknown notification channel: ${name}`);
    }
  }
}

export class NotificationDispatcher {
  #channels = new Map();
  register(channel) { this.#channels.set(channel.name, channel); }
  get channelNames() { return [...this.#channels.keys()]; }
  dispatch(notification) {
    for (const channel of this.#channels.values()) {
      if (channel.supports(notification)) channel.send(notification);
    }
  }
}

// ---- observers ---------------------------------------------------------------
const SUBJECTS = {
  [EventType.INCIDENT_CREATED]: "Incident created",
  [EventType.PRIORITY_CHANGED]: "Priority changed",
  [EventType.TECHNICIAN_ASSIGNED]: "Technician assigned",
  [EventType.ASSIGNMENT_FAILED]: "Assignment needs attention",
  [EventType.INCIDENT_ACKNOWLEDGED]: "Incident acknowledged",
  [EventType.INCIDENT_RESOLVED]: "Incident resolved",
  [EventType.INCIDENT_VERIFIED]: "Resolution verified",
  [EventType.INCIDENT_REOPENED]: "Resolution rejected",
  [EventType.INCIDENT_CLOSED]: "Incident closed",
  [EventType.INFO_REQUESTED]: "More information needed",
  [EventType.INFO_PROVIDED]: "Information provided",
  [EventType.SLA_WARNING]: "SLA deadline approaching",
  [EventType.SLA_VIOLATED]: "SLA violated",
  [EventType.INCIDENT_ESCALATED]: "Incident escalated",
  [EventType.FEEDBACK_GIVEN]: "Feedback received",
  [EventType.PROPOSAL_REVIEWED]: "Improvement proposal reviewed",
};

// Subscribes to every domain event and notifies the relevant people.
export class NotificationObserver {
  constructor({ dispatcher, users, clock }) { Object.assign(this, { dispatcher, users, clock }); }

  handle(event) {
    const subject = SUBJECTS[event.type];
    if (!subject) return;
    const recipients = this.#recipients(event);
    for (const user of recipients) {
      this.dispatcher.dispatch({
        at: event.at,
        recipientId: user.id,
        recipientEmail: user.email,
        event: event.type,
        incidentId: event.incidentId,
        priority: event.priority,
        subject: `${displayId(event.incidentId)}: ${subject}`,
        message: event.description,
      });
    }
  }

  #recipients(event) {
    const ids = new Set();
    const admins = () => this.users.administrators().forEach((a) => ids.add(a.id));
    switch (event.type) {
      case EventType.INCIDENT_CREATED:
        ids.add(event.reporterId); admins(); break;
      case EventType.PRIORITY_CHANGED:
        ids.add(event.reporterId); if (event.technicianId) ids.add(event.technicianId); admins(); break;
      case EventType.TECHNICIAN_ASSIGNED:
        ids.add(event.reporterId); if (event.technicianId) ids.add(event.technicianId);
        if (event.payload.previousTechnicianId) ids.add(event.payload.previousTechnicianId); break;
      case EventType.ASSIGNMENT_FAILED:
        admins(); break;
      case EventType.INCIDENT_ACKNOWLEDGED:
      case EventType.INCIDENT_RESOLVED:
      case EventType.INCIDENT_CLOSED:
      case EventType.INCIDENT_VERIFIED:
      case EventType.INCIDENT_REOPENED:
        ids.add(event.reporterId); if (event.technicianId) ids.add(event.technicianId); break;
      case EventType.INFO_REQUESTED:
      case EventType.PROPOSAL_REVIEWED:
        ids.add(event.reporterId); break;
      case EventType.INFO_PROVIDED:
      case EventType.FEEDBACK_GIVEN:
        if (event.technicianId) ids.add(event.technicianId); break;
      case EventType.SLA_WARNING:
      case EventType.SLA_VIOLATED:
        if (event.technicianId) ids.add(event.technicianId); admins(); break;
      case EventType.INCIDENT_ESCALATED:
        if (event.payload.targetId) ids.add(event.payload.targetId); admins(); break;
      default: break;
    }
    // Do not notify people about their own action.
    if (!event.system) ids.delete(event.actorId);
    return [...ids].map((id) => this.users.findById(id)).filter((u) => u?.active);
  }
}

// Writes every event to the audit trail.
export class AuditObserver {
  constructor({ audit, users }) { Object.assign(this, { audit, users }); }
  handle(event) {
    const user = event.system ? null : this.users.findById(event.actorId);
    this.audit.record({
      at: event.at,
      userId: event.system ? null : event.actorId,
      userName: event.system ? "System" : (user?.name ?? `User ${event.actorId}`),
      action: event.type,
      incidentId: event.incidentId,
      previousState: event.from,
      newState: event.to,
      description: event.description,
    });
  }
}
