# Working together

This repository contains the interactive Incident Desk prototype for our OOP group project. The final backend is still to be built.

## Run it locally

Install Node.js 18 or newer. Clone the repository using its GitHub **Code** button, open a terminal in the cloned folder, then run:

```sh
npm start
```

Open http://localhost:4173. No npm install, database, or API key is needed. Each member's browser stores its own demo data; browser changes do not sync to GitHub or to other members.

## Make a change

1. Pull the latest `main` branch before starting.
2. Create a branch with a descriptive name, such as `feature/incident-search`.
3. Edit the relevant files and refresh your localhost preview.
4. Run `npm test` to check the domain rules.
5. Commit and push your branch, then open a pull request into `main` for another member to review.

Use GitHub issues for proposed features or bugs. Include the preview role, screen, steps, and expected result. Avoid committing passwords, API keys, real personal information, or local browser exports.

## File guide

| File | Responsibility |
| --- | --- |
| `index.html` | Page entry point and saved appearance initialization |
| `styles.css` | Café palette, light/dark styling, and responsive layout |
| `app.js` | Screens, forms, browser storage, and simulated workflows |
| `domain.js` | Priority, assignment, lifecycle, SLA, and proposal rules |
| `domain.test.js` | Domain behavior checks |
| `server.js` | Local HTTP server on port 4173 |

The Administrator, Technician, and Employee selector is a demo control. It does not implement real login or server-side authorization. Email notifications are simulated.

## Repository access

This is a private repository. The owner needs each member's GitHub username and must invite them under **Settings → Collaborators** (or the organization's equivalent). Members must accept their invitations before cloning or pushing. Do not share account credentials.
