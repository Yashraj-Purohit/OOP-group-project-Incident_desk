// Shared command interface for the browser terminal and the real Node.js CLI.
// Commands call our API; they never execute operating-system shell commands.
// One catalog supplies both the sidebar and the CLI help output.
// Only commands that are actually implemented are included here.
export function getCommandReference(role) {
  const queueDescriptions = {
    Employee: "List your submitted incidents",
    Technician: "List incidents assigned to you",
    Administrator: "List all incidents across the organization",
  };
  const viewDescriptions = {
    Employee: "Read one of your incidents, its updates, and SLA status",
    Technician:
      "Read an assigned incident, investigation notes, and SLA status",
    Administrator: "Read any incident, its assignment, updates, and SLA status",
  };
  if (!queueDescriptions[role]) {
    throw Error("Unknown preview role.");
  }

  const reporting = {
    title: "Report an incident",
    commands: [
      {
        syntax: "report",
        input: "report",
        description: "Report an incident and optionally suggest an improvement",
      },
      {
        syntax: "services",
        input: "services",
        description: "List the services you can report an issue for",
      },
    ],
  };
  const queue = {
    title:
      role === "Employee"
        ? "My incidents"
        : role === "Technician"
          ? "My assigned queue"
          : "Incident oversight",
    commands: [
      { syntax: "list", input: "list", description: queueDescriptions[role] },
      {
        syntax: "list --priority P1",
        input: "list --priority P1",
        description:
          role === "Employee"
            ? "Filter your incidents by priority (P1, P2, P3, or P4)"
            : role === "Technician"
              ? "Filter your assigned queue by priority (P1–P4)"
              : "Filter all incidents by priority (P1–P4)",
      },
      {
        syntax: "view <incident-id>",
        input: "view ",
        description: viewDescriptions[role] + "; for example, view INC-1024",
      },
    ],
  };
  if (role === "Employee" || role === "Administrator") {
    queue.commands.splice(1, 0, {
      syntax: "list --mine",
      input: "list --mine",
      description:
        role === "Employee"
          ? "Explicitly list incidents you reported"
          : "Show incidents you personally reported rather than the full queue",
    });
  }
  const controls = {
    title: "While reporting",
    commands: [
      {
        syntax: "back",
        input: "back",
        description: "Return to the previous report field",
        context: "draft",
      },
      {
        syntax: "cancel",
        input: "cancel",
        description: "Discard the draft without creating an incident",
        context: "draft",
      },
      {
        syntax: "edit",
        input: "edit",
        description: "At the review step, revise the report from its title",
        context: "review",
      },
      {
        syntax: "submit",
        input: "submit",
        description: "At the review step, confirm and create the incident",
        context: "review",
      },
    ],
  };
  const session = {
    title: "Session & help",
    commands: [
      {
        syntax: "whoami",
        input: "whoami",
        description: "Show your current role and name",
      },
      {
        syntax: "help",
        input: "help",
        description: "Show the command reference for your current role",
      },
      {
        syntax: "clear",
        input: "clear",
        description: "Clear the transcript without deleting any incidents",
      },
    ],
  };
  const preview = {
    title: "Demo role switching",
    commands: [
      {
        syntax: "role employee",
        input: "role employee",
        description: "Preview the Employee identity (Ananya Rao)",
      },
      {
        syntax: "role technician",
        input: "role technician",
        description: "Preview the Technician identity (Asha Mehta)",
      },
      {
        syntax: "role admin",
        input: "role admin",
        description: "Preview the Administrator identity (Arjun Nair)",
      },
    ],
  };
  return {
    title: role + " commands",
    sections:
      role === "Employee"
        ? [reporting, queue, controls, session, preview]
        : [queue, reporting, controls, session, preview],
  };
}

export function getHelp(role) {
  const reference = getCommandReference(role);
  const groups = reference.sections.map(
    (section) =>
      section.title +
      "\n" +
      section.commands
        .map(
          (command) => "  " + command.syntax + "\n    " + command.description,
        )
        .join("\n"),
  );
  return (
    reference.title +
    "\n\n" +
    groups.join("\n\n") +
    "\n\nCombine --mine and --priority when needed. Commands respect the selected role’s visible queue.\nRoles are demo identities, not authenticated logins."
  );
}

export function safeText(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
}

const fields = [
  "title",
  "service",
  "impact",
  "urgency",
  "description",
  "proposal",
];
const prompts = [
  "Short title (5–150 characters):",
  "Service (enter a number or exact service name):",
  "Impact: 1 = one person, 2 = department, 3 = organization:",
  "Urgency: 1 = can wait, 2 = work affected, 3 = work stopped:",
  "What happened? (10–5000 characters):",
  "Suggested improvement (optional, press Enter to skip):",
];
const identities = {
  Employee: "Ananya Rao",
  Technician: "Asha Mehta",
  Administrator: "Arjun Nair",
};

export class TerminalSession {
  constructor(api, role = "Employee") {
    this.api = api;
    this.role = role;
    this.report = null;
    this.step = 0;
    this.serviceList = [];
    this.entries = [
      {
        kind: "output",
        text: "INCIDENT DESK / COMMAND LINE\nShared with your incident dashboard. Type help or report to begin.",
      },
    ];
  }

  get context() {
    if (!this.report) return "command";
    return this.step === fields.length ? "review" : "draft";
  }

  get prompt() {
    return this.report
      ? this.step === fields.length
        ? "review ❯"
        : fields[this.step] + " ❯"
      : "incidentdesk ❯";
  }

  write(text, kind = "output") {
    this.entries.push({ kind, text: safeText(text) });
    if (this.entries.length > 160) {
      this.entries.splice(0, this.entries.length - 160);
    }
  }

  setRole(role) {
    if (role === this.role) {
      return;
    }
    this.role = role;
    this.report = null;
    this.write(
      `Preview role: ${role} · ${identities[role]}. Any unfinished report was cancelled.`,
    );
  }

  ask() {
    if (this.step === 1) {
      this.write(
        this.serviceList
          .map((service, index) => `${index + 1}. ${service.name}`)
          .join("\n"),
      );
    }
    this.write(prompts[this.step]);
  }

  async send(line) {
    const text = line.trim();
    this.write(this.prompt + " " + line, "input");
    try {
      if (text.toLowerCase() === "cancel") {
        this.report = null;
        this.write("Report cancelled. No incident was submitted.");
        return;
      }
      if (this.report) {
        return await this.answer(text);
      }
      const words = text.split(/\s+/);
      if (words[0] === "incidentdesk") {
        words.shift();
      }
      const name = (words.shift() || "").toLowerCase();
      const command = ["--help", "-h"].includes(name) ? "help" : name;
      if (!command) {
        return;
      }
      if (command === "help") {
        return this.write(getHelp(this.role));
      }
      if (command === "clear") {
        this.entries = [];
        return;
      }
      if (command === "whoami") {
        return this.write(
          `${this.role} · ${identities[this.role]} (demo role)`,
        );
      }
      if (command === "role") {
        const role = {
          employee: "Employee",
          technician: "Technician",
          admin: "Administrator",
          administrator: "Administrator",
        }[words[0]?.toLowerCase()];
        if (!role || words.length !== 1) {
          throw Error("Use role employee, role technician, or role admin.");
        }
        this.setRole(role);
        return;
      }
      if (command === "report") {
        if (words.length) {
          throw Error(
            "Use report without arguments to open the interactive form.",
          );
        }
        this.serviceList = await this.api({
          action: "services",
          role: this.role,
        });
        this.report = {};
        this.step = 0;
        this.write(
          "New incident · type cancel to stop or back to revise a field.",
        );
        this.ask();
        return;
      }
      if (command === "services") {
        const services = await this.api({
          action: "services",
          role: this.role,
        });
        return this.write(
          services
            .map(
              (service, index) =>
                `${index + 1}. ${service.name} · ${service.category}`,
            )
            .join("\n"),
        );
      }
      if (command === "list") {
        let mine = false;
        let priority;
        while (words.length) {
          const flag = words.shift();
          if (flag === "--mine") {
            mine = true;
          } else if (flag === "--priority") {
            priority = words.shift()?.toUpperCase();
            if (!["P1", "P2", "P3", "P4"].includes(priority)) {
              throw Error("Use --priority P1, P2, P3, or P4.");
            }
          } else {
            throw Error("Unknown list option. Use list --mine --priority P1.");
          }
        }
        const incidents = await this.api({
          action: "list",
          role: this.role,
          mine,
          priority,
        });
        return this.write(
          incidents.length
            ? incidents
                .map(
                  (incident) =>
                    `INC-${incident.id}  ${incident.priority}  ${incident.status}\n  ${incident.title}\n  Assigned: ${incident.technician || "Unassigned"}`,
                )
                .join("\n\n")
            : "No incidents match this query.",
        );
      }
      if (command === "view") {
        if (words.length !== 1 || !/^(INC-)?\d+$/i.test(words[0])) {
          throw Error("Usage: view INC-1024");
        }
        const incident = await this.api({
          action: "view",
          id: words[0],
          role: this.role,
        });
        let output = `INC-${incident.id} · ${incident.title}\n${incident.priority} / ${incident.status} / SLA: ${incident.sla.label}\nService: ${incident.service}\nReported by: ${incident.reporter}\nAssigned: ${incident.technician}\n\n${incident.description}`;
        if (incident.proposal) {
          output += `\n\nSuggested improvement (${incident.proposal.status}):\n${incident.proposal.text}${incident.proposal.note ? "\nTechnician note: " + incident.proposal.note : ""}`;
        }
        if (incident.resolution) {
          output += "\n\nResolution: " + incident.resolution;
        }
        if (incident.notes.length) {
          output +=
            "\n\nUpdates:\n" +
            incident.notes
              .map((note) => `${note.author}: ${note.text}`)
              .join("\n");
        }
        return this.write(output);
      }
      throw Error(
        "Unknown command. Type help to see available commands. This is not a system shell.",
      );
    } catch (error) {
      this.write(error.message, "error");
    }
  }

  async answer(text) {
    if (text.toLowerCase() === "back") {
      this.step = Math.max(0, this.step - 1);
      this.ask();
      return;
    }
    if (this.step === fields.length) {
      if (text.toLowerCase() === "edit") {
        this.step = 0;
        this.ask();
        return;
      }
      if (text.toLowerCase() !== "submit") {
        throw Error(
          "Type submit to create this incident, edit to revise it, or cancel.",
        );
      }
      const incident = await this.api({
        action: "create",
        role: this.role,
        report: this.report,
      });
      this.report = null;
      this.write(
        `Created INC-${incident.id} · ${incident.priority}\nAssigned to ${incident.technician}.\nYour incident is now visible in the dashboard.\nTry: view INC-${incident.id}`,
        "success",
      );
      return;
    }
    const field = fields[this.step];
    if (field === "title" && (text.length < 5 || text.length > 150)) {
      throw Error("Enter a title with 5–150 characters.");
    }
    if (field === "description" && (text.length < 10 || text.length > 5000)) {
      throw Error("Enter a description with 10–5000 characters.");
    }
    if (field === "proposal" && text.length > 2000) {
      throw Error("Keep the suggestion under 2000 characters.");
    }
    let value = text;
    if (field === "service") {
      const service =
        this.serviceList.find(
          (service) => service.name.toLowerCase() === text.toLowerCase(),
        ) || (/^[1-5]$/.test(text) ? this.serviceList[Number(text) - 1] : null);
      if (!service) {
        throw Error(
          "Choose a service number or exact service name from the list.",
        );
      }
      value = service.name;
    }
    if (["impact", "urgency"].includes(field)) {
      if (!["1", "2", "3"].includes(text)) {
        throw Error("Enter 1, 2, or 3.");
      }
      value = Number(text);
    }
    this.report[field] = value;
    if (this.step === fields.length - 1) {
      const preview = await this.api({
        action: "preview",
        role: this.role,
        report: this.report,
      });
      this.step += 1;
      this.write(
        `REVIEW BEFORE SUBMISSION\nTitle: ${preview.title}\nService: ${preview.service}\nImpact: ${preview.impact} · Urgency: ${preview.urgency}\nDescription: ${preview.description}\nImprovement: ${preview.proposal || "None"}\nCalculated priority: ${preview.priority}\nRecommended technician: ${preview.technician}\n${preview.duplicates.length ? "Possible duplicates:\n" + preview.duplicates.map((incident) => `  INC-${incident.id}: ${incident.title}`).join("\n") : "No similar open incidents found."}\n\nType submit, edit, or cancel. Nothing has been created yet.`,
      );
    } else {
      this.step += 1;
      this.ask();
    }
  }
}
