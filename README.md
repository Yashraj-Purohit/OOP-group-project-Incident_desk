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

A clickable model for the OOP I-ITSM project. No installation or external API keys are needed. Run `node server.js` in this directory, then visit http://localhost:4173. The server binds to this computer only. Use Node 18 or newer. Run `node --test domain.test.js` for domain checks.

## Try these workflows

1. Switch to **Employee** (Ananya Rao), report a payment incident, and review the duplicate suggestion and calculated priority.
2. Switch to **Administrator**, open the incident, and inspect or change its assignment. The Technician preview represents **Asha Mehta**; assign an Application or Authentication incident to her to try her queue.
3. Switch to **Technician**, acknowledge the incident, start investigation, add notes, and provide resolution details.
4. Switch to **Employee** to verify the resolution, then Administrator to close it. The employee can leave feedback after closure.
5. As Administrator, open **SLA & assignment**, change assignment strategies, or advance the demo clock to trigger SLA escalation. Check Notifications and Audit log.

## Scope

The café palette supports light and dark appearances. The compact sun/moon switch in the top bar remembers your choice. Incident reports also include an optional **Suggested improvement**. The assigned technician can accept or decline it with a note, then mark accepted work as implemented. These decisions appear in the incident, audit timeline, and notification log; accepting a proposal does not claim the change has already been made. Existing incidents and browser data remain compatible.

This is a browser-local model for design review, not the final Spring Boot/React/PostgreSQL implementation. Role switching simulates different users; it is not authentication or a security boundary. Incident data, policies, audit events and notifications are stored in localStorage for this browser/origin. Use **Reset demo** to restore sample data. Existing notes are escaped before display. Internal notes are hidden from the Employee view, but all demo data remains inspectable in browser storage. The simulated email log never sends real email. SLA checks run while the page is open and on reload, not in a background service. Targets use elapsed time; SLA configuration changes apply retroactively in this prototype. Service attention uses incident counts, not live infrastructure monitoring. Technician availability and service metadata are seeded read-only for this review. Domain logic is isolated for the later backend design. A system font fallback works if Google Fonts is unavailable.

## Repository references

Original prototype code; no repository source was copied or incorporated. Public repository documentation informed the following features:

- https://github.com/Combodo/iTop — service/incident relationships, configurable SLA management, and incident workflow concepts.
- https://github.com/alfahami/it-support-ticket-system — employee/support ownership, comments, and incident auditing.
- https://github.com/Vickey-33/ai-it-helpdesk — role-specific dashboards, automated classification ideas, and the knowledge base experience.

The assignment strategies, priority thresholds, prototype UI, and duplicate matching are our own simplified implementations. Duplicate suggestions use title token overlap within the same service. Skill-based assignment prefers eligible specialists; load-based assignment selects the least busy eligible technician. A real deployment will require server-side authentication, authorization, durable database transactions, background scheduling, and notification delivery.
