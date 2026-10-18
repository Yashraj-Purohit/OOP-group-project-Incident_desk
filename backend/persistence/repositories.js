import { createHash } from "node:crypto";
import { Incident } from "../domain/Incident.js";
import { UserFactory } from "../domain/users.js";
import { NotFoundError, ServiceNotFoundError, ValidationError } from "../errors.js";

const flag = (v) => (v ? 1 : 0);
const json = (v) => JSON.stringify(v ?? []);

// ---------------------------------------------------------------------------
// Repository contracts (interfaces). Services depend on these, not on SQLite.
// ---------------------------------------------------------------------------
export class UserRepository {
  findById() { throw new TypeError("not implemented"); }
  findByEmail() { throw new TypeError("not implemented"); }
  save() { throw new TypeError("not implemented"); }
}

export class IncidentRepository {
  findById() { throw new TypeError("not implemented"); }
  save() { throw new TypeError("not implemented"); }
  search() { throw new TypeError("not implemented"); }
}

// ---------------------------------------------------------------------------
export class SqliteUserRepository extends UserRepository {
  constructor(db) { super(); this.db = db; }

  static #toUser(row) {
    return UserFactory.create({
      id: row.id, name: row.name, email: row.email, role: row.role, title: row.title,
      active: Boolean(row.active), skills: JSON.parse(row.skills), experience: row.experience,
      maxWorkload: row.max_workload, available: Boolean(row.available),
    });
  }

  findById(id) {
    const row = this.db.get("SELECT * FROM users WHERE id = ?", id);
    return row ? SqliteUserRepository.#toUser(row) : null;
  }

  findByEmail(email) {
    const row = this.db.get("SELECT * FROM users WHERE email = ?", String(email).trim());
    return row ? { user: SqliteUserRepository.#toUser(row), passwordHash: row.password_hash } : null;
  }

  list({ role, active } = {}) {
    const where = [];
    const params = [];
    if (role) { where.push("role = ?"); params.push(role); }
    if (active !== undefined) { where.push("active = ?"); params.push(flag(active)); }
    const rows = this.db.all(`SELECT * FROM users ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY name`, ...params);
    return rows.map(SqliteUserRepository.#toUser);
  }

  technicians({ activeOnly = true } = {}) {
    return this.list({ role: "Technician", active: activeOnly ? true : undefined });
  }

  administrators() { return this.list({ role: "Administrator", active: true }); }

  // First active staff member holding the given escalation title.
  byTitle(title) {
    const row = this.db.get("SELECT * FROM users WHERE title = ? AND active = 1 AND role IN ('Technician','Administrator') ORDER BY id LIMIT 1", title);
    return row ? SqliteUserRepository.#toUser(row) : null;
  }

  // data: plain record + passwordHash on create
  insert(data, passwordHash, now) {
    const result = this.db.run(
      `INSERT INTO users (name, email, role, title, password_hash, active, skills, experience, max_workload, available, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.name, data.email, data.role, data.title ?? null, passwordHash, flag(data.active ?? true),
      json(data.skills), data.experience ?? 0, data.maxWorkload ?? 5, flag(data.available ?? true), now,
    );
    return this.findById(Number(result.lastInsertRowid));
  }

  update(id, data) {
    const current = this.db.get("SELECT * FROM users WHERE id = ?", id);
    if (!current) throw new NotFoundError("User not found.");
    const m = { ...current, ...data };
    this.db.run(
      `UPDATE users SET name = ?, email = ?, title = ?, active = ?, skills = ?, experience = ?, max_workload = ?, available = ? WHERE id = ?`,
      m.name, m.email, m.title ?? null, flag(m.active), typeof m.skills === "string" ? m.skills : json(m.skills),
      m.experience, m.maxWorkload ?? m.max_workload, flag(m.available), id,
    );
    return this.findById(id);
  }

  setPasswordHash(id, hash) { this.db.run("UPDATE users SET password_hash = ? WHERE id = ?", hash, id); }
  count() { return this.db.get("SELECT COUNT(*) AS n FROM users").n; }
  save(user) { return user; }
}

// ---------------------------------------------------------------------------
export class ServiceRepository {
  constructor(db) { this.db = db; }
  static #map(r) {
    return r && { id: r.id, name: r.name, category: r.category, criticality: r.criticality, owner: r.owner, active: Boolean(r.active) };
  }
  list({ activeOnly = false } = {}) {
    return this.db.all(`SELECT * FROM services ${activeOnly ? "WHERE active = 1" : ""} ORDER BY name`).map(ServiceRepository.#map);
  }
  findById(id) { return ServiceRepository.#map(this.db.get("SELECT * FROM services WHERE id = ?", id)); }
  findByName(name) { return ServiceRepository.#map(this.db.get("SELECT * FROM services WHERE name = ?", name)); }
  require(idOrName) {
    const service = typeof idOrName === "number" || /^\d+$/.test(String(idOrName))
      ? this.findById(Number(idOrName)) : this.findByName(idOrName);
    if (!service || !service.active) throw new ServiceNotFoundError("That IT service does not exist.");
    return service;
  }
  insert(s) {
    const r = this.db.run("INSERT INTO services (name, category, criticality, owner, active) VALUES (?, ?, ?, ?, ?)",
      s.name, s.category, s.criticality, s.owner ?? "", flag(s.active ?? true));
    return this.findById(Number(r.lastInsertRowid));
  }
  update(id, patch) {
    const s = this.findById(id);
    if (!s) throw new ServiceNotFoundError("That IT service does not exist.");
    const m = { ...s, ...patch };
    this.db.run("UPDATE services SET name = ?, category = ?, criticality = ?, owner = ?, active = ? WHERE id = ?",
      m.name, m.category, m.criticality, m.owner, flag(m.active), id);
    return this.findById(id);
  }
  count() { return this.db.get("SELECT COUNT(*) AS n FROM services").n; }
}

export class CategoryRepository {
  constructor(db) { this.db = db; }
  static #map(r) { return r && { name: r.name, description: r.description, keywords: JSON.parse(r.keywords) }; }
  list() { return this.db.all("SELECT * FROM categories ORDER BY name").map(CategoryRepository.#map); }
  find(name) { return CategoryRepository.#map(this.db.get("SELECT * FROM categories WHERE name = ?", name)); }
  upsert({ name, description = "", keywords = [] }) {
    this.db.run(
      `INSERT INTO categories (name, description, keywords) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET description = excluded.description, keywords = excluded.keywords`,
      name, description, json(keywords));
    return this.find(name);
  }
  remove(name) {
    const used = this.db.get("SELECT (SELECT COUNT(*) FROM incidents WHERE category = ?) + (SELECT COUNT(*) FROM services WHERE category = ?) AS n", name, name).n;
    if (used) throw new ValidationError("This category is in use by services or incidents and cannot be removed.");
    this.db.run("DELETE FROM categories WHERE name = ?", name);
  }
}

export class SlaPolicyRepository {
  constructor(db) { this.db = db; }
  static #map(r) {
    return r && { id: r.id, serviceId: r.service_id, priority: r.priority, responseMinutes: r.response_minutes, resolutionMinutes: r.resolution_minutes };
  }
  find(serviceId, priority) {
    const row = this.db.get(
      `SELECT * FROM sla_policies WHERE priority = ? AND (service_id = ? OR service_id IS NULL)
       ORDER BY service_id IS NULL LIMIT 1`, priority, serviceId ?? null);
    return SlaPolicyRepository.#map(row);
  }
  list() { return this.db.all("SELECT * FROM sla_policies ORDER BY service_id IS NOT NULL, service_id, priority").map(SlaPolicyRepository.#map); }
  upsert({ serviceId = null, priority, responseMinutes, resolutionMinutes }) {
    this.db.run(
      `INSERT INTO sla_policies (service_id, priority, response_minutes, resolution_minutes) VALUES (?, ?, ?, ?)
       ON CONFLICT(COALESCE(service_id, 0), priority) DO UPDATE SET response_minutes = excluded.response_minutes, resolution_minutes = excluded.resolution_minutes`,
      serviceId, priority, responseMinutes, resolutionMinutes);
    return SlaPolicyRepository.#map(this.db.get("SELECT * FROM sla_policies WHERE COALESCE(service_id, 0) = COALESCE(?, 0) AND priority = ?", serviceId, priority));
  }
  remove(id) { this.db.run("DELETE FROM sla_policies WHERE id = ?", id); }
}

// ---------------------------------------------------------------------------
const INCIDENT_SELECT = `
SELECT i.*, s.name AS service_name, r.name AS reporter_name, t.name AS technician_name
FROM incidents i
JOIN services s ON s.id = i.service_id
JOIN users r ON r.id = i.reporter_id
LEFT JOIN users t ON t.id = i.technician_id`;

export class SqliteIncidentRepository extends IncidentRepository {
  constructor(db) { super(); this.db = db; }

  static toRecord(r) {
    return {
      id: r.id, title: r.title, description: r.description, reporterId: r.reporter_id, category: r.category,
      serviceId: r.service_id, impact: r.impact, urgency: r.urgency, affectedUsers: r.affected_users,
      criticality: r.criticality, score: r.score, priority: r.priority, status: r.status, technicianId: r.technician_id,
      createdAt: r.created_at, updatedAt: r.updated_at, acknowledgedAt: r.acknowledged_at, resolvedAt: r.resolved_at,
      closedAt: r.closed_at, responseDue: r.response_due, resolutionDue: r.resolution_due, resolution: r.resolution,
      escalationLevel: r.escalation_level, awaitingInfo: Boolean(r.awaiting_info),
      feedbackRating: r.feedback_rating, feedbackComment: r.feedback_comment,
      proposalText: r.proposal_text, proposalStatus: r.proposal_status, proposalReviewerId: r.proposal_reviewer_id,
      proposalNote: r.proposal_note, proposalReviewedAt: r.proposal_reviewed_at,
    };
  }

  static names(r) {
    return { serviceName: r.service_name, reporterName: r.reporter_name, technicianName: r.technician_name ?? null };
  }

  findById(id) {
    const row = this.db.get(`${INCIDENT_SELECT} WHERE i.id = ?`, id);
    return row ? Incident.restore(SqliteIncidentRepository.toRecord(row)) : null;
  }

  // Domain object + display names, for presentation.
  findDetailed(id) {
    const row = this.db.get(`${INCIDENT_SELECT} WHERE i.id = ?`, id);
    return row ? { incident: Incident.restore(SqliteIncidentRepository.toRecord(row)), ...SqliteIncidentRepository.names(row), record: row } : null;
  }

  save(incident) {
    const p = incident.toRecord();
    const values = [
      p.title, p.description, p.reporterId, p.category, p.serviceId, p.impact, p.urgency, p.affectedUsers, p.criticality,
      p.score, p.priority, p.status, p.technicianId ?? null, p.updatedAt, p.acknowledgedAt ?? null, p.resolvedAt ?? null,
      p.closedAt ?? null, p.responseDue, p.resolutionDue, p.resolution ?? null, p.escalationLevel, flag(p.awaitingInfo),
      p.feedbackRating ?? null, p.feedbackComment ?? null,
      p.proposalText ?? null, p.proposalStatus ?? null, p.proposalReviewerId ?? null, p.proposalNote ?? null, p.proposalReviewedAt ?? null,
    ];
    if (p.id === undefined) {
      const r = this.db.run(
        `INSERT INTO incidents (title, description, reporter_id, category, service_id, impact, urgency, affected_users, criticality,
          score, priority, status, technician_id, updated_at, acknowledged_at, resolved_at, closed_at, response_due, resolution_due,
          resolution, escalation_level, awaiting_info, feedback_rating, feedback_comment,
          proposal_text, proposal_status, proposal_reviewer_id, proposal_note, proposal_reviewed_at, created_at)
         VALUES (${"?, ".repeat(29)}?)`, ...values, p.createdAt);
      incident.markPersisted(Number(r.lastInsertRowid));
    } else {
      this.db.run(
        `UPDATE incidents SET title = ?, description = ?, reporter_id = ?, category = ?, service_id = ?, impact = ?, urgency = ?,
          affected_users = ?, criticality = ?, score = ?, priority = ?, status = ?, technician_id = ?, updated_at = ?,
          acknowledged_at = ?, resolved_at = ?, closed_at = ?, response_due = ?, resolution_due = ?, resolution = ?,
          escalation_level = ?, awaiting_info = ?, feedback_rating = ?, feedback_comment = ?,
          proposal_text = ?, proposal_status = ?, proposal_reviewer_id = ?, proposal_note = ?, proposal_reviewed_at = ? WHERE id = ?`, ...values, p.id);
    }
    for (const n of incident.pullNotes()) {
      this.db.run("INSERT INTO incident_notes (incident_id, author_id, kind, internal, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        incident.id, n.authorId, n.kind, flag(n.internal), n.body, n.at);
    }
    return incident;
  }

  // filters: id, q, status, priority, category, serviceId, technicianId, reporterId, from, to, awaitingInfo, activeOnly
  // scope: { role, userId } restricts what the caller may see.
  search(filters = {}, scope = null) {
    const where = [];
    const params = [];
    const add = (clause, ...values) => { where.push(clause); params.push(...values); };
    if (scope?.role === "Employee") add("i.reporter_id = ?", scope.userId);
    if (scope?.role === "Technician") add("(i.technician_id = ? OR i.reporter_id = ?)", scope.userId, scope.userId);
    if (filters.id) add("i.id = ?", filters.id);
    if (filters.q) {
      const like = `%${String(filters.q).replace(/[%_\\]/g, (c) => "\\" + c)}%`;
      add("(i.title LIKE ? ESCAPE '\\' OR i.description LIKE ? ESCAPE '\\' OR CAST(i.id AS TEXT) LIKE ? ESCAPE '\\')", like, like, like);
    }
    if (filters.status) add("i.status = ?", filters.status);
    if (filters.priority) add("i.priority = ?", filters.priority);
    if (filters.category) add("i.category = ?", filters.category);
    if (filters.serviceId) add("i.service_id = ?", filters.serviceId);
    if (filters.technicianId) add("i.technician_id = ?", filters.technicianId);
    if (filters.reporterId) add("i.reporter_id = ?", filters.reporterId);
    if (filters.from) add("i.created_at >= ?", filters.from);
    if (filters.to) add("i.created_at <= ?", filters.to);
    if (filters.awaitingInfo) add("i.awaiting_info = 1");
    if (filters.activeOnly === true) add("i.status IN ('New','Classified','Assigned','Acknowledged','In progress')");
    if (filters.activeOnly === false) add("i.status IN ('Resolved','Verified','Closed')");
    const rows = this.db.all(
      `${INCIDENT_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY CASE i.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END, i.created_at DESC`, ...params);
    return rows.map((row) => ({ incident: Incident.restore(SqliteIncidentRepository.toRecord(row)), ...SqliteIncidentRepository.names(row), feedbackComment: row.feedback_comment }));
  }

  activeLoad(technicianId) {
    return this.db.get("SELECT COUNT(*) AS n FROM incidents WHERE technician_id = ? AND status IN ('Assigned','Acknowledged','In progress')", technicianId).n;
  }

  loads() {
    const map = new Map();
    for (const r of this.db.all("SELECT technician_id AS id, COUNT(*) AS n FROM incidents WHERE technician_id IS NOT NULL AND status IN ('Assigned','Acknowledged','In progress') GROUP BY technician_id")) map.set(r.id, r.n);
    return map;
  }

  serviceExperience(technicianId, serviceId) {
    return this.db.get("SELECT COUNT(*) AS n FROM incidents WHERE technician_id = ? AND service_id = ? AND status IN ('Resolved','Verified','Closed')", technicianId, serviceId).n;
  }

  notes(incidentId, { includeInternal }) {
    return this.db.all(
      `SELECT n.id, n.kind, n.internal, n.body, n.created_at AS at, u.name AS author, u.role AS authorRole
       FROM incident_notes n LEFT JOIN users u ON u.id = n.author_id
       WHERE n.incident_id = ? ${includeInternal ? "" : "AND n.internal = 0"} ORDER BY n.id`, incidentId)
      .map((n) => ({ ...n, internal: Boolean(n.internal) }));
  }

  link(incidentId, relatedId, kind, score) {
    this.db.run("INSERT OR IGNORE INTO incident_links (incident_id, related_id, kind, score) VALUES (?, ?, ?, ?)", incidentId, relatedId, kind, score);
  }

  links(incidentId) {
    return this.db.all(
      `SELECT l.related_id AS id, l.kind, l.score, i.title, i.status, i.priority FROM incident_links l
       JOIN incidents i ON i.id = l.related_id WHERE l.incident_id = ?
       UNION SELECT l.incident_id AS id, l.kind, l.score, i.title, i.status, i.priority FROM incident_links l
       JOIN incidents i ON i.id = l.incident_id WHERE l.related_id = ?`, incidentId, incidentId);
  }

  // Resolved work for the knowledge base and resolution suggestions.
  knowledge(limit = 100) {
    return this.db.all(
      "SELECT id, title, category, resolution, resolved_at AS resolvedAt FROM incidents WHERE resolution IS NOT NULL AND resolution != '' ORDER BY resolved_at DESC LIMIT ?", limit);
  }

  resolvedHistory(limit = 500) {
    return this.db.all("SELECT id, title, description, category, resolution FROM incidents WHERE resolution IS NOT NULL ORDER BY resolved_at DESC LIMIT ?", limit);
  }
}

// ---------------------------------------------------------------------------
export class AuditRepository {
  constructor(db) { this.db = db; }
  record({ at, userId, userName, action, incidentId = null, previousState = null, newState = null, description }) {
    this.db.run(
      "INSERT INTO audit_log (at, user_id, user_name, action, incident_id, previous_state, new_state, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      at, userId ?? null, userName, action, incidentId, previousState, newState, description);
  }
  static #map(r) {
    return { id: r.id, at: r.at, userId: r.user_id, user: r.user_name, action: r.action, incidentId: r.incident_id, previousState: r.previous_state, newState: r.new_state, description: r.description };
  }
  forIncident(incidentId) {
    return this.db.all("SELECT * FROM audit_log WHERE incident_id = ? ORDER BY id", incidentId).map(AuditRepository.#map);
  }
  search({ incidentId, userId, action, from, to, limit = 100, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (incidentId) { where.push("incident_id = ?"); params.push(incidentId); }
    if (userId) { where.push("user_id = ?"); params.push(userId); }
    if (action) { where.push("action = ?"); params.push(action); }
    if (from) { where.push("at >= ?"); params.push(from); }
    if (to) { where.push("at <= ?"); params.push(to); }
    return this.db.all(`SELECT * FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, limit, offset).map(AuditRepository.#map);
  }
}

export class NotificationRepository {
  constructor(db) { this.db = db; }
  insert(n) {
    this.db.run("INSERT INTO notifications (at, recipient_id, channel, event, incident_id, subject, message) VALUES (?, ?, ?, ?, ?, ?, ?)",
      n.at, n.recipientId, n.channel, n.event, n.incidentId ?? null, n.subject, n.message);
  }
  static #map(r) {
    return { id: r.id, at: r.at, channel: r.channel, event: r.event, incidentId: r.incident_id, subject: r.subject, message: r.message, read: Boolean(r.read) };
  }
  forUser(userId, { channel = "in-app", unreadOnly = false, limit = 50 } = {}) {
    return this.db.all(
      `SELECT * FROM notifications WHERE recipient_id = ? AND channel = ? ${unreadOnly ? "AND read = 0" : ""} ORDER BY id DESC LIMIT ?`,
      userId, channel, limit).map(NotificationRepository.#map);
  }
  unreadCount(userId) { return this.db.get("SELECT COUNT(*) AS n FROM notifications WHERE recipient_id = ? AND channel = 'in-app' AND read = 0", userId).n; }
  markRead(userId, id) { this.db.run("UPDATE notifications SET read = 1 WHERE recipient_id = ? AND id = ?", userId, id); }
  markAllRead(userId) { this.db.run("UPDATE notifications SET read = 1 WHERE recipient_id = ?", userId); }
  outbox(limit = 50) {
    return this.db.all("SELECT * FROM notifications WHERE channel = 'email' ORDER BY id DESC LIMIT ?", limit).map(NotificationRepository.#map);
  }
}

export class SlaEventRepository {
  constructor(db) { this.db = db; }
  // Returns true only the first time an event of this kind is recorded.
  record(incidentId, kind, at) {
    return this.db.run("INSERT OR IGNORE INTO sla_events (incident_id, kind, at) VALUES (?, ?, ?)", incidentId, kind, at).changes > 0;
  }
  has(incidentId, kind) { return Boolean(this.db.get("SELECT 1 AS x FROM sla_events WHERE incident_id = ? AND kind = ?", incidentId, kind)); }
  violations({ limit = 200 } = {}) {
    return this.db.all(
      `SELECT e.incident_id AS incidentId, e.kind, e.at, i.title, i.priority, i.status, s.name AS service
       FROM sla_events e JOIN incidents i ON i.id = e.incident_id JOIN services s ON s.id = i.service_id
       WHERE e.kind LIKE '%violation' ORDER BY e.at DESC LIMIT ?`, limit);
  }
  violatedIncidentIds() {
    return new Set(this.db.all("SELECT DISTINCT incident_id AS id FROM sla_events WHERE kind LIKE '%violation'").map((r) => r.id));
  }
}

export class SessionRepository {
  constructor(db) { this.db = db; }
  static hash(token) { return createHash("sha256").update(token).digest("hex"); }
  create(token, userId, now, ttlMs) {
    this.db.run("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", SessionRepository.hash(token), userId, now, now + ttlMs);
  }
  find(token, now) {
    return this.db.get("SELECT user_id AS userId FROM sessions WHERE token_hash = ? AND expires_at > ?", SessionRepository.hash(token), now);
  }
  remove(token) { this.db.run("DELETE FROM sessions WHERE token_hash = ?", SessionRepository.hash(token)); }
  removeAllFor(userId) { this.db.run("DELETE FROM sessions WHERE user_id = ?", userId); }
  purge(now) { this.db.run("DELETE FROM sessions WHERE expires_at <= ?", now); }
}

export class SettingsRepository {
  constructor(db) { this.db = db; }
  get(key, fallback = null) {
    const row = this.db.get("SELECT value FROM settings WHERE key = ?", key);
    return row ? JSON.parse(row.value) : fallback;
  }
  set(key, value) {
    this.db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value));
  }
}
