import { similarity, tokenize } from "./text.js";
import { Titles } from "../domain/roles.js";

// A. Duplicate detection / B. correlation -----------------------------------
export class DuplicateDetector {
  constructor({ threshold = 0.5, crossServiceThreshold = 0.75 } = {}) {
    this.threshold = threshold;
    this.crossServiceThreshold = crossServiceThreshold;
  }

  // candidates: [{ id, title, description, serviceId }] (active incidents)
  find({ title, description = "", serviceId }, candidates) {
    const probe = tokenize(`${title} ${title} ${description}`);
    const titleOnly = tokenize(title);
    return candidates
      .map((c) => {
        const score = Math.max(
          similarity(titleOnly, tokenize(c.title)),
          similarity(probe, tokenize(`${c.title} ${c.title} ${c.description ?? ""}`)),
        );
        return { ...c, score, sameService: c.serviceId === serviceId };
      })
      .filter((c) => c.score >= (c.sameService ? this.threshold : this.crossServiceThreshold))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
}

// Groups open incidents hitting the same service inside a time window.
export class IncidentCorrelator {
  constructor({ windowMinutes = 60, minimum = 3 } = {}) {
    this.windowMs = windowMinutes * 60000;
    this.minimum = minimum;
  }
  correlate(incidents) {
    const byService = new Map();
    for (const i of incidents) {
      if (!byService.has(i.serviceId)) byService.set(i.serviceId, []);
      byService.get(i.serviceId).push(i);
    }
    const clusters = [];
    for (const [serviceId, list] of byService) {
      const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt);
      let run = [];
      for (const i of sorted) {
        if (run.length && i.createdAt - run[run.length - 1].createdAt > this.windowMs) {
          if (run.length >= this.minimum) clusters.push(this.#cluster(serviceId, run));
          run = [];
        }
        run.push(i);
      }
      if (run.length >= this.minimum) clusters.push(this.#cluster(serviceId, run));
    }
    return clusters.sort((a, b) => b.incidents.length - a.incidents.length);
  }
  #cluster(serviceId, run) {
    return {
      serviceId,
      serviceName: run[0].serviceName,
      count: run.length,
      incidents: run.map((i) => ({ id: i.id, title: i.title, priority: i.priority })),
      firstReportedAt: run[0].createdAt,
      lastReportedAt: run[run.length - 1].createdAt,
      suggestion: `${run.length} related reports for ${run[0].serviceName}; investigate a shared root cause.`,
    };
  }
}

// F. Category suggestion ----------------------------------------------------
export class CategoryClassifier {
  // categories: [{ name, keywords: [] }]
  // `prefer` (usually the service's own category) breaks ties between equally
  // good keyword matches.
  suggest(title, description, categories, { prefer } = {}) {
    const tokens = tokenize(`${title} ${title} ${description ?? ""}`);
    return categories
      .map((c) => {
        const words = new Set(c.keywords.flatMap((k) => [...tokenize(k)]));
        let score = 0;
        for (const t of tokens) if (words.has(t)) score += 1;
        if (tokens.has(c.name.toLowerCase())) score += 1;
        if (score > 0 && c.name === prefer) score += 0.5;
        return { category: c.name, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  }
}

// C. Automatic escalation ----------------------------------------------------
export class EscalationPolicy {
  static LADDER = [Titles.TECHNICIAN, Titles.TEAM_LEAD, Titles.SYSTEM_ADMIN, Titles.IT_MANAGER];

  // Critical (P1/P2) incidents nobody acknowledged climb one level each time
  // another response window passes after the first deadline.
  levelFor(incident, now) {
    if (!["P1", "P2"].includes(incident.priority) || incident.acknowledgedAt || !incident.active) return 0;
    const window = Math.max(incident.responseDue - incident.createdAt, 60000);
    if (now <= incident.responseDue) return 0;
    const steps = 1 + Math.floor((now - incident.responseDue) / window);
    return Math.min(steps, EscalationPolicy.LADDER.length - 1);
  }
}

// E. SLA risk detection ---------------------------------------------------------
export class SlaRiskDetector {
  assess(incident, sla, technicianLoad = 0, technicianCapacity = 5, now) {
    const reasons = [];
    let score = 0;
    const window = incident.resolutionDue - incident.createdAt;
    const elapsed = Math.min(1, Math.max(0, (now - incident.createdAt) / window));
    if (sla.label === "Breached") return { level: "breached", score: 1, reasons: ["SLA already breached"] };
    score += elapsed * 0.6;
    if (elapsed > 0.5) reasons.push(`${Math.round(elapsed * 100)}% of the resolution window used`);
    if (!incident.acknowledgedAt && incident.technicianId) {
      score += 0.2;
      reasons.push("Assigned technician has not acknowledged");
    }
    if (!incident.technicianId) {
      score += 0.25;
      reasons.push("No technician assigned");
    }
    if (incident.status === "Assigned" && elapsed > 0.4) score += 0.1;
    if (technicianCapacity && technicianLoad / technicianCapacity >= 0.8) {
      score += 0.15;
      reasons.push("Technician is near maximum workload");
    }
    if (incident.awaitingInfo) {
      score += 0.1;
      reasons.push("Waiting on information from reporter");
    }
    score = Math.min(1, Math.round(score * 100) / 100);
    return { level: score >= 0.7 ? "high" : score >= 0.45 ? "medium" : "low", score, reasons };
  }
}

// G. Suggested resolution ----------------------------------------------------------
export class ResolutionSuggester {
  suggest({ title, description, category }, history, limit = 3) {
    const probe = tokenize(`${title} ${description ?? ""}`);
    return history
      .filter((h) => h.resolution)
      .map((h) => ({
        incidentId: h.id,
        title: h.title,
        resolution: h.resolution,
        score: similarity(probe, tokenize(`${h.title} ${h.description ?? ""}`)) + (h.category === category ? 0.1 : 0),
      }))
      .filter((h) => h.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((h) => ({ ...h, score: Math.round(h.score * 100) / 100 }));
  }
}
