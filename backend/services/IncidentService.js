import { Incident } from "../domain/Incident.js";
import { SYSTEM } from "../domain/users.js";
import { Role } from "../domain/roles.js";
import {
  AuthorizationError, DuplicateIncidentError, IncidentNotFoundError, TechnicianUnavailableError,
  ValidationError, WorkloadExceededError, AppError,
} from "../errors.js";
import { EscalationPolicy } from "../intelligence/analyzers.js";
import { bool, displayId, integer, oneOf, parseIncidentId, text } from "../util.js";

const STATUSES = ["New", "Classified", "Assigned", "Acknowledged", "In progress", "Resolved", "Verified", "Closed"];
const SLA_LABELS = ["On track", "At risk", "Breached", "Met"];

// Application service: orchestrates domain objects, strategies, repositories
// and the event bus for every incident use case.
export class IncidentService {
  constructor(deps) { Object.assign(this, deps); }

  // ---- intake -----------------------------------------------------------------
  #parseReport(input) {
    const service = this.services.require(input?.serviceId ?? input?.service);
    const categoryName = text(input?.category, "Category", { optional: true });
    let category = categoryName ? this.categories.find(categoryName) : null;
    if (categoryName && !category) throw new ValidationError(`Unknown category: ${categoryName}`);
    return {
      title: text(input?.title, "Title", { min: 5, max: 150 }),
      description: text(input?.description, "Description", { min: 10, max: 5000 }),
      service,
      explicitCategory: category?.name ?? null,
      impact: integer(input?.impact, "Impact", { min: 1, max: 3 }),
      urgency: integer(input?.urgency, "Urgency", { min: 1, max: 3 }),
      affectedUsers: integer(input?.affectedUsers, "Affected users", { min: 1, max: 1000000, fallback: 1 }),
      proposal: text(input?.proposal, "Suggested improvement", { optional: true, max: 2000 }) ?? null,
      force: bool(input?.force),
    };
  }

  #evaluate(report, at) {
    const suggestions = this.classifier.suggest(report.title, report.description, this.categories.list(), { prefer: report.service.category });
    const category = report.explicitCategory ?? suggestions[0]?.category ?? report.service.category;
    const strategy = this.priorityCalculator.get(this.settings.get("priorityStrategy", "weighted"));
    const { score, priority } = strategy.calculate({
      impact: report.impact, urgency: report.urgency, criticality: report.service.criticality, affectedUsers: report.affectedUsers,
    });
    const policy = this.slaResolver.find(report.service.id, priority);
    const deadlines = this.slaResolver.deadlines(at, policy);
    return { category, suggestions, score, priority, policy, deadlines, strategy: strategy.name };
  }

  #activeCandidates() {
    return this.incidents.search({ activeOnly: true }).map(({ incident }) => ({
      id: incident.id, title: incident.title, description: incident.description, serviceId: incident.serviceId,
    }));
  }

  preview(actor, input) {
    actor.require("incident:create");
    const report = this.#parseReport(input);
    const now = this.clock.now();
    const evaluation = this.#evaluate(report, now);
    const probe = { category: evaluation.category, priority: evaluation.priority, serviceId: report.service.id };
    let recommended = null;
    let assignmentIssue = null;
    try {
      const chosen = this.#chooseTechnician(probe);
      recommended = { id: chosen.technician.id, name: chosen.technician.name };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      assignmentIssue = error.message;
    }
    return {
      category: evaluation.category,
      categorySuggestions: evaluation.suggestions.slice(0, 3),
      priority: evaluation.priority,
      score: evaluation.score,
      sla: { responseMinutes: evaluation.policy.responseMinutes, resolutionMinutes: evaluation.policy.resolutionMinutes, ...evaluation.deadlines },
      recommendedTechnician: recommended,
      assignmentIssue,
      duplicates: this.duplicateDetector.find({ title: report.title, description: report.description, serviceId: report.service.id }, this.#activeCandidates()),
    };
  }

  create(actor, input) {
    actor.require("incident:create");
    const report = this.#parseReport(input);
    const now = this.clock.now();
    const evaluation = this.#evaluate(report, now);
    const matches = this.duplicateDetector.find(
      { title: report.title, description: report.description, serviceId: report.service.id }, this.#activeCandidates());
    const own = matches.filter((m) => this.incidents.findById(m.id)?.reporterId === actor.id && m.score >= 0.85);
    if (own.length && !report.force) {
      throw new DuplicateIncidentError("You already reported a very similar open incident.", {
        matches: own.map(({ id, title, score }) => ({ id, title, score })),
      });
    }

    return this.db.transaction(() => {
      const incident = Incident.create({
        title: report.title, description: report.description, reporterId: actor.id, serviceId: report.service.id,
        category: evaluation.category, impact: report.impact, urgency: report.urgency, affectedUsers: report.affectedUsers,
        criticality: report.service.criticality, score: evaluation.score, priority: evaluation.priority,
        responseDue: evaluation.deadlines.responseDue, resolutionDue: evaluation.deadlines.resolutionDue,
        proposal: report.proposal,
      }, now);
      this.incidents.save(incident);
      for (const match of matches) this.incidents.link(incident.id, match.id, "duplicate", match.score);
      incident.classify(evaluation.category, now, SYSTEM);
      if (matches.length) incident.flagDuplicate(matches, now);
      this.#autoAssign(incident, now);
      this.incidents.save(incident);
      this.bus.publishAll(incident.pullEvents());
      return this.#present(actor, incident.id, { detail: true });
    });
  }

  // ---- queries ------------------------------------------------------------------
  list(actor, query = {}) {
    const filters = this.#parseFilters(query);
    const now = this.clock.now();
    const violated = this.slaEvents.violatedIncidentIds();
    let rows = this.incidents.search(filters, { role: actor.role, userId: actor.id });
    const wanted = oneOf(query.sla, "sla", SLA_LABELS, { optional: true });
    rows = rows.map((row) => this.#summary(actor, row, now, violated));
    if (wanted) rows = rows.filter((r) => r.sla.label === wanted);
    const limit = integer(query.limit, "limit", { min: 1, max: 200, fallback: 50 });
    const offset = integer(query.offset, "offset", { min: 0, fallback: 0 });
    return { total: rows.length, limit, offset, items: rows.slice(offset, offset + limit) };
  }

  get(actor, id) {
    const found = this.#load(actor, parseIncidentId(id));
    return this.#present(actor, found.incident.id, { detail: true });
  }

  history(actor, id) {
    const found = this.#load(actor, parseIncidentId(id));
    return this.audit.forIncident(found.incident.id);
  }

  recommendations(actor, id) {
    actor.require("incident:assign");
    const { incident } = this.#load(actor, parseIncidentId(id));
    const { eligible, all } = this.#candidates(incident);
    const strategyName = this.settings.get("assignmentStrategy", "skill");
    let recommended = null;
    let issue = null;
    try {
      recommended = this.assignment.choose(strategyName, eligible, { incident }, all).technician.id;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      issue = error.message;
    }
    return {
      strategy: strategyName,
      recommendedTechnicianId: recommended,
      issue,
      technicians: all.map((c) => ({
        id: c.technician.id, name: c.technician.name, title: c.technician.title, skills: c.technician.skills,
        experience: c.technician.experience, load: c.load, capacity: c.technician.maxWorkload,
        available: c.technician.acceptingWork(), skillMatch: c.skillMatch, serviceExperience: c.serviceExperience,
        eligible: eligible.includes(c),
      })),
    };
  }

  // ---- commands -----------------------------------------------------------------
  assign(actor, id, { technicianId } = {}) {
    actor.require("incident:assign");
    return this.#mutate(actor, id, (incident, now) => {
      if (technicianId === undefined || technicianId === null || technicianId === "") {
        const { eligible, all } = this.#candidates(incident);
        const chosen = this.assignment.choose(this.settings.get("assignmentStrategy", "skill"), eligible, { incident }, all);
        incident.assign(chosen.technician, actor, now);
        return;
      }
      const technician = this.users.findById(integer(technicianId, "technicianId", { min: 1 }));
      if (!technician || technician.role !== Role.TECHNICIAN) throw new ValidationError("Choose a valid technician.");
      if (!technician.acceptingWork()) throw new TechnicianUnavailableError(`${technician.name} is not available.`);
      const load = this.incidents.activeLoad(technician.id);
      if (incident.technicianId !== technician.id && load >= technician.maxWorkload) {
        throw new WorkloadExceededError(`${technician.name} already has ${load} active incidents (maximum ${technician.maxWorkload}).`);
      }
      incident.assign(technician, actor, now);
    });
  }

  acknowledge(actor, id) { return this.#mutate(actor, id, (i, now) => i.acknowledge(actor, now)); }
  startInvestigation(actor, id) { return this.#mutate(actor, id, (i, now) => i.startInvestigation(actor, now)); }
  resolve(actor, id, body) { return this.#mutate(actor, id, (i, now) => i.resolve(actor, now, body?.resolution)); }
  verify(actor, id) { return this.#mutate(actor, id, (i, now) => i.verify(actor, now)); }
  reopen(actor, id, body) { return this.#mutate(actor, id, (i, now) => i.reopen(actor, now, body?.reason)); }
  close(actor, id) { return this.#mutate(actor, id, (i, now) => i.close(actor, now)); }
  addNote(actor, id, body) { return this.#mutate(actor, id, (i, now) => i.addNote(actor, now, body?.text, { internal: bool(body?.internal) })); }
  requestInfo(actor, id, body) { return this.#mutate(actor, id, (i, now) => i.requestInfo(actor, now, body?.question)); }
  respond(actor, id, body) { return this.#mutate(actor, id, (i, now) => i.provideInfo(actor, now, body?.text)); }
  reviewProposal(actor, id, body) {
    return this.#mutate(actor, id, (i, now) => i.reviewProposal(actor, now, body?.decision, body?.note));
  }

  // Resolved incidents as reusable fixes. Staff see the organisation's history;
  // employees only see resolutions of their own incidents.
  knowledge(actor) {
    if (actor.role === Role.EMPLOYEE) {
      return this.incidents.search({ activeOnly: false }, { role: actor.role, userId: actor.id })
        .filter(({ incident }) => incident.resolution)
        .map(({ incident }) => ({ id: incident.id, title: incident.title, category: incident.category, resolution: incident.resolution, resolvedAt: incident.resolvedAt }));
    }
    return this.incidents.knowledge();
  }

  feedback(actor, id, body) {
    return this.#mutate(actor, id, (i, now) => i.giveFeedback(actor, now, Number(body?.rating), body?.comment));
  }

  update(actor, id, body = {}) {
    return this.#mutate(actor, id, (incident, now) => {
      const affectedUsers = body.affectedUsers === undefined ? undefined : integer(body.affectedUsers, "Affected users", { min: 1, max: 1000000 });
      incident.updateDetails(actor, now, { title: body.title, description: body.description, affectedUsers });
      if (body.impact === undefined && body.urgency === undefined && affectedUsers === undefined) return;
      const impact = body.impact === undefined ? incident.impact : integer(body.impact, "Impact", { min: 1, max: 3 });
      const urgency = body.urgency === undefined ? incident.urgency : integer(body.urgency, "Urgency", { min: 1, max: 3 });
      const strategy = this.priorityCalculator.get(this.settings.get("priorityStrategy", "weighted"));
      const { score, priority } = strategy.calculate({ impact, urgency, criticality: incident.criticality, affectedUsers: incident.affectedUsers });
      const policy = this.slaResolver.find(incident.serviceId, priority);
      const deadlines = this.slaResolver.deadlines(incident.createdAt, policy);
      incident.reprioritise({ impact, urgency, criticality: incident.criticality, score, priority, ...deadlines }, actor, now);
    });
  }

  setCategory(actor, id, body) {
    const category = this.categories.find(text(body?.category, "Category"));
    if (!category) throw new ValidationError("Unknown category.");
    return this.#mutate(actor, id, (i, now) => i.setCategory(category.name, actor, now));
  }

  // ---- helpers --------------------------------------------------------------------
  #mutate(actor, id, apply) {
    const incidentId = parseIncidentId(id);
    return this.db.transaction(() => {
      const found = this.#load(actor, incidentId);
      const now = this.clock.now();
      apply(found.incident, now);
      this.slaMonitor.inspect(found.incident, now);
      this.incidents.save(found.incident);
      this.bus.publishAll(found.incident.pullEvents());
      return this.#present(actor, incidentId, { detail: true });
    });
  }

  #load(actor, id) {
    const found = this.incidents.findDetailed(id);
    const i = found?.incident;
    const visible = i && (actor.isSystem || actor.role === Role.ADMIN
      || (actor.role === Role.EMPLOYEE && i.reporterId === actor.id)
      || (actor.role === Role.TECHNICIAN && (i.technicianId === actor.id || i.reporterId === actor.id)));
    if (!visible) throw new IncidentNotFoundError(`Incident ${displayId(id)} was not found.`);
    return found;
  }

  #parseFilters(q) {
    const filters = {};
    if (q.id) filters.id = parseIncidentId(q.id);
    if (q.q) filters.q = text(String(q.q), "q", { max: 100 });
    if (q.status) filters.status = oneOf(q.status, "status", STATUSES);
    if (q.priority) filters.priority = oneOf(q.priority, "priority", ["P1", "P2", "P3", "P4"]);
    if (q.category) filters.category = text(String(q.category), "category");
    if (q.service) filters.serviceId = this.services.require(q.service).id;
    if (q.technician) filters.technicianId = integer(q.technician, "technician", { min: 1 });
    if (q.reporter) filters.reporterId = integer(q.reporter, "reporter", { min: 1 });
    if (q.from) filters.from = this.#date(q.from, "from");
    if (q.to) filters.to = this.#date(q.to, "to", true);
    if (q.awaitingInfo) filters.awaitingInfo = bool(q.awaitingInfo);
    if (q.state === "open") filters.activeOnly = true;
    if (q.state === "closed") filters.activeOnly = false;
    return filters;
  }

  #date(value, name, endOfDay = false) {
    const t = /^\d+$/.test(String(value)) ? Number(value) : Date.parse(String(value));
    if (!Number.isFinite(t)) throw new ValidationError(`${name} must be a date such as 2026-10-18.`);
    return endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? t + 86400000 - 1 : t;
  }

  #candidates(incident, { excludeId } = {}) {
    const loads = this.incidents.loads();
    const all = this.users.technicians().map((technician) => ({
      technician,
      load: loads.get(technician.id) ?? 0,
      skillMatch: technician.hasSkill(incident.category),
      serviceExperience: this.incidents.serviceExperience(technician.id, incident.serviceId),
    }));
    const eligible = all.filter((c) => c.technician.acceptingWork() && c.load < c.technician.maxWorkload && c.technician.id !== excludeId);
    return { eligible, all };
  }

  #chooseTechnician(incident) {
    const { eligible, all } = this.#candidates(incident);
    return this.assignment.choose(this.settings.get("assignmentStrategy", "skill"), eligible, { incident }, all);
  }

  #autoAssign(incident, now) {
    try {
      incident.assign(this.#chooseTechnician(incident).technician, SYSTEM, now);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      incident.noteAssignmentFailed(error.message, now);
    }
  }

  #summary(actor, row, now, violated) {
    const { incident, serviceName, reporterName, technicianName } = row;
    const sla = this.tracker.evaluate(incident, now);
    return {
      id: incident.id,
      displayId: displayId(incident.id),
      title: incident.title,
      description: incident.description,
      category: incident.category,
      service: { id: incident.serviceId, name: serviceName },
      reporter: { id: incident.reporterId, name: reporterName },
      technician: incident.technicianId ? { id: incident.technicianId, name: technicianName } : null,
      impact: incident.impact,
      urgency: incident.urgency,
      affectedUsers: incident.affectedUsers,
      criticality: incident.criticality,
      score: incident.score,
      priority: incident.priority,
      status: incident.status,
      createdAt: incident.createdAt,
      acknowledgedAt: incident.acknowledgedAt,
      resolvedAt: incident.resolvedAt,
      closedAt: incident.closedAt,
      resolution: incident.resolution,
      awaitingInfo: incident.awaitingInfo,
      escalationLevel: incident.escalationLevel,
      proposal: this.#proposalView(incident),
      escalatedTo: incident.escalationLevel ? EscalationPolicy.LADDER[incident.escalationLevel] : null,
      feedback: incident.feedbackRating ? { rating: incident.feedbackRating, comment: row.feedbackComment } : null,
      sla: { ...sla, violationRecorded: violated.has(incident.id) },
      actions: incident.availableActions(actor),
    };
  }

  #proposalView(incident) {
    const p = incident.proposal;
    if (!p) return null;
    const reviewer = p.reviewerId ? this.users.findById(p.reviewerId) : null;
    return { text: p.text, status: p.status, note: p.note, reviewedAt: p.reviewedAt, reviewer: reviewer ? { id: reviewer.id, name: reviewer.name } : null };
  }

  #present(actor, id, { detail = false } = {}) {
    const row = this.incidents.search({ id }, { role: actor.isSystem ? "Administrator" : actor.role, userId: actor.id })[0];
    if (!row) throw new IncidentNotFoundError(`Incident ${displayId(id)} was not found.`);
    const now = this.clock.now();
    const view = this.#summary(actor, row, now, this.slaEvents.violatedIncidentIds());
    if (!detail) return view;
    const staff = actor.role !== Role.EMPLOYEE;
    const incident = row.incident;
    const load = incident.technicianId ? this.incidents.activeLoad(incident.technicianId) : 0;
    const technician = incident.technicianId ? this.users.findById(incident.technicianId) : null;
    return {
      ...view,
      notes: this.incidents.notes(id, { includeInternal: staff }),
      history: this.audit.forIncident(id),
      related: this.incidents.links(id).filter((l) => staff || l.kind !== "duplicate"),
      ...(staff ? {
        risk: this.riskDetector.assess(incident, view.sla, load, technician?.maxWorkload ?? 5, now),
        suggestedResolutions: this.suggester.suggest(incident.toRecord(), this.incidents.resolvedHistory().filter((h) => h.id !== id)),
      } : {}),
    };
  }
}
