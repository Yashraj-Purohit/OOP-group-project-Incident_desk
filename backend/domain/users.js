import { AuthorizationError, ValidationError } from "../errors.js";
import { PERMISSIONS, Role, Titles } from "./roles.js";

// Abstract base: identity data is private, behaviour is exposed via methods.
export class User {
  #id;
  #name;
  #email;
  #active;

  constructor({ id, name, email, active = true }) {
    if (new.target === User) throw new TypeError("User is abstract.");
    this.#id = id;
    this.#name = name;
    this.#email = email;
    this.#active = Boolean(active);
  }

  get id() { return this.#id; }
  get name() { return this.#name; }
  get email() { return this.#email; }
  get active() { return this.#active; }
  get role() { throw new TypeError("Subclasses must define role."); }
  get isSystem() { return false; }

  can(permission) {
    return PERMISSIONS[this.role]?.has(permission) ?? false;
  }

  require(permission) {
    if (!this.can(permission)) {
      throw new AuthorizationError(`${this.role} users are not allowed to perform this operation.`);
    }
    return this;
  }

  toJSON() {
    return { id: this.#id, name: this.#name, email: this.#email, role: this.role, active: this.#active };
  }
}

export class Employee extends User {
  get role() { return Role.EMPLOYEE; }
}

export class Technician extends User {
  #skills;
  #experience;
  #maxWorkload;
  #available;
  #title;

  constructor({ skills = [], experience = 0, maxWorkload = 5, available = true, title = Titles.TECHNICIAN, ...base }) {
    super(base);
    this.#skills = Object.freeze([...skills]);
    this.#experience = experience;
    this.#maxWorkload = maxWorkload;
    this.#available = Boolean(available);
    this.#title = title;
  }

  get role() { return Role.TECHNICIAN; }
  get skills() { return this.#skills; }
  get experience() { return this.#experience; }
  get maxWorkload() { return this.#maxWorkload; }
  get available() { return this.#available; }
  get title() { return this.#title; }

  hasSkill(category) { return this.#skills.includes(category); }
  acceptingWork() { return this.active && this.#available; }

  toJSON() {
    return {
      ...super.toJSON(),
      title: this.#title,
      skills: [...this.#skills],
      experience: this.#experience,
      maxWorkload: this.#maxWorkload,
      available: this.#available,
    };
  }
}

export class Administrator extends User {
  #title;
  constructor({ title = Titles.SYSTEM_ADMIN, ...base }) {
    super(base);
    this.#title = title;
  }
  get role() { return Role.ADMIN; }
  get title() { return this.#title; }
  toJSON() { return { ...super.toJSON(), title: this.#title }; }
}

// Automation actor (monitor, auto-assignment). Not a persisted account.
export class SystemActor extends User {
  constructor() { super({ id: 0, name: "System", email: "system@incident-desk.local" }); }
  get role() { return "System"; }
  get isSystem() { return true; }
  can() { return true; }
}

export const SYSTEM = new SystemActor();

// Factory: builds the right subclass from a stored record or request body.
export class UserFactory {
  static create(record) {
    const base = { id: record.id, name: record.name, email: record.email, active: record.active };
    switch (record.role) {
      case Role.EMPLOYEE:
        return new Employee(base);
      case Role.TECHNICIAN:
        return new Technician({
          ...base,
          skills: record.skills ?? [],
          experience: record.experience ?? 0,
          maxWorkload: record.maxWorkload ?? 5,
          available: record.available ?? true,
          title: record.title ?? Titles.TECHNICIAN,
        });
      case Role.ADMIN:
        return new Administrator({ ...base, title: record.title ?? Titles.SYSTEM_ADMIN });
      default:
        throw new ValidationError(`Unknown role: ${record.role}`);
    }
  }
}
