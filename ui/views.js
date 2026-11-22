// Pure view functions: state in, HTML string out. No fetching and no DOM access,
// so every screen can be checked with plain unit tests.
//
// State shape (built by app.js):
//   user, page, selected, tab, filters, notifTab, unread
//   ref:  { services, categories, technicians }
//   data: { list, incident, overview, workload, ... } (whatever the page loaded)
import { getCommandReference } from "../terminal-session.js";
import {
  PALETTES, PRIORITIES, SLA_STATES, STATUSES, badge, button, escapeHtml, formatDateTime, initials, isActive, slaText,
} from "./helpers.js";

export const NAV = {
  Employee: ["Overview", "Incidents", "Knowledge base", "Terminal"],
  Technician: ["Overview", "Incidents", "Knowledge base", "Terminal"],
  Administrator: ["Overview", "Incidents", "IT services", "People", "Reports", "SLA & assignment", "Audit log", "Knowledge base", "Terminal"],
};

const roleLabel = { Employee: "Employee view", Technician: "Technician view", Administrator: "Administrator view" };

export function heading(s, title, sub, actions = "") {
  return `<div class="heading"><div><div class="eyebrow">${roleLabel[s.user.role]}</div><h1>${title}</h1><p class="subtitle">${sub}</p></div><div class="actions">${actions}</div></div>`;
}

export function nav(s, fx = {}) {
  const open = (s.data.list?.items ?? []).filter(isActive).length;
  const items = NAV[s.user.role];
  return `<aside class="sidebar ${fx.intro ? "intro" : ""}"><div class="brand" style="--i:0">Incident Desk</div><nav>${items
    .map(
      (name, index) =>
        `<button class="nav-button ${s.page === name || (s.selected && name === "Incidents") ? "selected" : ""}" style="--i:${index + 1}" data-page="${escapeHtml(name)}">${name}${name === "Incidents" && s.openCount !== undefined ? `<span class="count">${s.openCount}</span>` : name === "Incidents" && open ? `<span class="count">${open}</span>` : ""}</button>`,
    )
    .join("")}</nav><div class="sidebar-bottom" style="--i:${items.length + 1}"><span class="dot"></span>Local environment<br /><span>OOP Project, I-ITSM</span></div></aside>`;
}

// One button that opens a menu with the colour mode and every palette.
export function appearanceMenu({ theme = "light", palette = "harbor", open = false } = {}) {
  const dark = theme === "dark";
  return `<div class="appearance"><button class="button small" data-action="appearance" aria-haspopup="true" aria-expanded="${open}" aria-controls="appearance-menu">Appearance<span class="caret" aria-hidden="true"></span></button><div class="menu" id="appearance-menu" role="group" aria-label="Appearance" ${open ? "" : "hidden"}><div class="menu-title">Mode</div><div class="segmented"><button data-mode="light" aria-pressed="${!dark}">☀ Light</button><button data-mode="dark" aria-pressed="${dark}">☾ Dark</button></div><div class="menu-title">Palette</div>${PALETTES.map((p) => `<button class="menu-item" data-palette-pick="${p.id}" aria-pressed="${p.id === palette}"><span class="swatch" aria-hidden="true"></span><span>${escapeHtml(p.label)}</span><span class="menu-check" aria-hidden="true">✓</span></button>`).join("")}</div></div>`;
}

export function shell(s, body, theme, palette = "harbor", fx = {}) {
  const crumb = s.selected ? "Incident detail" : s.page;
  return `${nav(s, fx)}<div class="layout"><header class="topbar"><div class="breadcrumb">Workspace<span style="padding:0 12px">/</span><strong>${escapeHtml(crumb)}</strong></div><div class="top-right">${appearanceMenu({ theme, palette, open: s.menuOpen })}<button class="icon-button" data-page="Notifications" aria-label="Open notifications">Alerts${s.unread ? `<span class="count" style="margin-left:8px">${s.unread}</span>` : '<span class="notification-dot"></span>'}</button><span class="avatar" title="${escapeHtml(s.user.name)}">${escapeHtml(initials(s.user.name))}</span><span class="small-text" style="max-width:150px">${escapeHtml(s.user.name)}<br />${escapeHtml(s.user.role)}</span>${button("Sign out", "logout", "small")}</div></header><main class="main ${fx.enter ? "enter" : ""}">${body}<footer class="footer"><span>Incident Desk · ${escapeHtml(s.user.email)}</span><span>${escapeHtml(s.user.role)}</span></footer></main></div>`;
}

// ---- sign in / register -------------------------------------------------------------
// Demo accounts (served by GET /api/auth/demo); clicking one fills the sign-in form.
function demoPanel(demo) {
  if (!demo?.enabled) return "";
  const rows = demo.accounts
    .map((a) => `<button type="button" class="demo-account" data-demo-email="${escapeHtml(a.email)}"><span class="demo-name">${escapeHtml(a.name)}</span><span class="demo-role">${escapeHtml(a.title || a.role)}</span><span class="demo-email">${escapeHtml(a.email)}</span></button>`)
    .join("");
  return `<div class="demo-box"><div class="demo-head"><span class="eyebrow">Demo accounts</span><span class="small-text">Password for all: <code>${escapeHtml(demo.password)}</code></span></div><div class="demo-grid">${rows}</div><p class="small-text">Pick an account to fill in the form, then sign in.</p></div>`;
}

export function authScreen({ mode = "login", error = "", theme = "light", palette = "harbor", open = false, demo = null }) {
  const login = mode === "login";
  const showDemo = login && demo?.enabled;
  return `<div class="auth-shell"><section class="panel auth-card ${showDemo ? "has-demo" : ""}"><div class="panel-head"><div><div class="eyebrow">Incident Desk</div><h2>${login ? "Sign in" : "Create an account"}</h2></div><div class="top-right">${appearanceMenu({ theme, palette, open })}</div></div><div class="panel-body"><div class="tabbar"><button class="tab ${login ? "active" : ""}" data-auth-mode="login">Sign in</button><button class="tab ${login ? "" : "active"}" data-auth-mode="register">Register</button></div><form id="auth-form" novalidate>${login ? "" : '<label class="field">Full name<input name="name" autocomplete="name" required minlength="2" maxlength="80" /></label>'}<label class="field">Email<input name="email" type="email" autocomplete="username" required maxlength="254" /></label><label class="field">Password<input name="password" type="password" autocomplete="${login ? "current-password" : "new-password"}" required ${login ? "" : 'minlength="8"'} maxlength="128" /></label>${login ? "" : '<p class="small-text">At least 8 characters with a letter and a number. New accounts are Employee accounts; an administrator can change roles.</p>'}<div id="auth-error" class="error" role="alert">${escapeHtml(error)}</div><button class="button primary" type="submit">${login ? "Sign in" : "Create account"}</button></form>${showDemo ? demoPanel(demo) : ""}</div></section></div>`;
}

// ---- incident list -----------------------------------------------------------------
function selectFilter(s, key, placeholder, options) {
  return `<select aria-label="Filter by ${key}" data-filter="${key}"><option value="">${placeholder}</option>${options
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(s.filters[key] ?? "") === String(value) ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("")}</select>`;
}

export function incidentRows(s) {
  const items = s.data.list?.items ?? [];
  if (!items.length) {
    return `<tr><td colspan="5"><div class="empty">No incidents match these filters.</div></td></tr>`;
  }
  return items
    .map(
      (i) =>
        `<tr><td><button class="incident-link" data-incident="${i.id}">${escapeHtml(i.title)}</button><div class="incident-id">${escapeHtml(i.displayId)}, ${escapeHtml(i.category)}</div></td><td>${badge(i.priority)}</td><td>${badge(i.status)}${i.escalatedTo ? ` ${badge("Escalated", "breached")}` : ""}</td><td><div class="person"><span class="mini-avatar">${escapeHtml(initials(i.technician?.name ?? "Unassigned"))}</span><span>${escapeHtml(i.technician?.name.split(" ")[0] ?? "Unassigned")}</span></div></td><td>${badge(i.sla.label)}<div class="incident-id">${escapeHtml(slaText(i))}</div></td></tr>`,
    )
    .join("");
}

export function incidentQueue(s, { advanced }) {
  const role = s.user.role;
  const f = s.filters;
  const hasFilter = Object.values(f).some(Boolean);
  const title = role === "Employee" ? "My incidents" : role === "Technician" ? "My incident queue" : "Incident overview";
  return `<section class="panel"><div class="panel-head"><div><h2>${title}</h2><p class="subtitle">${role === "Employee" ? "Your requests and their latest updates." : "Start with the highest priority items."}</p></div><span class="small-text">${s.data.list?.total ?? 0} total</span></div><div class="tabbar">${["All incidents", "Open", "Resolved"].map((t) => `<button class="tab ${s.tab === t ? "active" : ""}" data-tab="${t}">${t}</button>`).join("")}</div><div class="filters"><input type="search" id="search" aria-label="Search incidents" placeholder="Search incidents or INC-1001" value="${escapeHtml(f.q ?? "")}" />${selectFilter(s, "priority", "Priority", PRIORITIES.map((p) => [p, p]))}${selectFilter(s, "status", "Status", STATUSES.map((p) => [p, p]))}${
    advanced
      ? selectFilter(s, "service", "Service", (s.ref.services ?? []).map((x) => [x.name, x.name])) +
        selectFilter(s, "category", "Category", (s.ref.categories ?? []).map((x) => [x.name, x.name])) +
        (role === "Administrator" ? selectFilter(s, "technician", "Technician", (s.ref.technicians ?? []).map((x) => [x.id, x.name])) : "") +
        selectFilter(s, "sla", "SLA status", SLA_STATES.map((p) => [p, p])) +
        `<label class="small-text">From <input type="date" data-filter="from" aria-label="Created from" value="${escapeHtml(f.from ?? "")}" /></label><label class="small-text">To <input type="date" data-filter="to" aria-label="Created to" value="${escapeHtml(f.to ?? "")}" /></label>`
      : ""
  }${hasFilter ? button("Clear", "clear-filters", "small") : ""}</div><div class="table-wrap"><table><thead><tr><th>Incident</th><th>Priority</th><th>Status</th><th>Assignee</th><th>SLA</th></tr></thead><tbody id="incident-rows">${incidentRows(s)}</tbody></table></div></section>`;
}

// ---- overview ---------------------------------------------------------------------------
function metrics(items) {
  const open = items.filter(isActive);
  const stats = [
    ["Open incidents", open.length, "Not yet resolved"],
    ["Critical incidents", open.filter((i) => i.priority === "P1").length, "Priority P1"],
    ["SLA breaches", items.filter((i) => i.sla.label === "Breached").length, "Response or resolution missed"],
    ["Resolved incidents", items.filter((i) => !isActive(i)).length, "Resolved, verified or closed"],
  ];
  return `<div class="stats">${stats.map(([label, value, detail]) => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-detail">${detail}</div></div>`).join("")}</div>`;
}

export function workloadPanel(rows, title = "Team workload") {
  return `<section class="panel"><div class="panel-head"><h2>${title}</h2></div><div class="panel-body">${
    (rows ?? []).length
      ? rows
          .map(
            (t) =>
              `<div class="workload-row"><div class="workload-line"><span>${escapeHtml(t.name)}</span><span class="small-text">${t.activeIncidents}/${t.capacity} active</span></div><div class="bar"><div class="bar-fill" style="width:${Math.min(100, t.utilizationPercent)}%"></div></div></div>`,
          )
          .join("")
      : '<p class="small-text">No workload to show.</p>'
  }</div></section>`;
}

function serviceHealth(s) {
  const items = s.data.all ?? s.data.list?.items ?? [];
  return `<section class="panel"><div class="panel-head"><h2>Service attention</h2></div><div class="panel-body">${(s.ref.services ?? [])
    .slice(0, 5)
    .map((svc) => {
      const n = items.filter((i) => isActive(i) && i.service.id === svc.id).length;
      return `<div class="status-row"><span>${escapeHtml(svc.name)}</span>${badge(n ? `${n} open` : "No incidents", n ? "at-risk" : "on-track")}</div>`;
    })
    .join("")}<div class="small-text" style="margin-top:10px">Based on reported incidents</div></div></section>`;
}

export function overview(s) {
  const role = s.user.role;
  const items = s.data.all ?? s.data.list?.items ?? [];
  const alerts = items.filter((i) => isActive(i) && ["At risk", "Breached"].includes(i.sla.label));
  const first = s.user.name.split(" ")[0];
  return (
    heading(
      s,
      role === "Employee" ? `Hi ${escapeHtml(first)}, how can we help?` : role === "Technician" ? "Your queue" : "Service operations",
      role === "Employee" ? "Report a problem and follow it until it is fixed." : role === "Technician" ? "Your assigned incidents and what to do next." : "Open incidents, service health, and team workload.",
      button("Report incident", "create", "primary"),
    ) +
    (role === "Employee"
      ? `<div class="hero"><h2>Something not working?</h2><p>Describe what went wrong and we will pass it to the right technician. Every update appears here.</p>${button("Report a problem", "create", "primary")}</div>`
      : "") +
    metrics(items) +
    `<div class="content-grid">${incidentQueue(s, { advanced: false })}<div class="side-stack"><section class="alert-card"><h3>${alerts.length ? `${alerts.length} incidents need attention` : "Nothing needs attention right now"}</h3><p>${alerts.length ? "Some response or resolution deadlines are close or missed." : "Everything in your queue is within its targets."}</p>${button("Review alerts", "sla-alerts", "small")}</section>${
      role === "Employee"
        ? `<section class="panel"><div class="panel-head"><h2>What happens next?</h2></div><div class="panel-body small-text"><p>1. We classify and prioritize your request.</p><p>2. A technician investigates and updates you.</p><p>3. You verify the resolution before closure.</p></div></section>`
        : workloadPanel(s.data.workload)
    }${serviceHealth(s)}</div></div>`
  );
}

// ---- incident detail -------------------------------------------------------------------------
function proposalSection(s, i) {
  const p = i.proposal;
  if (!p) return "";
  const canReview = i.actions.includes("review-proposal");
  return `<section class="detail-section proposal-section"><div class="proposal-heading"><h3>Suggested improvement</h3>${badge(p.status)}</div><p class="proposal-text">${escapeHtml(p.text)}</p><p class="small-text">Proposed by ${escapeHtml(i.reporter.name)}, reviewed separately from incident resolution</p>${
    p.reviewer
      ? `<div class="callout"><strong>${escapeHtml(p.status)} by ${escapeHtml(p.reviewer.name)}</strong>${p.note ? `<br />${escapeHtml(p.note)}` : ""}<br /><span class="small-text">${formatDateTime(p.reviewedAt)}</span></div>`
      : ""
  }${
    canReview
      ? `<div class="actions" style="margin-top:14px">${p.status === "Proposed" ? button("Accept proposal", "proposal-accept", "primary small") + button("Decline proposal", "proposal-decline", "small") : button("Mark implemented", "proposal-implement", "primary small")}</div><p class="small-text">Accepting a proposal records your decision. Mark it implemented only after making the change.</p>`
      : ""
  }</section>`;
}

const actionLabels = {
  acknowledge: ["Acknowledge incident", "primary"],
  start: ["Start investigation", "primary"],
  resolve: ["Provide resolution", "primary"],
  verify: ["Verify resolution", "primary"],
  close: ["Close incident", "primary"],
};

function sideActions(i) {
  const a = i.actions;
  const buttons = [];
  for (const key of ["acknowledge", "start", "resolve", "verify", "close"]) {
    if (a.includes(key)) buttons.push(button(actionLabels[key][0], key, "primary"));
  }
  if (a.includes("reopen")) buttons.push(button("Reject resolution", "reopen", "small"));
  if (a.includes("request-info")) buttons.push(button("Request information", "request-info", "small"));
  if (a.includes("assign")) buttons.push(button("Assign technician", "assign", "small"));
  if (a.includes("reassign")) buttons.push(button("Change assignment", "assign", "small"));
  if (a.includes("edit")) buttons.push(button("Edit details", "edit", "small"));
  if (a.includes("assign") || a.includes("reassign")) buttons.push(button("Change category", "set-category", "small"));
  if (a.includes("feedback")) buttons.push(button("Leave feedback", "feedback", "small"));
  return buttons.length ? `<div class="actions" style="margin-top:14px;flex-direction:column;align-items:stretch">${buttons.join("")}</div>` : "";
}

function noteForm(i) {
  if (i.status === "Closed") return "";
  const staff = i.actions.includes("add-note");
  const reply = i.actions.includes("respond");
  if (!staff && !reply) return "";
  return `<form id="note-form"><label class="field">${staff ? "Investigation note" : "Add information"}<textarea name="note" required maxlength="2000" placeholder="Add an update"></textarea></label>${staff ? '<label class="check-field"><input type="checkbox" name="internal"> Internal note, visible to support only</label>' : ""}<div class="actions">${button("Post note", "post-note", "primary small")}<span class="small-text">${staff ? "Resolution details are requested separately" : "Visible to your support team"}</span></div></form>`;
}

export function detail(s) {
  const i = s.data.incident;
  if (!i) return heading(s, "Incident workspace", "Loading…") + '<div class="empty">Loading incident…</div>';
  const staff = s.user.role !== "Employee";
  const sla = i.sla;
  const factor = i.affectedUsers > 50 ? 1.5 : i.affectedUsers > 5 ? 1.25 : 1;
  const facts = [
    ["Reported by", i.reporter.name],
    ["Assigned technician", i.technician?.name ?? "Unassigned"],
    ["Category", i.category],
    ["Created", formatDateTime(i.createdAt)],
    ["Affected users", i.affectedUsers],
  ];
  return (
    heading(s, "Incident workspace", "Everything about this incident in one place.", button("Back to incidents", "back")) +
    `<div class="detail-grid"><section class="panel"><div class="detail-header"><span class="small-text">${escapeHtml(i.displayId)}, ${escapeHtml(i.service.name)}</span><h2>${escapeHtml(i.title)}</h2><div class="pill-row">${badge(i.priority)}${badge(i.status)}${i.escalatedTo ? badge(`Escalated to ${i.escalatedTo}`, "breached") : ""}${i.awaitingInfo ? badge("Waiting for information", "at-risk") : ""}</div></div>
${i.awaitingInfo && i.actions.includes("respond") ? '<div class="detail-section"><div class="callout"><strong>Support needs more information.</strong><br />Reply in the conversation below so the technician can continue.</div></div>' : ""}
<div class="detail-section"><h3>Description</h3><p>${escapeHtml(i.description)}</p><div class="facts" style="margin-top:22px">${facts.map(([k, v]) => `<div class="fact"><label>${k}</label><span>${escapeHtml(v)}</span></div>`).join("")}</div></div>${proposalSection(s, i)}
<div class="detail-section"><h3>Priority reasoning</h3><div class="callout">Impact ${i.impact} × urgency ${i.urgency} × service criticality ${i.criticality}${factor > 1 ? ` × affected-users factor ${factor}` : ""} = score ${i.score}. Assigned ${i.priority} using the configured priority rules.</div></div>${
      i.resolution
        ? `<div class="detail-section"><h3>Resolution</h3><p>${escapeHtml(i.resolution)}</p>${i.feedback ? `<p>Feedback: ${"★".repeat(i.feedback.rating)}${"☆".repeat(5 - i.feedback.rating)}${i.feedback.comment ? ` — ${escapeHtml(i.feedback.comment)}` : ""}</p>` : ""}</div>`
        : ""
    }${
      staff && i.suggestedResolutions?.length
        ? `<div class="detail-section"><h3>Suggested resolutions</h3><p class="small-text">From similar resolved incidents.</p>${i.suggestedResolutions.map((r) => `<div class="note"><div class="row"><strong>${escapeHtml(`INC-${r.incidentId}`)}: ${escapeHtml(r.title)}</strong><span class="small-text">match ${Math.round(r.score * 100)}%</span></div><p>${escapeHtml(r.resolution)}</p></div>`).join("")}</div>`
        : ""
    }
<div class="detail-section"><h3>Conversation & investigation</h3>${
      i.notes.length
        ? i.notes.map((n) => `<div class="note"><div class="row"><strong>${escapeHtml(n.author ?? "Unknown")}</strong><span class="small-text">${formatDateTime(n.at)}${n.internal ? ", Internal" : ""}${n.kind === "info_request" ? ", Information request" : ""}</span></div><p>${escapeHtml(n.body)}</p></div>`).join("")
        : "<p>No notes yet. Add information to help the investigation.</p>"
    }${noteForm(i)}</div></section>
<div class="side-stack"><section class="panel"><div class="panel-head"><h2>SLA & next action</h2>${badge(sla.label)}</div><div class="panel-body"><div class="facts"><div class="fact"><label>Response deadline</label><span>${formatDateTime(sla.responseDue)}</span></div><div class="fact"><label>Resolution deadline</label><span>${formatDateTime(sla.resolutionDue)}</span></div></div><p class="small-text">${sla.responseBreached ? "Response target missed. " : i.acknowledgedAt ? "Response acknowledged. " : "Waiting for acknowledgement. "}${sla.resolutionBreached ? "Resolution target missed." : isActive(i) ? escapeHtml(slaText(i)) + "." : ""}</p>${
      staff && i.risk && isActive(i)
        ? `<div class="callout"><strong>SLA risk: ${escapeHtml(i.risk.level)}</strong>${i.risk.reasons.length ? `<br />${i.risk.reasons.map(escapeHtml).join("<br />")}` : ""}</div>`
        : ""
    }${sideActions(i)}${s.user.role === "Employee" && i.status === "Verified" ? '<p class="small-text">Thank you. Support can now close this incident.</p>' : ""}</div></section>${
      staff && i.related?.length
        ? `<section class="panel"><div class="panel-head"><h2>Related incidents</h2></div><div class="panel-body">${i.related.map((r) => `<div class="status-row"><span><button class="incident-link" data-incident="${r.id}">INC-${r.id}</button> ${escapeHtml(r.title)}</span>${badge(r.status)}</div>`).join("")}<p class="small-text">Possible duplicates or reports of the same problem.</p></div></section>`
        : ""
    }<section class="panel"><div class="panel-head"><h2>Activity timeline</h2></div><div class="panel-body"><div class="timeline">${[...i.history]
      .reverse()
      .map((h) => `<div class="event"><p>${escapeHtml(h.description)}${h.previousState && h.newState && h.previousState !== h.newState ? ` <span class="small-text">(${escapeHtml(h.previousState)} → ${escapeHtml(h.newState)})</span>` : ""}</p><time>${formatDateTime(h.at)}, ${escapeHtml(h.user)}</time></div>`)
      .join("")}</div></div></section></div></div>`
  );
}

// ---- notifications, knowledge, terminal --------------------------------------------------------------
export function notifications(s) {
  const n = s.data.notifications ?? { items: [], unread: 0 };
  const email = s.notifTab === "email";
  return (
    heading(s, "Notifications", "In-app updates and simulated emails.", n.unread && !email ? button("Mark all as read", "read-all", "small") : "") +
    `<section class="panel"><div class="tabbar"><button class="tab ${email ? "" : "active"}" data-notif-tab="in-app">In-app</button><button class="tab ${email ? "active" : ""}" data-notif-tab="email">Email simulation</button></div>${
      n.items.length
        ? n.items.map((x) => `<div class="notification" ${x.read ? "" : 'style="border-left:6px solid var(--accent)"'}><div><h3>${escapeHtml(x.subject)}</h3><p>${escapeHtml(x.message)}</p><span class="small-text">${formatDateTime(x.at)}, ${email ? "Not sent externally" : x.read ? "Read" : "Unread"}${x.incidentId ? ` · <button class="incident-link" data-incident="${x.incidentId}" ${email ? "" : 'data-read="' + x.id + '"'}>Open INC-${x.incidentId}</button>` : ""}</span></div></div>`).join("")
        : '<div class="empty">No notifications yet. Create or update an incident to see them here.</div>'
    }</section>`
  );
}

const KB_TIPS = [
  ["Payment portal unavailable", "Check whether the service is affected for other users. Report the exact error, time, and affected department. Never include payment credentials in your incident."],
  ["Campus Wi-Fi disconnects", "Reconnect to the campus network and note your building and access point location. If multiple devices are affected, report a network incident."],
  ["Cannot sign in", "Check your account identifier and use the official password reset flow. IT will never ask you to send your password."],
];

export function knowledge(s) {
  const learned = (s.data.knowledge ?? []).map((k) => [`${k.title} (INC-${k.id})`, k.resolution]);
  return (
    heading(s, "Knowledge base", s.user.role === "Employee" ? "Common fixes and the answers to your own past incidents." : "Common fixes and past resolutions from the whole team.") +
    `<section class="panel">${[...KB_TIPS, ...learned].map(([title, body]) => `<details class="knowledge"><summary>${escapeHtml(title)}</summary><p>${escapeHtml(body)}</p></details>`).join("")}</section>`
  );
}

export function terminalPage(s) {
  const t = s.terminal;
  const session = t.session;
  const reference = getCommandReference(s.user.role);
  return (
    heading(s, "Terminal", "A command line for your IT requests, connected to the same incident dashboard.") +
    `<div class="terminal-layout"><section class="terminal-window" aria-label="Incident Desk terminal"><div class="terminal-chrome"><span class="terminal-lights" aria-hidden="true">● ● ●</span><span>incidentdesk / ${escapeHtml(s.user.email)}</span><span class="terminal-connection">Connected</span></div><div class="terminal-log" id="terminal-log" role="log" aria-live="polite" aria-relevant="additions">${session.entries.map((e) => `<pre class="terminal-entry ${e.kind}">${escapeHtml(e.text)}</pre>`).join("")}</div><form id="terminal-form" class="terminal-command"><label for="terminal-input">${escapeHtml(session.prompt)}</label><input id="terminal-input" name="command" aria-label="Terminal command" autocomplete="off" spellcheck="false" placeholder="${session.report ? "Type your answer…" : "Type help, report, or list --mine"}" ${t.busy ? "disabled" : ""} /><button type="submit" class="terminal-run" ${t.busy ? "disabled" : ""}>${t.busy ? "Working…" : "Run ↵"}</button></form></section><aside class="terminal-guide panel"><div class="panel-head"><h2>${escapeHtml(reference.title)}</h2></div><div class="panel-body"><p class="small-text">${escapeHtml(s.user.name)} · ${escapeHtml(s.user.role)}<br />Choose a command to insert it, then enter any needed details and run it.</p>${reference.sections
      .map(
        (section) =>
          `<section class="command-reference-group" aria-label="${escapeHtml(section.title)}"><h3>${escapeHtml(section.title)}</h3>${section.commands
            .map((c) => {
              const enabled = c.context === "review" ? session.context === "review" : c.context === "draft" ? session.context !== "command" : session.context === "command";
              return `<button class="terminal-example" data-terminal-command="${escapeHtml(c.input)}" ${enabled ? "" : "disabled"}><code>${escapeHtml(c.syntax)}</code><span>${escapeHtml(c.description)}</span></button>`;
            })
            .join("")}</section>`,
      )
      .join("")}<p class="small-text">Report controls become available at the relevant step. Creating an incident always requires <strong>submit</strong>.</p><h3 style="margin-top:24px">From your own terminal</h3><p class="small-text">With this server running, open a terminal in the project folder:</p><code>npm run cli</code><p class="small-text">The CLI asks you to sign in and shares data with the website. It is an app command line, not an operating-system shell.</p></div></aside></div>`
  );
}
