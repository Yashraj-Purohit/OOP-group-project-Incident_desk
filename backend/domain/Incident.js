import { AuthorizationError, ValidationError } from "../errors.js";
import { EventType } from "../events.js";
import { text } from "../util.js";
import { Role } from "./roles.js";
import { IncidentStates } from "./states.js";

// Aggregate root for the incident lifecycle. All state is private; every change
// goes through a method that validates the actor, applies the State rules and
// records a domain event for the audit trail and notifications.
export class Incident {
  #p;
  #state;
  #events = [];
  #notes = [];

  constructor(props) {
    this.#p = { escalationLevel: 0, awaitingInfo: false, affectedUsers: 1, ...props };
    this.#state = IncidentStates.of(this.#p.status);
  }

  static create({ title, description, reporterId, serviceId, category, impact, urgency, affectedUsers, criticality, score, priority, responseDue, resolutionDue, proposal }, at) {
    const incident = new Incident({
      title, description, reporterId, serviceId, category, impact, urgency, affectedUsers, criticality,
      score, priority, status: "New", technicianId: null, createdAt: at, updatedAt: at,
      responseDue, resolutionDue,
      proposalText: proposal ?? null, proposalStatus: proposal ? "Proposed" : null,
    });
    incident.#raise(EventType.INCIDENT_CREATED, { id: reporterId, isSystem: false }, at, {
      to: "New",
      description: `Incident created: ${title}`,
      payload: { priority, serviceId },
    });
    if (proposal) {
      incident.#raise(EventType.PROPOSAL_SUBMITTED, { id: reporterId, isSystem: false }, at, { description: "Improvement proposal submitted" });
    }
    return incident;
  }

  static restore(record) {
    return new Incident(record);
  }

  // ---- read access ------------------------------------------------------
  get id() { return this.#p.id; }
  get title() { return this.#p.title; }
  get description() { return this.#p.description; }
  get reporterId() { return this.#p.reporterId; }
  get serviceId() { return this.#p.serviceId; }
  get category() { return this.#p.category; }
  get impact() { return this.#p.impact; }
  get urgency() { return this.#p.urgency; }
  get affectedUsers() { return this.#p.affectedUsers; }
  get criticality() { return this.#p.criticality; }
  get score() { return this.#p.score; }
  get priority() { return this.#p.priority; }
  get status() { return this.#p.status; }
  get state() { return this.#state; }
  get active() { return this.#state.active; }
  get technicianId() { return this.#p.technicianId; }
  get createdAt() { return this.#p.createdAt; }
  get acknowledgedAt() { return this.#p.acknowledgedAt ?? null; }
  get resolvedAt() { return this.#p.resolvedAt ?? null; }
  get closedAt() { return this.#p.closedAt ?? null; }
  get responseDue() { return this.#p.responseDue; }
  get resolutionDue() { return this.#p.resolutionDue; }
  get resolution() { return this.#p.resolution ?? null; }
  get escalationLevel() { return this.#p.escalationLevel; }
  get awaitingInfo() { return this.#p.awaitingInfo; }
  get feedbackRating() { return this.#p.feedbackRating ?? null; }
  get proposal() {
    if (!this.#p.proposalText) return null;
    return {
      text: this.#p.proposalText, status: this.#p.proposalStatus, reviewerId: this.#p.proposalReviewerId ?? null,
      note: this.#p.proposalNote ?? "", reviewedAt: this.#p.proposalReviewedAt ?? null,
    };
  }

  markPersisted(id) { this.#p.id = id; }

  toRecord() { return { ...this.#p }; }

  pullEvents() {
    const events = this.#events.map((e) => ({ ...e, incidentId: this.id }));
    this.#events = [];
    return events;
  }

  pullNotes() {
    const notes = this.#notes;
    this.#notes = [];
    return notes;
  }

  // ---- lifecycle --------------------------------------------------------
  classify(category, at, actor) {
    this.#moveTo("Classified", actor, at, EventType.INCIDENT_CLASSIFIED, `Incident classified as ${category.toUpperCase()}`);
    this.#p.category = category;
  }

  setCategory(category, actor, at) {
    actor.require("incident:assign");
    const previous = this.#p.category;
    this.#p.category = category;
    this.#touch(at);
    this.#raise(EventType.INCIDENT_CLASSIFIED, actor, at, {
      description: `Category changed from ${previous} to ${category}`,
    });
  }

  assign(technician, actor, at) {
    if (technician.role !== Role.TECHNICIAN) {
      throw new ValidationError("Incidents can only be assigned to technicians.");
    }
    const previousId = this.#p.technicianId;
    if (this.status === "Classified") {
      this.#moveTo("Assigned", actor, at, EventType.TECHNICIAN_ASSIGNED, `Assigned to ${technician.name}`);
    } else if (["Assigned", "Acknowledged", "In progress"].includes(this.status)) {
      actor.require("incident:assign");
      const from = this.status;
      this.#p.status = "Assigned";
      this.#state = IncidentStates.of("Assigned");
      this.#p.acknowledgedAt = null;
      this.#raise(EventType.TECHNICIAN_ASSIGNED, actor, at, {
        from, to: "Assigned", description: `Reassigned to ${technician.name}`,
      });
    } else {
      this.#state.assertCanMoveTo("Assigned", actor);
    }
    this.#p.technicianId = technician.id;
    const event = this.#lastEvent();
    event.technicianId = technician.id;
    event.payload = { technicianId: technician.id, previousTechnicianId: previousId, technicianName: technician.name };
  }

  noteAssignmentFailed(reason, at) {
    this.#raise(EventType.ASSIGNMENT_FAILED, { id: 0, isSystem: true }, at, { description: `Automatic assignment failed: ${reason}` });
  }

  acknowledge(actor, at) {
    this.#guardTechnician(actor);
    this.#moveTo("Acknowledged", actor, at, EventType.INCIDENT_ACKNOWLEDGED, "Technician acknowledged incident");
    this.#p.acknowledgedAt = at;
  }

  startInvestigation(actor, at) {
    this.#guardTechnician(actor);
    this.#moveTo("In progress", actor, at, EventType.INVESTIGATION_STARTED, "Investigation started");
  }

  resolve(actor, at, resolution) {
    this.#guardTechnician(actor);
    const clean = text(resolution, "Resolution details", { min: 5, max: 5000 });
    this.#moveTo("Resolved", actor, at, EventType.INCIDENT_RESOLVED, "Resolution provided; incident marked RESOLVED");
    this.#p.resolution = clean;
    this.#p.resolvedAt = at;
    this.#p.awaitingInfo = false;
  }

  verify(actor, at) {
    this.#guardReporterOrAdmin(actor);
    this.#moveTo("Verified", actor, at, EventType.INCIDENT_VERIFIED, "Resolution verified by reporter");
  }

  reopen(actor, at, reason) {
    this.#guardReporterOrAdmin(actor);
    const clean = text(reason, "Reason", { min: 5, max: 1000 });
    this.#moveTo("In progress", actor, at, EventType.INCIDENT_REOPENED, `Resolution rejected: ${clean}`);
    this.#p.resolvedAt = null;
    this.#addNote(actor, at, clean, { kind: "reopen", internal: false });
  }

  close(actor, at) {
    if (actor.role === Role.TECHNICIAN) this.#guardTechnician(actor);
    this.#moveTo("Closed", actor, at, EventType.INCIDENT_CLOSED, "Incident closed");
    this.#p.closedAt = at;
  }

  // ---- collaboration ----------------------------------------------------
  addNote(actor, at, body, { internal = false } = {}) {
    this.#assertOpenForComments();
    if (actor.role === Role.EMPLOYEE) throw new AuthorizationError("Employees add information with the respond action.");
    if (actor.role === Role.TECHNICIAN) this.#guardTechnician(actor);
    const clean = text(body, "Note", { min: 2, max: 5000 });
    this.#addNote(actor, at, clean, { kind: "investigation", internal });
    this.#raise(EventType.NOTE_ADDED, actor, at, { description: internal ? "Internal investigation note added" : "Investigation note added" });
  }

  requestInfo(actor, at, question) {
    if (!["Assigned", "Acknowledged", "In progress"].includes(this.status)) {
      throw new ValidationError("Information can only be requested while the incident is being worked on.");
    }
    this.#guardTechnician(actor);
    const clean = text(question, "Question", { min: 5, max: 2000 });
    this.#p.awaitingInfo = true;
    this.#touch(at);
    this.#addNote(actor, at, clean, { kind: "info_request", internal: false });
    this.#raise(EventType.INFO_REQUESTED, actor, at, { description: "Technician requested additional information" });
  }

  provideInfo(actor, at, body) {
    this.#assertOpenForComments();
    this.#guardReporterOrAdmin(actor);
    const clean = text(body, "Information", { min: 2, max: 5000 });
    this.#p.awaitingInfo = false;
    this.#touch(at);
    this.#addNote(actor, at, clean, { kind: "reporter_info", internal: false });
    this.#raise(EventType.INFO_PROVIDED, actor, at, { description: "Reporter provided additional information" });
  }

  giveFeedback(actor, at, rating, comment) {
    if (actor.id !== this.reporterId) throw new AuthorizationError("Only the reporter can leave feedback.");
    if (!["Resolved", "Verified", "Closed"].includes(this.status)) {
      throw new ValidationError("Feedback is available once the incident is resolved.");
    }
    if (this.feedbackRating !== null) throw new ValidationError("Feedback was already submitted.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ValidationError("Rating must be between 1 and 5.");
    this.#p.feedbackRating = rating;
    this.#p.feedbackComment = text(comment, "Comment", { optional: true, max: 1000 }) ?? null;
    this.#touch(at);
    this.#raise(EventType.FEEDBACK_GIVEN, actor, at, { description: `Feedback submitted: ${rating}/5`, payload: { rating } });
  }

  updateDetails(actor, at, { title, description, affectedUsers }) {
    this.#assertOpenForComments();
    const admin = actor.can("incident:update-any");
    if (!admin) {
      if (actor.id !== this.reporterId || !actor.can("incident:update-own")) {
        throw new AuthorizationError("You cannot edit this incident.");
      }
      if (!["New", "Classified", "Assigned"].includes(this.status)) {
        throw new ValidationError("Details can only be edited before the technician acknowledges the incident.");
      }
    }
    if (title !== undefined) this.#p.title = text(title, "Title", { min: 5, max: 150 });
    if (description !== undefined) this.#p.description = text(description, "Description", { min: 10, max: 5000 });
    if (affectedUsers !== undefined) this.#p.affectedUsers = affectedUsers;
    this.#touch(at);
    this.#raise(EventType.DETAILS_UPDATED, actor, at, { description: "Incident details updated" });
  }

  // The assigned technician decides on the reporter's improvement idea,
  // separately from resolving the incident itself.
  reviewProposal(actor, at, decision, note) {
    const allowed = { Proposed: ["Accepted", "Declined"], Accepted: ["Implemented"] };
    if (!this.#p.proposalText) throw new ValidationError("This incident has no improvement proposal.");
    if (actor.role !== Role.TECHNICIAN || actor.id !== this.technicianId) {
      throw new AuthorizationError("Only the assigned technician can review this proposal.");
    }
    if (!allowed[this.#p.proposalStatus]?.includes(decision)) {
      throw new ValidationError(`A ${this.#p.proposalStatus.toLowerCase()} proposal cannot be marked ${String(decision).toLowerCase()}.`);
    }
    Object.assign(this.#p, {
      proposalStatus: decision, proposalReviewerId: actor.id, proposalReviewedAt: at,
      proposalNote: text(note, "Note", { optional: true, max: 2000 }) ?? "",
    });
    this.#touch(at);
    this.#raise(EventType.PROPOSAL_REVIEWED, actor, at, { description: `Improvement proposal ${decision.toLowerCase()}`, payload: { decision } });
  }

  // Applies a recalculated priority and SLA deadlines (called by the service).
  reprioritise({ impact, urgency, criticality, score, priority, responseDue, resolutionDue }, actor, at) {
    const previous = this.#p.priority;
    Object.assign(this.#p, { impact, urgency, criticality, score, priority, responseDue, resolutionDue });
    this.#touch(at);
    if (previous !== priority) {
      this.#raise(EventType.PRIORITY_CHANGED, actor, at, {
        description: `Priority changed from ${previous} to ${priority}`,
        payload: { from: previous, to: priority },
      });
    }
    return previous !== priority;
  }

  escalate(level, target, at) {
    this.#p.escalationLevel = level;
    this.#touch(at);
    this.#raise(EventType.INCIDENT_ESCALATED, { id: 0, isSystem: true }, at, {
      description: `Escalated to ${target.title ?? target.role} ${target.name} (level ${level})`,
      payload: { level, targetId: target.id, targetName: target.name, targetTitle: target.title },
    });
  }

  raiseSla(type, at, description, payload) {
    this.#raise(type, { id: 0, isSystem: true }, at, { description, payload });
  }

  flagDuplicate(matches, at) {
    this.#raise(EventType.DUPLICATE_FLAGGED, { id: this.reporterId, isSystem: false }, at, {
      description: `Possible duplicate of ${matches.map((m) => `INC-${m.id}`).join(", ")}`,
      payload: { matches: matches.map((m) => ({ id: m.id, score: m.score })) },
    });
  }

  // Actions the given actor may take right now (drives the UI buttons).
  availableActions(actor) {
    const actions = [];
    const s = this.status;
    const isTech = actor.role === Role.TECHNICIAN && actor.id === this.technicianId;
    const isReporter = actor.id === this.reporterId && actor.role === Role.EMPLOYEE;
    const isAdmin = actor.role === Role.ADMIN;
    if (isAdmin && s === "Classified") actions.push("assign");
    if (isAdmin && ["Assigned", "Acknowledged", "In progress"].includes(s)) actions.push("reassign");
    if (isTech && s === "Assigned") actions.push("acknowledge");
    if (isTech && s === "Acknowledged") actions.push("start");
    if (isTech && s === "In progress") actions.push("resolve");
    if (isTech && ["Assigned", "Acknowledged", "In progress"].includes(s)) actions.push("request-info");
    if ((isTech || isAdmin) && this.active) actions.push("add-note");
    if ((isReporter || isAdmin) && s === "Resolved") actions.push("verify", "reopen");
    if ((isTech || isAdmin) && s === "Verified") actions.push("close");
    if ((isReporter || isAdmin) && this.active) actions.push("respond");
    if (isReporter && ["Resolved", "Verified", "Closed"].includes(s) && this.feedbackRating === null) actions.push("feedback");
    if (isTech && ((this.#p.proposalStatus === "Proposed") || (this.#p.proposalStatus === "Accepted"))) actions.push("review-proposal");
    if ((isReporter && ["New", "Classified", "Assigned"].includes(s)) || (isAdmin && s !== "Closed")) actions.push("edit");
    return actions;
  }

  // ---- internals ----------------------------------------------------------
  #moveTo(target, actor, at, type, description) {
    const from = this.#state.name;
    this.#state.assertCanMoveTo(target, actor);
    this.#p.status = target;
    this.#state = IncidentStates.of(target);
    this.#touch(at);
    this.#raise(type, actor, at, { from, to: target, description });
  }

  #guardTechnician(actor) {
    if (actor.isSystem) return;
    if (actor.role !== Role.TECHNICIAN || actor.id !== this.technicianId) {
      throw new AuthorizationError("Only the assigned technician can do this.");
    }
  }

  #guardReporterOrAdmin(actor) {
    if (actor.isSystem || actor.role === Role.ADMIN) return;
    if (actor.id !== this.reporterId) throw new AuthorizationError("Only the reporter can do this.");
  }

  #assertOpenForComments() {
    if (this.status === "Closed") throw new ValidationError("This incident is closed.");
  }

  #addNote(actor, at, body, { kind, internal }) {
    this.#notes.push({ authorId: actor.id, kind, internal: Boolean(internal), body, at });
  }

  #touch(at) { this.#p.updatedAt = at; }

  #lastEvent() { return this.#events[this.#events.length - 1]; }

  #raise(type, actor, at, { from = null, to = null, description = "", payload = {} } = {}) {
    this.#events.push({
      type, at, actorId: actor.id ?? 0, system: Boolean(actor.isSystem),
      from, to, description,
      reporterId: this.reporterId, technicianId: this.technicianId,
      priority: this.priority, payload,
    });
  }
}
