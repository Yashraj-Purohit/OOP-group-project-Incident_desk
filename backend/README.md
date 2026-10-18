# Incident Desk backend

Zero-dependency Node.js backend (ES modules, `node:http`, `node:sqlite`). It owns all business rules, persistence, authentication and authorization, and serves the web client from the same port.

```sh
npm start              # http://localhost:4173 (UI + API), SQLite file in .local-data/
npm run test:backend   # backend tests (domain, services, HTTP)
npm test               # everything, including terminal and UI view tests
```

Requires **Node 22.13+** (built-in SQLite). On first start it seeds categories, IT services, SLA policies, demo accounts and a few incidents. Demo logins are `admin@`, `manager@`, `lead@`, `asha@`, `ravi@`, `neha@`, `jordan@`, `maya@` + `incidentdesk.test`; the shared demo password lives in `backend/seed.js` (override with `INCIDENT_DESK_DEMO_PASSWORD`). Set `INCIDENT_DESK_DB` to change the database path, `PORT` to change the port and `INCIDENT_DESK_DEMO_DATA=0` to skip sample incidents.

## Layers

```
http/        routes.js, server.js     JSON API, bearer-token auth, error → status mapping
services/    IncidentService, AdminService, ReportService, SlaMonitor   use cases (transactions)
domain/      Incident, states, users, priority, assignment, sla         business rules, no I/O
intelligence/ text, analyzers                                         duplicate, correlation, category, escalation, risk, suggestions
notifications/ channels, observers                                    in-app + simulated e-mail, audit
persistence/ database.js, repositories.js                             SQLite + repository classes
auth/        auth.js                                                  scrypt passwords, sessions, throttling
container.js                                                          composition root (dependency injection)
```

## OOP concepts → code

| Requirement | Where |
|---|---|
| Encapsulation | `Incident` and `User` keep state in `#private` fields; changes only via guarded methods |
| Abstraction | `IncidentService`, `ReportService`, `AdminService` hide orchestration behind use-case methods |
| Inheritance (is-a) | `User` → `Employee`, `Technician`, `Administrator`, `SystemActor`; `IncidentState` → 8 states; `AppError` → 14 errors |
| Polymorphism | Interchangeable `AssignmentStrategy`, `PriorityStrategy`, `NotificationChannel`, `IncidentState` |
| Interfaces | Abstract bases that throw if not implemented: `AssignmentStrategy`, `PriorityStrategy`, `NotificationChannel`, `IncidentRepository`, `UserRepository` |
| Composition | `Incident` has a state object; services are composed of repositories, engine, bus (see `container.js`) |
| Association / aggregation | Incident ↔ reporter, technician, service, notes, audit, links; `PriorityCalculator`/`AssignmentEngine` aggregate strategies |
| Exceptions | `errors.js`: invalid transition, technician unavailable, workload exceeded, service not found, missing SLA, duplicate, persistence, … |
| Collections | `Map` registries (strategies, states, handlers), `Set` for tokens/permissions, indexed SQL queries |

## Design patterns

| Pattern | Use |
|---|---|
| **State** | `domain/states.js` – lifecycle stages know their legal next stages and required permission (New → Classified → Assigned → Acknowledged → In progress → Resolved → Verified → Closed; Resolved → In progress on rejection) |
| **Strategy** | Assignment (skill, least-loaded, experience, round-robin), priority (weighted score, rule based), notification channels; all switchable at runtime from admin settings |
| **Observer** | `events.js` `EventBus`; `AuditObserver` and `NotificationObserver` subscribe to every domain event |
| **Factory** | `UserFactory` (role → subclass), `ChannelFactory` (name → channel) |
| **Repository** | `persistence/repositories.js` – services never write SQL |
| **Adapter-style plug-ins** | `EmailChannel` simulates an external service behind the `NotificationChannel` contract |

## Requirement coverage

* **Priority** – score = impact × urgency × business criticality × affected-users factor (×1.25 above 5 users, ×1.5 above 50); P1 ≥ 18, P2 ≥ 9, P3 ≥ 4, else P4. Optional rule-based mode.
* **SLA** – policy per priority with optional per-service override (Payment portal P1 is 3/20 min). Deadlines are stamped at creation and re-based when priority changes. `SlaMonitor` (every 30 s, or `POST /api/admin/run-sla-monitor`) records warnings (last 25 % of a window) and violations exactly once, and escalates.
* **Intelligent features** – duplicate detection, incident correlation, automatic escalation (Technician → Team Lead → System Administrator → IT Manager), smart technician recommendation, SLA risk detection, category suggestion, suggested resolutions.
* **Audit** – every domain event is stored with timestamp, user, action, incident, previous state, new state and description.
* **Notifications** – in-app and simulated e-mail (stored in an outbox) for create, assign, priority change, SLA warning/violation, escalation, resolve, close and information requests.
* **Search** – id/text, status, priority, category, service, technician, reporter, SLA status, date range, open/closed, awaiting-info.
* **Persistence** – SQLite tables for users, services, categories, SLA policies, incidents, notes, links, audit log, notifications, SLA events, sessions and settings.

## Security

Scrypt-hashed passwords with a password policy; random 256-bit session tokens stored as SHA-256 hashes (8 h expiry, revoked on logout/password change/deactivation); login throttling (5 failures / 15 min); constant-time-ish login for unknown users; role permissions checked in the domain/services, not only in routes; employees can only see their own incidents (others return 404); JSON body size cap; same-origin and Host checks (DNS-rebinding protection); strict Content-Security-Policy with no inline scripts; all rendered text HTML-escaped; parameterised SQL only; self-registration always creates an Employee. Not implemented: HTTPS termination, CSRF tokens (bearer tokens are not cookies), persistent rate limiting.

## API (all JSON, `Authorization: Bearer <token>` except auth routes)

| Area | Routes |
|---|---|
| Auth | `POST /api/auth/register · login · logout · password`, `GET /api/auth/me` |
| Reference | `GET /api/services · categories · sla-policies · technicians · knowledge` |
| Incidents | `POST /api/incidents/preview`, `POST/GET /api/incidents` (filters: `id q status priority category service technician reporter sla from to state awaitingInfo limit offset`), `GET/PATCH /api/incidents/:id`, `GET …/history · recommendations` |
| Actions | `POST /api/incidents/:id/` `assign · category · acknowledge · start · notes · request-info · respond · resolve · verify · reopen · close · feedback · proposal` |
| Notifications | `GET /api/notifications`, `POST /api/notifications/read-all · :id/read`, `GET /api/admin/email-outbox` |
| Reports | `GET /api/reports/` `overview · workload · services · categories · trend · correlations · sla-risk · sla-violations` |
| Admin | `/api/admin/` `users`, `users/:id/password`, `services`, `categories`, `sla-policies`, `settings`, `audit`, `run-sla-monitor`, `simulate-time` |

Every incident response includes an `actions` array (what the current user may do next) so the UI never has to re-implement permission rules.
