import { assertStrongPassword, hashPassword, validEmail } from "../auth/auth.js";
import { Role, Titles } from "../domain/roles.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { bool, integer, oneOf, text } from "../util.js";

const TITLES = Object.values(Titles);

// Administrator use cases: users, services, categories, SLA policies, settings.
export class AdminService {
  constructor({ users, services, categories, slaPolicies, incidents, sessions, settings, audit, assignment, priorityCalculator, clock, tracker }) {
    Object.assign(this, { users, services, categories, slaPolicies, incidents, sessions, settings, audit, assignment, priorityCalculator, clock, tracker });
  }

  #log(actor, action, description) {
    this.audit.record({ at: this.clock.now(), userId: actor.id, userName: actor.name, action, description });
  }

  // ---- users ---------------------------------------------------------------
  listUsers(actor, { role } = {}) {
    actor.require("user:manage");
    return this.users.list({ role: role ? oneOf(role, "role", Object.values(Role)) : undefined }).map((u) => u.toJSON());
  }

  listTechnicians(actor) {
    actor.require("incident:assign");
    return this.users.technicians().map((t) => t.toJSON());
  }

  #staffFields(body, role, existing) {
    const fields = {};
    if (role === Role.TECHNICIAN) {
      if (body.skills !== undefined) {
        if (!Array.isArray(body.skills)) throw new ValidationError("Skills must be a list of categories.");
        fields.skills = [...new Set(body.skills.map((s) => {
          const c = this.categories.find(text(s, "Skill"));
          if (!c) throw new ValidationError(`Unknown category: ${s}`);
          return c.name;
        }))];
      }
      if (body.experience !== undefined) fields.experience = integer(body.experience, "Experience", { min: 0, max: 60 });
      if (body.maxWorkload !== undefined) fields.maxWorkload = integer(body.maxWorkload, "Maximum workload", { min: 1, max: 50 });
      if (body.available !== undefined) fields.available = bool(body.available);
    }
    if (role !== Role.EMPLOYEE && body.title !== undefined) fields.title = oneOf(body.title, "title", TITLES);
    if (!existing && role === Role.TECHNICIAN) fields.title ??= Titles.TECHNICIAN;
    if (!existing && role === Role.ADMIN) fields.title ??= Titles.SYSTEM_ADMIN;
    return fields;
  }

  createUser(actor, body = {}) {
    actor.require("user:manage");
    const role = oneOf(body.role, "role", Object.values(Role));
    const email = validEmail(body.email);
    if (this.users.findByEmail(email)) throw new ValidationError("An account with that email already exists.");
    assertStrongPassword(body.password);
    const user = this.users.insert(
      { name: text(body.name, "Name", { min: 2, max: 80 }), email, role, active: true, ...this.#staffFields(body, role, null) },
      hashPassword(body.password), this.clock.now());
    this.#log(actor, "USER_CREATED", `Created ${role} account for ${user.name}`);
    return user.toJSON();
  }

  updateUser(actor, id, body = {}) {
    actor.require("user:manage");
    const user = this.users.findById(id);
    if (!user) throw new NotFoundError("User not found.");
    const patch = this.#staffFields(body, user.role, user);
    if (body.name !== undefined) patch.name = text(body.name, "Name", { min: 2, max: 80 });
    if (body.email !== undefined) {
      patch.email = validEmail(body.email);
      const clash = this.users.findByEmail(patch.email);
      if (clash && clash.user.id !== user.id) throw new ValidationError("An account with that email already exists.");
    }
    if (body.active !== undefined) {
      patch.active = bool(body.active);
      if (!patch.active) this.#assertCanDeactivate(actor, user);
    }
    if (patch.available === false || patch.active === false) { /* existing incidents stay with the technician until reassigned */ }
    const updated = this.users.update(id, patch);
    if (patch.active === false) this.sessions.removeAllFor(id);
    this.#log(actor, "USER_UPDATED", `Updated account of ${updated.name}`);
    return updated.toJSON();
  }

  #assertCanDeactivate(actor, user) {
    if (user.id === actor.id) throw new ValidationError("You cannot deactivate your own account.");
    if (user.role === Role.TECHNICIAN && this.incidents.activeLoad(user.id) > 0) {
      throw new ValidationError("Reassign this technician's active incidents before deactivating them.");
    }
    if (user.role === Role.ADMIN && this.users.administrators().length <= 1) {
      throw new ValidationError("At least one active administrator is required.");
    }
  }

  resetPassword(actor, id, body = {}) {
    actor.require("user:manage");
    if (!this.users.findById(id)) throw new NotFoundError("User not found.");
    assertStrongPassword(body.password);
    this.users.setPasswordHash(id, hashPassword(body.password));
    this.sessions.removeAllFor(id);
    this.#log(actor, "PASSWORD_RESET", `Reset password for user ${id}`);
  }

  // ---- IT services --------------------------------------------------------------
  listServices(actor) { actor.require("notification:view"); return this.services.list(); }

  #serviceFields(body, current = {}) {
    const category = text(body.category ?? current.category, "Category");
    if (!this.categories.find(category)) throw new ValidationError(`Unknown category: ${category}`);
    return {
      name: text(body.name ?? current.name, "Name", { min: 2, max: 80 }),
      category,
      criticality: integer(body.criticality ?? current.criticality, "Business criticality", { min: 1, max: 3 }),
      owner: text(body.owner ?? current.owner ?? "", "Owner", { optional: true, max: 80 }) ?? "",
      active: body.active === undefined ? (current.active ?? true) : bool(body.active),
    };
  }

  createService(actor, body = {}) {
    actor.require("service:manage");
    const service = this.services.insert(this.#serviceFields(body));
    this.#log(actor, "SERVICE_CREATED", `Created IT service ${service.name}`);
    return service;
  }

  updateService(actor, id, body = {}) {
    actor.require("service:manage");
    const current = this.services.findById(id);
    if (!current) throw new NotFoundError("Service not found.");
    const service = this.services.update(id, this.#serviceFields(body, current));
    this.#log(actor, "SERVICE_UPDATED", `Updated IT service ${service.name}`);
    return service;
  }

  // ---- categories -----------------------------------------------------------------
  listCategories(actor) { actor.require("notification:view"); return this.categories.list(); }

  saveCategory(actor, body = {}) {
    actor.require("category:manage");
    const keywords = body.keywords === undefined ? [] : body.keywords;
    if (!Array.isArray(keywords) || keywords.length > 100) throw new ValidationError("Keywords must be a list of up to 100 words.");
    const category = this.categories.upsert({
      name: text(body.name, "Category name", { min: 2, max: 40 }),
      description: text(body.description, "Description", { optional: true, max: 200 }) ?? "",
      keywords: keywords.map((k) => text(k, "Keyword", { max: 40 })),
    });
    this.#log(actor, "CATEGORY_SAVED", `Saved category ${category.name}`);
    return category;
  }

  removeCategory(actor, name) {
    actor.require("category:manage");
    this.categories.remove(name);
    this.#log(actor, "CATEGORY_REMOVED", `Removed category ${name}`);
  }

  // ---- SLA policies ---------------------------------------------------------------------
  listSlaPolicies(actor) { actor.require("notification:view"); return this.slaPolicies.list(); }

  saveSlaPolicy(actor, body = {}) {
    actor.require("sla:manage");
    const serviceId = body.serviceId === undefined || body.serviceId === null || body.serviceId === ""
      ? null : integer(body.serviceId, "serviceId", { min: 1 });
    if (serviceId !== null && !this.services.findById(serviceId)) throw new NotFoundError("Service not found.");
    const responseMinutes = integer(body.responseMinutes, "Response target (minutes)", { min: 1, max: 525600 });
    const resolutionMinutes = integer(body.resolutionMinutes, "Resolution target (minutes)", { min: 1, max: 525600 });
    if (resolutionMinutes < responseMinutes) throw new ValidationError("Resolution target cannot be shorter than the response target.");
    const policy = this.slaPolicies.upsert({ serviceId, priority: oneOf(body.priority, "priority", ["P1", "P2", "P3", "P4"]), responseMinutes, resolutionMinutes });
    this.#log(actor, "SLA_POLICY_SAVED", `Saved ${policy.priority} SLA (${responseMinutes}/${resolutionMinutes} min)${serviceId ? ` for service ${serviceId}` : " as default"}`);
    return policy;
  }

  removeSlaPolicy(actor, id) {
    actor.require("sla:manage");
    this.slaPolicies.remove(id);
    this.#log(actor, "SLA_POLICY_REMOVED", `Removed SLA policy ${id}`);
  }

  // ---- settings --------------------------------------------------------------------------
  getSettings(actor) {
    actor.require("settings:manage");
    return {
      assignmentStrategy: this.settings.get("assignmentStrategy", "skill"),
      priorityStrategy: this.settings.get("priorityStrategy", "weighted"),
      assignmentStrategies: this.assignment.list(),
      priorityStrategies: this.priorityCalculator.list(),
      slaWarningRatio: this.tracker.warningRatio,
    };
  }

  updateSettings(actor, body = {}) {
    actor.require("settings:manage");
    if (body.assignmentStrategy !== undefined) {
      if (!this.assignment.has(body.assignmentStrategy)) throw new ValidationError("Unknown assignment strategy.");
      this.settings.set("assignmentStrategy", body.assignmentStrategy);
      this.#log(actor, "SETTINGS_CHANGED", `Assignment strategy set to ${body.assignmentStrategy}`);
    }
    if (body.priorityStrategy !== undefined) {
      if (!this.priorityCalculator.has(body.priorityStrategy)) throw new ValidationError("Unknown priority strategy.");
      this.settings.set("priorityStrategy", body.priorityStrategy);
      this.#log(actor, "SETTINGS_CHANGED", `Priority strategy set to ${body.priorityStrategy}`);
    }
    if (body.slaWarningRatio !== undefined) {
      const ratio = Number(body.slaWarningRatio);
      if (!(ratio > 0 && ratio < 1)) throw new ValidationError("SLA warning ratio must be between 0 and 1.");
      this.tracker.warningRatio = ratio;
      this.settings.set("slaWarningRatio", ratio);
      this.#log(actor, "SETTINGS_CHANGED", `SLA warning threshold set to ${ratio * 100}% remaining`);
    }
    return this.getSettings(actor);
  }

  auditLog(actor, query = {}) {
    actor.require("audit:view");
    return this.audit.search({
      incidentId: query.incident ? integer(String(query.incident).replace(/^INC-?/i, ""), "incident", { min: 1 }) : undefined,
      userId: query.user ? integer(query.user, "user", { min: 1 }) : undefined,
      action: query.action ? text(query.action, "action", { max: 40 }) : undefined,
      limit: integer(query.limit, "limit", { min: 1, max: 500, fallback: 100 }),
      offset: integer(query.offset, "offset", { min: 0, fallback: 0 }),
    });
  }
}
