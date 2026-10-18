# OOP group project: Incident Desk

An IT service management system (I-ITSM) for the OOP group project: incident reporting, prioritisation, technician assignment, SLA monitoring, escalation, notifications, audit trail and reporting, with employee, technician and administrator views in an 8-bit light/dark interface.

## Quick start

Requires **Node.js 22.13 or newer** (the database is Node's built-in SQLite; there is nothing to install). In the cloned folder run:

```sh
npm start
```

Open **http://localhost:4173** and sign in. The first start creates `.local-data/incident-desk.sqlite` with demo accounts and sample incidents (delete the folder to start over).

| Role | Sign in as | What you can do |
|---|---|---|
| Employee | `jordan@incidentdesk.test`, `maya@incidentdesk.test` | Report and track incidents, answer questions, verify fixes, leave feedback |
| Technician | `asha@`, `ravi@`, `neha@`, `lead@` (Team Lead) `incidentdesk.test` | Work an assigned queue, request information, resolve, review improvement proposals |
| Administrator | `admin@` (System Administrator), `manager@` (IT Manager) `incidentdesk.test` | Everything: assign, users, services, categories, SLA policies, strategies, reports, audit log |

The shared demo password is in [`backend/seed.js`](backend/seed.js) (override it with `INCIDENT_DESK_DEMO_PASSWORD`). New people can also **Register**; self-registered accounts are always Employees.

```sh
npm test            # 51 tests: domain rules, services, HTTP API, terminal, UI views
npm run cli         # sign-in prompt, then the same command line as the Terminal page
```

## What it does

* **Lifecycle:** New → Classified → Assigned → Acknowledged → In progress → Resolved → Verified → Closed, enforced by State objects (a technician cannot close a new incident; a reporter can reject a resolution).
* **Priority:** impact × urgency × business criticality, scaled by people affected → P1–P4. Strategy is selectable by an administrator.
* **Assignment:** skill based, least loaded, experience based, round robin; honours availability and maximum workload.
* **SLA:** per-priority targets with per-service overrides, warnings before deadlines, recorded violations, **automatic escalation** Technician → Team Lead → System Administrator → IT Manager. The *SLA & assignment* page has a demo clock to show this live.
* **Intelligent features:** duplicate detection, incident correlation, SLA risk, technician recommendation, category suggestion, suggested resolutions.
* **Notifications:** in-app plus simulated email (an outbox, nothing leaves your computer).
* **Audit trail** of every action with previous and new state, **search** by id/text/status/priority/category/service/technician/SLA/date, **reports** and CSV export.
* **Improvement proposals:** reporters can suggest a change; the assigned technician accepts, declines or marks it implemented.
* **Terminal:** `report`, `list`, `view` from the browser (*Terminal* page) or your own shell (`npm run cli`).

See [backend/README.md](backend/README.md) for the architecture, design patterns and API, and [CONTRIBUTING.md](CONTRIBUTING.md) for the file guide and workflow.
