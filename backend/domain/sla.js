import { MissingSlaConfigError } from "../errors.js";
import { minutes } from "../util.js";

export class SlaPolicy {
  constructor({ id, serviceId = null, priority, responseMinutes, resolutionMinutes }) {
    Object.assign(this, { id, serviceId, priority, responseMinutes, resolutionMinutes });
    Object.freeze(this);
  }
}

// Picks the service-specific policy when one exists, otherwise the default.
export class SlaResolver {
  constructor(policyRepository) { this.policies = policyRepository; }
  find(serviceId, priority) {
    const policy = this.policies.find(serviceId, priority);
    if (!policy) {
      throw new MissingSlaConfigError(`No SLA policy is configured for priority ${priority}.`, { serviceId, priority });
    }
    return policy;
  }
  deadlines(createdAt, policy) {
    return {
      responseDue: createdAt + minutes(policy.responseMinutes),
      resolutionDue: createdAt + minutes(policy.resolutionMinutes),
    };
  }
}

// Evaluates an incident against its stored deadlines.
export class SlaTracker {
  constructor({ warningRatio = 0.25 } = {}) { this.warningRatio = warningRatio; }

  evaluate(i, now) {
    const responseEnd = i.acknowledgedAt ?? (i.active || !i.resolvedAt ? now : i.resolvedAt);
    const resolutionEnd = i.resolvedAt ?? now;
    const responseBreached = responseEnd > i.responseDue;
    const resolutionBreached = resolutionEnd > i.resolutionDue;
    const remainingMs = i.resolutionDue - resolutionEnd;
    const responseWindow = i.responseDue - i.createdAt;
    const resolutionWindow = i.resolutionDue - i.createdAt;
    const responseAtRisk = !i.acknowledgedAt && i.active && i.responseDue - now <= responseWindow * this.warningRatio;
    const resolutionAtRisk = i.active && remainingMs <= resolutionWindow * this.warningRatio;
    const breached = responseBreached || resolutionBreached;
    const label = breached ? "Breached" : !i.active ? "Met" : responseAtRisk || resolutionAtRisk ? "At risk" : "On track";
    return {
      label, responseDue: i.responseDue, resolutionDue: i.resolutionDue,
      responseBreached, resolutionBreached, responseAtRisk, resolutionAtRisk,
      remainingMinutes: Math.ceil(remainingMs / 60000),
    };
  }
}
