# OOP group project: Incident_desk

An interactive IT service management prototype for our OOP group project, with incident workflows, employee/technician/admin views, improvement proposals, and a café-themed light/dark interface.

## Quick start

Requires Node.js 18 or newer. Clone this repository, open a terminal in the cloned directory, and run:

```sh
npm start
```

Visit **http://localhost:4173**. No package installation, database setup, or API key is needed for this prototype. Use **Preview as** to switch roles. To run the logic checks:

```sh
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the file guide, branch/pull request workflow, and private-repository access instructions. Each member runs their own localhost server; the localhost URL does not provide remote access to someone else's computer.

## Local review prototype

A clickable model for the OOP I-ITSM project. No additional package installation or external API keys are needed. Run `node server.js` in this directory, then visit http://localhost:4173. The server binds to this computer only. Use Node 18 or newer. Run `node --test domain.test.js` for domain checks.

## Terminal interface

Open **Terminal** in the sidebar or visit **http://localhost:4173/#terminal**. Its command reference and `help` output adapt to your current role: employees see their submitted incidents, technicians see their assigned queue, and administrators see organization-wide incidents. The reference also lists identity/help commands and the report controls available at each step. Try:

```text
report
list --mine
list --priority P1
view INC-1024
services
help
```

`report` guides you through the title, service, impact, urgency, description, and optional improvement proposal. It shows a preview with priority, assignment, and duplicate suggestions, then waits for `submit`. Use `back` to revisit a field, `edit` at the preview to start revising, or `cancel` to discard the draft. Up/down arrows recall earlier terminal entries. Use `role employee`, `role technician`, or `role admin` to switch the demo identity.

To use the real command line, keep the server running and open another terminal in this project folder:

```sh
npm run cli
```

Or run a single query:

```sh
npm run cli -- list --mine
npm run cli -- view INC-1024
npm run cli -- report
```

To make `incidentdesk` available from any folder, run this once from the project directory (requires a working Node.js/npm installation):

```sh
npm link
```

Then, while the localhost server is running, you can use your normal shell directly:

```sh
incidentdesk report
incidentdesk list --mine
incidentdesk view INC-1024
incidentdesk whoami
```

Or run `incidentdesk` without arguments for the interactive prompt. Inside that prompt, use the same bare commands as the browser Terminal: `report`, `list`, `view`, and `whoami`. In your ordinary shell, prefix them with `incidentdesk` so they are routed to this app. `npm link` registers a command locally; it does not publish this private package to npm. Use `npm unlink -g incident-desk-prototype` to unregister it.

The CLI currently connects to a localhost server on the same computer. A real organizational rollout will need a shared deployed API, authentication, and secure remote connectivity.

The CLI defaults to Employee (Ananya Rao). Type `exit` to leave its interactive session. These are Incident Desk commands, not operating-system shell commands. No shell execution or log uploads are included.

## Shared localhost data

The website and terminal now use one local HTTP API, backed by `.local-data/incidents.json`. This file is ignored by Git. Reports created in either interface are visible in the other. UI pages check for external updates roughly every 2.5 seconds while idle. Existing browser data is imported on the first web connection when the server store is still uninitialized; after that, server data takes precedence. The browser retains a backup and stores the appearance preference. Concurrent writes are serialized, and stale UI saves are rejected instead of overwriting newer incidents.

Each group member still runs a separate local server. Data is shared between interfaces connected to that server, not automatically between computers or through GitHub. An actual deployment will need real authentication and server-enforced roles. The current role selector and terminal role command simulate identities for review.

## Try these workflows

1. Switch to **Employee** (Ananya Rao), report a payment incident, and review the duplicate suggestion and calculated priority.
2. Switch to **Administrator**, open the incident, and inspect or change its assignment. The Technician preview represents **Asha Mehta**; assign an Application or Authentication incident to her to try her queue.
3. Switch to **Technician**, acknowledge the incident, start investigation, add notes, and provide resolution details.
4. Switch to **Employee** to verify the resolution, then Administrator to close it. The employee can leave feedback after closure.
5. As Administrator, open **SLA & assignment**, change assignment strategies, or advance the demo clock to trigger SLA escalation. Check Notifications and Audit log.

## Scope

The café palette supports light and dark appearances. The compact sun/moon switch in the top bar remembers your choice. Incident reports also include an optional **Suggested improvement**. The assigned technician can accept or decline it with a note, then mark accepted work as implemented. These decisions appear in the incident, audit timeline, and notification log; accepting a proposal does not claim the change has already been made. Existing incidents and browser data remain compatible.

This is a local Node.js prototype for design review, not the final Spring Boot/React/PostgreSQL implementation. Role switching simulates different users; it is not authentication or a security boundary. Incident data, policies, audit events and notifications are persisted by the localhost server in a local JSON file, with a browser backup. Use **Reset demo** to restore sample data. Existing notes are escaped before display. Internal notes are hidden from the Employee view, but all demo data remains inspectable through the local prototype API and data file. The simulated email log never sends real email. SLA checks run while the page is open and on reload, not in a background service. Targets use elapsed time; SLA configuration changes apply retroactively in this prototype. Service attention uses incident counts, not live infrastructure monitoring. Technician availability and service metadata are seeded read-only for this review. Domain logic is isolated for the later backend design. A system font fallback works if Google Fonts is unavailable.

## Repository references

Original prototype code; no repository source was copied or incorporated. Public repository documentation informed the following features:

- https://github.com/Combodo/iTop — service/incident relationships, configurable SLA management, and incident workflow concepts.
- https://github.com/alfahami/it-support-ticket-system — employee/support ownership, comments, and incident auditing.
- https://github.com/Vickey-33/ai-it-helpdesk — role-specific dashboards, automated classification ideas, and the knowledge base experience.

The assignment strategies, priority thresholds, prototype UI, and duplicate matching are our own simplified implementations. Duplicate suggestions use title token overlap within the same service. Skill-based assignment prefers eligible specialists; load-based assignment selects the least busy eligible technician. A real deployment will require server-side authentication, authorization, durable database transactions, background scheduling, and notification delivery.
