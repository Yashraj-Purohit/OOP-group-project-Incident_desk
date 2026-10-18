import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppError, PersistenceError, ValidationError } from "../errors.js";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('Employee','Technician','Administrator')),
  title TEXT,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  skills TEXT NOT NULL DEFAULT '[]',
  experience INTEGER NOT NULL DEFAULT 0,
  max_workload INTEGER NOT NULL DEFAULT 5,
  available INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category TEXT NOT NULL,
  criticality INTEGER NOT NULL CHECK (criticality BETWEEN 1 AND 3),
  owner TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS sla_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
  priority TEXT NOT NULL CHECK (priority IN ('P1','P2','P3','P4')),
  response_minutes INTEGER NOT NULL CHECK (response_minutes > 0),
  resolution_minutes INTEGER NOT NULL CHECK (resolution_minutes > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_unique ON sla_policies (COALESCE(service_id, 0), priority);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  service_id INTEGER NOT NULL REFERENCES services(id),
  impact INTEGER NOT NULL,
  urgency INTEGER NOT NULL,
  affected_users INTEGER NOT NULL DEFAULT 1,
  criticality INTEGER NOT NULL,
  score REAL NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  technician_id INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  resolved_at INTEGER,
  closed_at INTEGER,
  response_due INTEGER NOT NULL,
  resolution_due INTEGER NOT NULL,
  resolution TEXT,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  awaiting_info INTEGER NOT NULL DEFAULT 0,
  feedback_rating INTEGER,
  feedback_comment TEXT,
  proposal_text TEXT,
  proposal_status TEXT,
  proposal_reviewer_id INTEGER,
  proposal_note TEXT,
  proposal_reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_tech ON incidents (technician_id);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents (reporter_id);
CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents (service_id);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents (created_at);
CREATE TABLE IF NOT EXISTS incident_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  internal INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS incident_links (
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  related_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  score REAL NOT NULL,
  PRIMARY KEY (incident_id, related_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id INTEGER,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  incident_id INTEGER,
  previous_state TEXT,
  new_state TEXT,
  description TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_incident ON audit_log (incident_id);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,
  event TEXT NOT NULL,
  incident_id INTEGER,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (recipient_id, channel);
CREATE TABLE IF NOT EXISTS sla_events (
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (incident_id, kind)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Thin wrapper over node:sqlite that normalises errors and adds nested
// transactions (SAVEPOINTs).
export class Database {
  #db;
  #depth = 0;

  constructor(path = ":memory:") {
    try {
      if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
      this.#db = new DatabaseSync(path);
      this.#db.prepare("PRAGMA foreign_keys = ON").run();
      if (path !== ":memory:") this.#db.prepare("PRAGMA journal_mode = WAL").run();
      for (const statement of SCHEMA.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
        this.#db.prepare(statement).run();
      }
      // Databases created before improvement proposals existed get the new columns.
      const columns = this.#db.prepare("PRAGMA table_info(incidents)").all().map((c) => c.name);
      for (const [name, type] of [["proposal_text", "TEXT"], ["proposal_status", "TEXT"], ["proposal_reviewer_id", "INTEGER"], ["proposal_note", "TEXT"], ["proposal_reviewed_at", "INTEGER"]]) {
        if (!columns.includes(name)) this.#db.prepare(`ALTER TABLE incidents ADD COLUMN ${name} ${type}`).run();
      }
      // Incident numbers start at INC-1001.
      const seeded = this.#db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'incidents'").get();
      if (!seeded) this.#db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('incidents', 1000)").run();
    } catch (error) {
      throw new PersistenceError("Could not open the database.", { cause: String(error.message) });
    }
  }

  run(sql, ...params) { return this.#wrap(() => this.#db.prepare(sql).run(...params)); }
  get(sql, ...params) { return this.#wrap(() => this.#db.prepare(sql).get(...params)); }
  all(sql, ...params) { return this.#wrap(() => this.#db.prepare(sql).all(...params)); }

  transaction(fn) {
    const name = `sp${this.#depth++}`;
    this.#wrap(() => this.#db.prepare(`SAVEPOINT ${name}`).run());
    try {
      const result = fn();
      this.#wrap(() => this.#db.prepare(`RELEASE ${name}`).run());
      return result;
    } catch (error) {
      try {
        this.#db.prepare(`ROLLBACK TO ${name}`).run();
        this.#db.prepare(`RELEASE ${name}`).run();
      } catch { /* connection already unusable */ }
      throw error;
    } finally {
      this.#depth -= 1;
    }
  }

  close() { this.#db.close(); }

  #wrap(fn) {
    try {
      return fn();
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = String(error?.message ?? error);
      if (/UNIQUE constraint failed/i.test(message)) throw new ValidationError("That value already exists.");
      if (/FOREIGN KEY|CHECK constraint|NOT NULL/i.test(message)) throw new ValidationError("The data violates a database rule.");
      throw new PersistenceError("The database operation failed. Please try again.", { cause: message });
    }
  }
}
