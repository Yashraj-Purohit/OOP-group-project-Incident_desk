# Working together

This repository contains the Incident Desk application (web UI, API and SQLite persistence) for our OOP group project.

## Run it locally

Install Node.js 22.13 or newer, clone the repository, then run:

```sh
npm start
```

Open http://localhost:4173 and sign in (demo accounts are listed in the README). Data lives in `.local-data/incident-desk.sqlite`, which is ignored by git: each member has their own database, and nothing syncs between computers.

## Make a change

1. Pull the latest `main` branch before starting.
2. Create a branch with a descriptive name, such as `feature/incident-search`.
3. Edit the relevant files and refresh your localhost page (the server serves files from disk; restart `npm start` after backend changes).
4. Run `npm test` and make sure everything passes.
5. Commit and push your branch, then open a pull request into `main` for another member to review.

Use GitHub issues for proposed features or bugs. Include the role, screen, steps, and expected result. Avoid committing passwords, API keys, real personal information, or database files.

## File guide

| Path | Responsibility |
| --- | --- |
| `index.html`, `styles.css`, `theme-init.js` | Page shell, 8-bit light/dark styling, saved theme |
| `app.js` | Web client controller: session, navigation, dialogs, API calls |
| `ui/views.js`, `ui/adminViews.js` | Pure view functions (state in, HTML out) for all screens |
| `ui/api.js`, `ui/helpers.js` | API client with bearer token, escaping and formatting helpers |
| `terminal-session.js`, `terminal-client.js`, `cli.js` | Terminal command interface for the browser and the real command line |
| `server.js` | Starts the server (web UI and API on one port) |
| `backend/domain/` | Incident aggregate, lifecycle states, users and roles, priority, assignment and SLA strategies |
| `backend/intelligence/` | Duplicate detection, correlation, classification, escalation, risk, suggestions |
| `backend/notifications/` | Notification channels, audit and notification observers |
| `backend/persistence/` | SQLite database and repositories |
| `backend/services/` | Use cases: incidents, administration, reports, SLA monitor |
| `backend/http/` | Routes, authentication, error mapping, static files |
| `backend/seed.js` | Reference data, demo accounts and sample incidents |
| `backend/tests/`, `tests/` | Backend tests; terminal and UI view tests |
| `scripts/` | `demo.mjs` (repeatable demo mode) and `simulate.mjs` (fires sample incidents at a running server) |
| `docs/video/` | Demo video kit: script (`SCRIPT.md`/`.pdf`), `slides.html`, title/thank-you cards and the ten section cards (`section-cards/`) |

Roles are enforced on the server: every API call needs a signed-in user, and each use case checks that user's permissions. Email notifications are simulated.

## Repository access

This is a private repository. The owner needs each member's GitHub username and must invite them under **Settings → Collaborators** (or the organization's equivalent). Members must accept their invitations before cloning or pushing. Do not share account credentials.
