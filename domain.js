export const services = [
  {
    name: "Payment portal",
    category: "Application",
    criticality: 3,
    owner: "Applications team",
  },
  {
    name: "Campus Wi-Fi",
    category: "Network",
    criticality: 2,
    owner: "Network team",
  },
  {
    name: "Campus login",
    category: "Authentication",
    criticality: 3,
    owner: "Identity team",
  },
  {
    name: "Cloud storage",
    category: "Cloud",
    criticality: 2,
    owner: "Infrastructure team",
  },
  {
    name: "Office workstation",
    category: "Hardware",
    criticality: 1,
    owner: "Desktop support",
  },
];
export const technicians = [
  {
    name: "Asha Mehta",
    skills: ["Application", "Authentication"],
    available: true,
  },
  { name: "Ravi Kumar", skills: ["Network", "Cloud"], available: true },
  {
    name: "Neha Shah",
    skills: ["Hardware", "Application", "Cloud"],
    available: true,
  },
];
export const targets = {
  P1: { response: 5, resolution: 30 },
  P2: { response: 15, resolution: 120 },
  P3: { response: 60, resolution: 480 },
  P4: { response: 240, resolution: 1440 },
};
export const active = (i) =>
  !["Resolved", "Verified", "Closed"].includes(i.status);

export function reviewProposal(incident, role, reviewer, decision, note, now) {
  if (role !== "Technician" || reviewer !== incident.technician) {
    throw Error("Only the assigned technician can review this proposal.");
  }
  const proposal = incident.proposal;
  if (!proposal?.text) {
    throw Error("This incident has no improvement proposal.");
  }
  const allowed = {
    Proposed: ["Accepted", "Declined"],
    Accepted: ["Implemented"],
  };
  if (!allowed[proposal.status]?.includes(decision)) {
    throw Error("This proposal decision is not available.");
  }
  Object.assign(proposal, {
    status: decision,
    reviewer,
    note: String(note || "").trim(),
    reviewedAt: now,
  });
  return proposal;
}

export function priority(impact, urgency, criticality) {
  const score = Number(impact) * Number(urgency) * Number(criticality);
  return score >= 18 ? "P1" : score >= 9 ? "P2" : score >= 4 ? "P3" : "P4";
}

export function assign(category, incidents, strategy, team = technicians) {
  const eligible = team.filter(
    (t) => t.available && t.skills.includes(category),
  );
  const load = (t) =>
    incidents.filter((i) => i.technician === t.name && active(i)).length;
  eligible.sort((a, b) =>
    strategy === "Least loaded"
      ? load(a) - load(b) || a.name.localeCompare(b.name)
      : a.skills.length - b.skills.length ||
        load(a) - load(b) ||
        a.name.localeCompare(b.name),
  );
  return eligible[0]?.name || null;
}
const transitions = {
  Assigned: "Acknowledged",
  Acknowledged: "In progress",
  "In progress": "Resolved",
  Resolved: "Verified",
  Verified: "Closed",
};

export function nextStatus(incident, role) {
  if (role === "Employee") {
    return incident.status === "Resolved" ? "Verified" : null;
  }
  return transitions[incident.status] || null;
}

export function transition(incident, role, note, now) {
  const next = nextStatus(incident, role);
  if (!next) {
    throw Error("This action is not available for this role or status.");
  }
  if (next === "Resolved" && !note.trim()) {
    throw Error("Add resolution details before resolving.");
  }
  incident.status = next;
  if (next === "Acknowledged") {
    incident.acknowledged = now;
  }
  if (next === "Resolved") {
    incident.resolution = note.trim();
    incident.resolved = now;
  }
  return next;
}

export function sla(i, now, policies = targets) {
  const policy = policies[i.priority];
  const responseDue = i.created + policy.response * 60000;
  const resolutionDue = i.created + policy.resolution * 60000;
  const responseBreached = (i.acknowledged ?? now) > responseDue;
  const resolutionBreached = (i.resolved ?? now) > resolutionDue;
  const remaining = Math.ceil((resolutionDue - (i.resolved ?? now)) / 60000);
  return {
    responseDue,
    resolutionDue,
    responseBreached,
    resolutionBreached,
    remaining,
    label:
      responseBreached || resolutionBreached
        ? "Breached"
        : !active(i)
          ? "Met"
          : remaining <= policy.resolution * 0.25
            ? "At risk"
            : "On track",
  };
}

export function duplicates(title, service, incidents) {
  const words = (s) => new Set(s.toLowerCase().match(/[a-z]{3,}/g) || []);
  const a = words(title);
  return incidents
    .filter((i) => active(i) && i.service === service)
    .map((i) => {
      const b = words(i.title);
      return {
        ...i,
        similarity:
          [...a].filter((w) => b.has(w)).length /
          Math.max(1, Math.min(a.size, b.size)),
      };
    })
    .filter((i) => i.similarity >= 0.34)
    .sort((a, b) => b.similarity - a.similarity);
}

export function seed(now = Date.now()) {
  const rows = [
    [
      "Payment portal unavailable",
      "Payment portal",
      3,
      3,
      "In progress",
      "Asha Mehta",
      22,
      "Ananya Rao",
    ],
    [
      "Campus Wi-Fi keeps disconnecting",
      "Campus Wi-Fi",
      3,
      2,
      "Assigned",
      "Ravi Kumar",
      8,
      "Ananya Rao",
    ],
    [
      "Unable to reset my password",
      "Campus login",
      1,
      2,
      "Acknowledged",
      "Asha Mehta",
      35,
      "Dev Patel",
    ],
    [
      "Shared drive not syncing",
      "Cloud storage",
      2,
      2,
      "In progress",
      "Neha Shah",
      100,
      "Ananya Rao",
    ],
    [
      "Monitor flickers after startup",
      "Office workstation",
      1,
      1,
      "Assigned",
      "Neha Shah",
      50,
      "Sara Thomas",
    ],
    [
      "Login fails for faculty accounts",
      "Campus login",
      3,
      3,
      "Assigned",
      "Asha Mehta",
      7,
      "Dev Patel",
    ],
    [
      "Projector workstation is slow",
      "Office workstation",
      1,
      2,
      "Resolved",
      "Neha Shah",
      140,
      "Ananya Rao",
    ],
    [
      "Cloud folder access restored",
      "Cloud storage",
      1,
      1,
      "Closed",
      "Ravi Kumar",
      180,
      "Sara Thomas",
    ],
  ];
  return {
    version: 1,
    offset: 0,
    strategy: "Skill based",
    policies: structuredClone(targets),
    incidents: rows.map((r, n) => {
      const [
        title,
        service,
        impact,
        urgency,
        status,
        technician,
        age,
        reporter,
      ] = r;
      const s = services.find((s) => s.name === service);
      const created = now - age * 60000;
      return {
        id: 1024 + n,
        title,
        service,
        category: s.category,
        impact,
        urgency,
        priority: priority(impact, urgency, s.criticality),
        status,
        technician,
        reporter,
        description:
          n === 0
            ? "The payment portal is returning a database connection error. Multiple departments cannot complete transactions."
            : "Reported issue affecting " +
              service +
              ". Please investigate and help restore normal service.",
        created,
        acknowledged: ["Assigned"].includes(status)
          ? null
          : created + 2 * 60000,
        resolved: ["Resolved", "Closed"].includes(status)
          ? created + 20 * 60000
          : null,
        resolution: ["Resolved", "Closed"].includes(status)
          ? "Service restored after applying configuration updates and validating with the reporter."
          : "",
        escalated: false,
        notes:
          n === 0
            ? [
                {
                  author: "Asha Mehta",
                  text: "Investigating database connection pool saturation.",
                  internal: false,
                  time: now - 3 * 60000,
                },
              ]
            : [],
        history: [
          { time: created, actor: reporter, text: "Incident reported" },
          {
            time: created + 1000,
            actor: "System",
            text:
              "Classified as " + s.category + " and assigned to " + technician,
          },
        ],
      };
    }),
    notifications: [
      {
        title: "Critical incident needs attention",
        text: "INC-1029 has passed its response deadline.",
        time: now,
        audience: "Administrator",
        channel: "In-app",
      },
    ],
  };
}
