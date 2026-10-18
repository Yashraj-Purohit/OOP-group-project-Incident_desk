import { AuthorizationError, InvalidTransitionError, ValidationError } from "../errors.js";

// State pattern: each lifecycle stage is an object that knows which stages may
// follow it and which permission an actor needs to trigger the move.
// "system" means the move is reserved for automation.
const SYSTEM_ONLY = "system";

export class IncidentState {
  constructor(name, transitions = {}, { active = true } = {}) {
    if (new.target === IncidentState) throw new TypeError("IncidentState is abstract.");
    this.name = name;
    this.transitions = Object.freeze({ ...transitions });
    this.active = active;
  }

  get next() {
    return Object.keys(this.transitions);
  }

  allows(target) {
    return Object.hasOwn(this.transitions, target);
  }

  assertCanMoveTo(target, actor) {
    if (!this.allows(target)) {
      throw new InvalidTransitionError(`An incident that is ${this.name} cannot move to ${target}.`, {
        from: this.name,
        to: target,
        allowed: this.next,
      });
    }
    const needed = this.transitions[target];
    const permitted = needed === SYSTEM_ONLY ? actor.isSystem : actor.can(needed);
    if (!permitted) {
      throw new AuthorizationError(`You are not allowed to move an incident from ${this.name} to ${target}.`);
    }
  }
}

class NewState extends IncidentState {
  constructor() { super("New", { Classified: SYSTEM_ONLY }); }
}
class ClassifiedState extends IncidentState {
  constructor() { super("Classified", { Assigned: "incident:assign" }); }
}
class AssignedState extends IncidentState {
  constructor() { super("Assigned", { Acknowledged: "incident:acknowledge" }); }
}
class AcknowledgedState extends IncidentState {
  constructor() { super("Acknowledged", { "In progress": "incident:investigate" }); }
}
class InProgressState extends IncidentState {
  constructor() { super("In progress", { Resolved: "incident:resolve" }); }
}
class ResolvedState extends IncidentState {
  constructor() {
    super("Resolved", { Verified: "incident:verify", "In progress": "incident:verify" }, { active: false });
  }
}
class VerifiedState extends IncidentState {
  constructor() { super("Verified", { Closed: "incident:close" }, { active: false }); }
}
class ClosedState extends IncidentState {
  constructor() { super("Closed", {}, { active: false }); }
}

const registry = new Map(
  [new NewState(), new ClassifiedState(), new AssignedState(), new AcknowledgedState(), new InProgressState(), new ResolvedState(), new VerifiedState(), new ClosedState()].map(
    (state) => [state.name, state],
  ),
);

export const IncidentStates = Object.freeze({
  names: [...registry.keys()],
  of(name) {
    const state = registry.get(name);
    if (!state) throw new ValidationError(`Unknown incident status: ${name}`);
    return state;
  },
  isActive(name) {
    return registry.get(name)?.active ?? false;
  },
  activeNames: [...registry.values()].filter((s) => s.active).map((s) => s.name),
});
