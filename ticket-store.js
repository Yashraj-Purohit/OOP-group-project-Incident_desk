import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { services, seed, priority, assign, duplicates, sla } from "./domain.js";

export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateState(data) {
  if (
    data?.version !== 1 ||
    !Array.isArray(data.incidents) ||
    !Array.isArray(data.notifications)
  ) {
    throw new RequestError("Invalid incident data.");
  }
  if (
    !Number.isFinite(data.offset) ||
    !["Skill based", "Least loaded"].includes(data.strategy)
  ) {
    throw new RequestError("Invalid demo settings.");
  }
  for (const target of ["P1", "P2", "P3", "P4"]) {
    const policy = data.policies?.[target];
    if (
      !policy ||
      !Number.isFinite(policy.response) ||
      !Number.isFinite(policy.resolution) ||
      policy.response < 1 ||
      policy.resolution < policy.response
    ) {
      throw new RequestError("Invalid SLA settings.");
    }
  }
  const ids = new Set();
  for (const incident of data.incidents) {
    if (
      !Number.isInteger(incident.id) ||
      ids.has(incident.id) ||
      typeof incident.title !== "string" ||
      typeof incident.description !== "string" ||
      !Array.isArray(incident.history) ||
      !Array.isArray(incident.notes)
    ) {
      throw new RequestError("Invalid incident record.");
    }
    ids.add(incident.id);
  }
  return data;
}

function identity(role = "Employee") {
  const users = {
    Employee: "Ananya Rao",
    Technician: "Asha Mehta",
    Administrator: "Arjun Nair",
  };
  if (!users[role]) {
    throw new RequestError("Unknown preview role.");
  }
  return users[role];
}

export function visibleIncidents(data, role) {
  const user = identity(role);
  return data.incidents.filter((incident) => {
    if (role === "Employee") {
      return incident.reporter === user;
    }
    if (role === "Technician") {
      return incident.technician === user;
    }
    return true;
  });
}

function validateReport(report) {
  const title = String(report?.title || "").trim();
  const description = String(report?.description || "").trim();
  const proposal = String(report?.proposal || "").trim();
  const service = services.find((item) => item.name === report?.service);
  if (title.length < 5 || title.length > 150) {
    throw new RequestError("Title must contain 5–150 characters.");
  }
  if (description.length < 10 || description.length > 5000) {
    throw new RequestError("Description must contain 10–5000 characters.");
  }
  if (proposal.length > 2000) {
    throw new RequestError(
      "Suggested improvement must be under 2000 characters.",
    );
  }
  if (!service) {
    throw new RequestError("Choose a listed IT service.");
  }
  const impact = Number(report.impact);
  const urgency = Number(report.urgency);
  if (![1, 2, 3].includes(impact) || ![1, 2, 3].includes(urgency)) {
    throw new RequestError("Impact and urgency must be 1, 2, or 3.");
  }
  return { title, description, proposal, service, impact, urgency };
}

export class TicketStore {
  constructor(path) {
    this.path = path;
    this.record = { revision: 0, initialized: false, data: seed() };
    this.queue = Promise.resolve();
  }

  async load() {
    try {
      const record = JSON.parse(await readFile(this.path, "utf8"));
      validateState(record.data);
      if (!Number.isInteger(record.revision)) {
        throw new Error("Invalid store revision.");
      }
      this.record = record;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    return this;
  }

  snapshot() {
    return structuredClone(this.record);
  }

  // Queue writes and replace the file atomically. Failed writes keep the old state.
  mutate(update) {
    const operation = this.queue.then(async () => {
      const draft = this.snapshot();
      const result = update(draft);
      draft.revision += 1;
      draft.initialized = true;
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + ".tmp", JSON.stringify(draft), {
        mode: 0o600,
      });
      await rename(this.path + ".tmp", this.path);
      this.record = draft;
      return { ...this.snapshot(), result };
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async bootstrap(data) {
    if (this.record.initialized) {
      return this.snapshot();
    }
    return this.mutate((record) => {
      if (!record.initialized && data) {
        record.data = validateState(data);
      }
    });
  }

  replace(data, expectedRevision) {
    return this.mutate((record) => {
      if (record.revision !== expectedRevision) {
        throw new RequestError(
          "Another interface updated the incidents. Your screen has been refreshed; retry your last change.",
          409,
        );
      }
      record.data = validateState(data);
    });
  }

  preview(report, role) {
    const fields = validateReport(report);
    identity(role);
    return {
      ...fields,
      service: fields.service.name,
      category: fields.service.category,
      priority: priority(
        fields.impact,
        fields.urgency,
        fields.service.criticality,
      ),
      technician: assign(
        fields.service.category,
        this.record.data.incidents,
        this.record.data.strategy,
      ),
      duplicates: duplicates(
        fields.title,
        fields.service.name,
        visibleIncidents(this.record.data, role),
      ).map((incident) => ({ id: incident.id, title: incident.title })),
    };
  }

  create(report, role) {
    return this.mutate((record) => {
      const fields = validateReport(report);
      const reporter = identity(role);
      const data = record.data;
      const technician = assign(
        fields.service.category,
        data.incidents,
        data.strategy,
      );
      if (!technician) {
        throw new RequestError("No eligible technician is available.");
      }
      const created = Date.now() + data.offset;
      const incident = {
        id: Math.max(1023, ...data.incidents.map((item) => item.id)) + 1,
        title: fields.title,
        description: fields.description,
        service: fields.service.name,
        category: fields.service.category,
        impact: fields.impact,
        urgency: fields.urgency,
        priority: priority(
          fields.impact,
          fields.urgency,
          fields.service.criticality,
        ),
        reporter,
        technician,
        created,
        status: "Assigned",
        source: "Terminal",
        acknowledged: null,
        resolved: null,
        resolution: "",
        escalated: false,
        proposal: fields.proposal
          ? {
              text: fields.proposal,
              status: "Proposed",
              reviewer: null,
              note: "",
              reviewedAt: null,
            }
          : null,
        notes: [],
        history: [
          {
            time: created,
            actor: reporter,
            text: "Incident reported through terminal",
          },
          {
            time: created,
            actor: "System",
            text:
              "Classified and assigned to " +
              technician +
              " using " +
              data.strategy.toLowerCase(),
          },
        ],
      };
      if (incident.proposal) {
        incident.history.push({
          time: created,
          actor: reporter,
          text: "Improvement proposal submitted",
        });
      }
      data.incidents.unshift(incident);
      for (const channel of ["In-app", "Email simulation"]) {
        data.notifications.unshift({
          title: "Incident created through terminal",
          text: `INC-${incident.id} · ${incident.title}`,
          time: created,
          audience: reporter,
          technician,
          channel,
        });
      }
      return incident;
    });
  }
}

export async function terminalAction(store, input) {
  const role = input.role || "Employee";
  identity(role);
  const snapshot = store.snapshot();
  const incidents = visibleIncidents(snapshot.data, role);
  if (input.action === "services") {
    return services;
  }
  if (input.action === "preview") {
    return store.preview(input.report, role);
  }
  if (input.action === "create") {
    return (await store.create(input.report, role)).result;
  }
  if (input.action === "list") {
    if (input.priority && !["P1", "P2", "P3", "P4"].includes(input.priority)) {
      throw new RequestError("Priority must be P1, P2, P3, or P4.");
    }
    return incidents
      .filter(
        (incident) =>
          (!input.priority || incident.priority === input.priority) &&
          (!input.mine || incident.reporter === identity(role)),
      )
      .map((incident) => ({
        id: incident.id,
        title: incident.title,
        priority: incident.priority,
        status: incident.status,
        technician: incident.technician,
      }));
  }
  if (input.action === "view") {
    const incident = incidents.find(
      (item) => item.id === Number(String(input.id).replace(/^INC-/i, "")),
    );
    if (!incident) {
      throw new RequestError(
        "Incident not found in this role’s visible queue.",
        404,
      );
    }
    return {
      ...incident,
      notes: incident.notes.filter(
        (note) => role !== "Employee" || !note.internal,
      ),
      sla: sla(
        incident,
        Date.now() + snapshot.data.offset,
        snapshot.data.policies,
      ),
    };
  }
  throw new RequestError("Unknown terminal action.");
}
