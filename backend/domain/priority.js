// Strategy pattern for priority calculation.
// Input:  { impact 1-3, urgency 1-3, criticality 1-3, affectedUsers >= 1 }
// Output: { score, priority: "P1".."P4" }
export class PriorityStrategy {
  get name() { throw new TypeError("Subclasses must define name."); }
  get label() { return this.name; }
  get description() { return ""; }
  calculate() { throw new TypeError("Subclasses must implement calculate()."); }
}

const band = (score) => (score >= 18 ? "P1" : score >= 9 ? "P2" : score >= 4 ? "P3" : "P4");

// Score = Impact × Urgency × Business criticality, scaled by how many users
// are affected (1.0 up to 5 users, 1.25 up to 50, 1.5 beyond).
export class WeightedScoreStrategy extends PriorityStrategy {
  get name() { return "weighted"; }
  get label() { return "Weighted score"; }
  get description() {
    return "Impact × urgency × business criticality, multiplied by an affected-users factor. P1 ≥ 18, P2 ≥ 9, P3 ≥ 4, otherwise P4.";
  }
  calculate({ impact, urgency, criticality, affectedUsers = 1 }) {
    const factor = affectedUsers > 50 ? 1.5 : affectedUsers > 5 ? 1.25 : 1;
    const score = Math.round(impact * urgency * criticality * factor * 100) / 100;
    return { score, priority: band(score) };
  }
}

// Ordered business rules; the first matching rule decides, otherwise falls
// back to the weighted score.
export class RuleBasedStrategy extends PriorityStrategy {
  #fallback = new WeightedScoreStrategy();
  get name() { return "rules"; }
  get label() { return "Rule based"; }
  get description() {
    return "P1 when a critical service has high impact and urgency or more than 100 users are affected; P4 for low impact and urgency; otherwise weighted score.";
  }
  calculate(input) {
    const { impact, urgency, criticality, affectedUsers = 1 } = input;
    const weighted = this.#fallback.calculate(input);
    if ((criticality === 3 && impact === 3 && urgency >= 2) || affectedUsers > 100) {
      return { score: Math.max(weighted.score, 18), priority: "P1" };
    }
    if (impact === 1 && urgency === 1) return { score: weighted.score, priority: "P4" };
    return weighted;
  }
}

export class PriorityCalculator {
  #strategies = new Map();
  constructor(strategies = [new WeightedScoreStrategy(), new RuleBasedStrategy()]) {
    for (const s of strategies) this.#strategies.set(s.name, s);
  }
  get(name) { return this.#strategies.get(name) ?? this.#strategies.get("weighted"); }
  list() { return [...this.#strategies.values()].map(({ name, label, description }) => ({ name, label, description })); }
  has(name) { return this.#strategies.has(name); }
  register(strategy) { this.#strategies.set(strategy.name, strategy); }
}
