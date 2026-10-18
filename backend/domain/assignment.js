import { TechnicianUnavailableError, WorkloadExceededError } from "../errors.js";

// Strategy pattern for technician assignment.
// A candidate is: { technician, load, serviceExperience, skillMatch }
// and has already passed availability + capacity filtering.
export class AssignmentStrategy {
  get name() { throw new TypeError("Subclasses must define name."); }
  get label() { return this.name; }
  get description() { return ""; }
  select() { throw new TypeError("Subclasses must implement select()."); }
}

const byName = (a, b) => a.technician.name.localeCompare(b.technician.name);
const pick = (list, compare) => [...list].sort((a, b) => compare(a, b) || byName(a, b))[0] ?? null;

export class SkillBasedStrategy extends AssignmentStrategy {
  get name() { return "skill"; }
  get label() { return "Skill based"; }
  get description() { return "Specialist with the matching skill, preferring the narrowest skill set and then the lighter workload."; }
  select(candidates) {
    return pick(candidates.filter((c) => c.skillMatch), (a, b) =>
      a.technician.skills.length - b.technician.skills.length || a.load - b.load);
  }
}

export class LoadBasedStrategy extends AssignmentStrategy {
  get name() { return "load"; }
  get label() { return "Least loaded"; }
  get description() { return "Technician with the fewest active incidents, preferring those with the matching skill."; }
  select(candidates) {
    const skilled = candidates.filter((c) => c.skillMatch);
    return pick(skilled.length ? skilled : candidates, (a, b) => a.load - b.load);
  }
}

export class ExperienceBasedStrategy extends AssignmentStrategy {
  get name() { return "experience"; }
  get label() { return "Experience based"; }
  get description() { return "Most experienced matching technician, weighting prior work on the same service; P1/P2 incidents weigh experience double."; }
  select(candidates, { incident }) {
    const weight = ["P1", "P2"].includes(incident.priority) ? 2 : 1;
    const score = (c) => c.technician.experience * weight + c.serviceExperience * 3;
    return pick(candidates.filter((c) => c.skillMatch), (a, b) => score(b) - score(a) || a.load - b.load);
  }
}

// Rotates through matching technicians; the cursor (last assigned id) is kept
// in a store so rotation survives restarts.
export class RoundRobinStrategy extends AssignmentStrategy {
  #cursor;
  constructor(cursor) { super(); this.#cursor = cursor; }
  get name() { return "round-robin"; }
  get label() { return "Round robin"; }
  get description() { return "Rotates through matching technicians so work is shared evenly over time."; }
  select(candidates) {
    const pool = [...candidates.filter((c) => c.skillMatch)].sort((a, b) => a.technician.id - b.technician.id);
    if (!pool.length) return null;
    const last = this.#cursor.get();
    const chosen = pool.find((c) => c.technician.id > last) ?? pool[0];
    this.#cursor.set(chosen.technician.id);
    return chosen;
  }
}

export class AssignmentEngine {
  #strategies = new Map();
  constructor(strategies) { for (const s of strategies) this.#strategies.set(s.name, s); }
  has(name) { return this.#strategies.has(name); }
  get(name) { return this.#strategies.get(name) ?? this.#strategies.get("skill"); }
  list() { return [...this.#strategies.values()].map(({ name, label, description }) => ({ name, label, description })); }

  // Throws a domain error that explains *why* nobody could be picked.
  choose(strategyName, candidates, context, everyone = candidates) {
    if (!candidates.length) {
      const pool = everyone.filter((c) => c.technician.acceptingWork());
      if (pool.length && pool.every((c) => c.load >= c.technician.maxWorkload)) {
        throw new WorkloadExceededError("Every available technician is at their maximum workload.");
      }
      throw new TechnicianUnavailableError("No technician is currently available.");
    }
    const chosen = this.get(strategyName).select(candidates, context);
    if (!chosen) throw new TechnicianUnavailableError(`No available technician has the ${context.incident.category} skill.`);
    return chosen;
  }
}
