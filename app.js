import {
  services,
  technicians,
  priority,
  assign,
  active,
  nextStatus,
  transition,
  sla,
  duplicates,
  seed,
  reviewProposal,
} from "./domain.js";
// Browser storage: load saved demo data or create the sample incidents.
const KEY = "incident-desk-prototype-v1";
let appData;
try {
  appData = JSON.parse(localStorage.getItem(KEY));
  if (appData?.version !== 1 || !Array.isArray(appData.incidents)) {
    appData = seed();
  }
} catch {
  appData = seed();
}
// Current screen and the user role selected in the preview.
let role = "Administrator";
let page = "Overview";
let selected = null;
let tab = "All incidents";
let filters = {};
let noticeTimer;

// Small helpers used throughout the page.

function getElement(selector) {
  return document.querySelector(selector);
}

// Escape user input before inserting it into HTML.

function escapeHtml(value) {
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    return replacements[character];
  });
}

function getCurrentTime() {
  return Date.now() + appData.offset;
}

function getCurrentUser() {
  if (role === "Employee") {
    return "Ananya Rao";
  }
  if (role === "Technician") {
    return "Asha Mehta";
  }
  return "Arjun Nair";
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function createStatusBadge(label, style = label) {
  const className = escapeHtml(style.toLowerCase().replaceAll(" ", "-"));
  return /* HTML */ `
    <span class="badge ${className}">${escapeHtml(label)}</span>
  `;
}

function createButton(label, action, style = "", extraAttributes = "") {
  return /* HTML */ `
    <button class="button ${style}" data-action="${action}" ${extraAttributes}>
      ${label}
    </button>
  `;
}

function getVisibleIncidents() {
  return appData.incidents.filter((incident) => {
    if (role === "Employee") {
      return incident.reporter === getCurrentUser();
    }
    if (role === "Technician") {
      return incident.technician === getCurrentUser();
    }
    return true;
  });
}

function getSelectedIncident() {
  return appData.incidents.find((incident) => incident.id === selected);
}

// Save data, show messages, and record activity.

function toast(text) {
  getElement("#toast").textContent = text;
  getElement("#toast").style.display = "block";
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(
    () => (getElement("#toast").style.display = "none"),
    4000,
  );
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(appData));
  } catch {
    toast(
      "Browser storage is unavailable. Changes will last for this session only.",
    );
  }
}

function audit(i, text) {
  i.history.push({ time: getCurrentTime(), actor: getCurrentUser(), text });
}

function notify(i, title) {
  for (const channel of ["In-app", "Email simulation"]) {
    appData.notifications.unshift({
      title,
      text: `INC-${i.id} · ${i.title}`,
      time: getCurrentTime(),
      audience: i.reporter,
      technician: i.technician,
      channel,
    });
  }
}

function openIncident(id) {
  selected = Number(id);
  page = "Incidents";
  render();
}
// Screen builders: each function returns the HTML for part of the interface.

function nav() {
  const list =
    role === "Administrator"
      ? [
          ["Overview", "▦"],
          ["Incidents", "▤"],
          ["IT services", "◇"],
          ["Technicians", "♧"],
          ["Reports", "▥"],
          ["SLA & assignment", "⚙"],
          ["Audit log", "◷"],
          ["Knowledge base", "▧"],
        ]
      : role === "Technician"
        ? [
            ["Overview", "▦"],
            ["Incidents", "▤"],
            ["Knowledge base", "▧"],
          ]
        : [
            ["Overview", "▦"],
            ["Incidents", "▤"],
            ["Knowledge base", "▧"],
          ];
  return /* HTML */ `
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">◇</span>
        Incident Desk
      </div>
      <div class="nav-label">WORKSPACE</div>
      <nav>
        ${list
          .map(
            ([name, icon]) => /* HTML */ `
              <button
                class="nav-button ${page === name ||
                (selected && name === "Incidents")
                  ? "selected"
                  : ""}"
                data-page="${escapeHtml(name)}"
              >
                <span class="icon" aria-hidden="true">${icon}</span>
                ${name}${name === "Incidents"
                  ? /* HTML */ `
                      <span class="count">
                        ${getVisibleIncidents().filter(active).length}
                      </span>
                    `
                  : ""}
              </button>
            `,
          )
          .join("")}
      </nav>
      <div class="sidebar-bottom">
        <span class="dot"></span>
        Local demo environment
        <br />
        <span>OOP Project · I-ITSM</span>
      </div>
    </aside>
  `;
}

function heading(title, sub, actions = "") {
  return /* HTML */ `
    <div class="heading">
      <div>
        <div class="eyebrow">
          ${role === "Employee"
            ? "EMPLOYEE PORTAL"
            : role === "Technician"
              ? "SUPPORT WORKSPACE"
              : "OPERATIONS WORKSPACE"}
        </div>
        <h1>${title}</h1>
        <p class="subtitle">${sub}</p>
      </div>
      <div class="actions">${actions}</div>
    </div>
  `;
}

function metrics() {
  const all = getVisibleIncidents();
  const open = all.filter(active);
  const breached = all.filter(
    (i) => sla(i, getCurrentTime(), appData.policies).label === "Breached",
  );
  const resolved = all.filter((i) => !active(i));
  const stats = [
    ["Open incidents", open.length, "Awaiting or receiving support", "▤"],
    [
      "Critical incidents",
      open.filter((i) => i.priority === "P1").length,
      "High business impact",
      "!",
    ],
    ["SLA breaches", breached.length, "Response or resolution missed", "◷"],
    [
      "Resolved incidents",
      resolved.length,
      "Resolved, verified, or closed",
      "✓",
    ],
  ];
  return /* HTML */ `
    <div class="stats">
      ${stats
        .map(
          ([label, value, detail, icon]) => /* HTML */ `
            <div class="stat">
              <div class="stat-label">
                ${label}
                <span class="stat-icon">${icon}</span>
              </div>
              <div class="stat-value">${value}</div>
              <div class="stat-detail">${detail}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function filtered() {
  return getVisibleIncidents()
    .filter((i) => {
      const s = sla(i, getCurrentTime(), appData.policies);
      return (
        (tab !== "Open" || active(i)) &&
        (tab !== "Resolved" || !active(i)) &&
        (!filters.q ||
          `${i.id} ${i.title} ${i.description}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())) &&
        ["priority", "status", "service", "technician"].every(
          (k) => !filters[k] || i[k] === filters[k],
        ) &&
        (!filters.sla || s.label === filters.sla)
      );
    })
    .sort(
      (a, b) => a.priority.localeCompare(b.priority) || b.created - a.created,
    );
}

function selectFilter(key, placeholder, options) {
  return /* HTML */ `
    <select aria-label="Filter by ${key}" data-filter="${key}">
      <option value="">${placeholder}</option>
      ${options
        .map(
          (v) => /* HTML */ `
            <option ${filters[key] === v ? "selected" : ""}>
              ${escapeHtml(v)}
            </option>
          `,
        )
        .join("")}
    </select>
  `;
}

function rows() {
  const list = filtered();
  return list.length
    ? list
        .map((i) => {
          const s = sla(i, getCurrentTime(), appData.policies);
          return /* HTML */ `
            <tr>
              <td>
                <button class="incident-link" data-incident="${i.id}">
                  ${escapeHtml(i.title)}
                </button>
                <div class="incident-id">
                  INC-${i.id} · ${escapeHtml(i.category)}
                </div>
              </td>
              <td>${createStatusBadge(i.priority, i.priority)}</td>
              <td>${createStatusBadge(i.status)}</td>
              <td>
                <div class="person">
                  <span class="mini-avatar">
                    ${initials(i.technician || "Unassigned")}
                  </span>
                  <span>
                    ${escapeHtml(i.technician?.split(" ")[0] || "Unassigned")}
                  </span>
                </div>
              </td>
              <td>
                ${createStatusBadge(s.label)}
                <div class="incident-id">
                  ${active(i)
                    ? s.remaining < 0
                      ? Math.abs(s.remaining) + "m overdue"
                      : s.remaining + "m left"
                    : "Resolution recorded"}
                </div>
              </td>
            </tr>
          `;
        })
        .join("")
    : /* HTML */ `
        <tr>
          <td colspan="5">
            <div class="empty">
              No incidents match these
              filters.${role === "Technician"
                ? " Switch to Administrator to see all incidents."
                : ""}
            </div>
          </td>
        </tr>
      `;
}

function queue() {
  return /* HTML */ `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>
            ${role === "Employee"
              ? "My incidents"
              : role === "Technician"
                ? "My incident queue"
                : "Incident overview"}
          </h2>
          <p class="subtitle">
            ${role === "Employee"
              ? "Your requests and their latest updates."
              : "Keep the most important work moving."}
          </p>
        </div>
        <span class="small-text">${getVisibleIncidents().length} total</span>
      </div>
      <div class="tabbar">
        ${["All incidents", "Open", "Resolved"]
          .map(
            (t) => /* HTML */ `
              <button class="tab ${tab === t ? "active" : ""}" data-tab="${t}">
                ${t}
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="filters">
        <input
          type="search"
          id="search"
          aria-label="Search incidents"
          placeholder="⌕  Search incidents…"
          value="${escapeHtml(filters.q || "")}"
        />
        ${selectFilter("priority", "Priority", [
          "P1",
          "P2",
          "P3",
          "P4",
        ])}${selectFilter("status", "Status", [
          "Assigned",
          "Acknowledged",
          "In progress",
          "Resolved",
          "Verified",
          "Closed",
        ])}${page === "Incidents"
          ? selectFilter(
              "service",
              "Service",
              services.map((s) => s.name),
            ) +
            selectFilter(
              "technician",
              "Technician",
              technicians.map((t) => t.name),
            ) +
            selectFilter("sla", "SLA status", [
              "On track",
              "At risk",
              "Breached",
              "Met",
            ])
          : ""}${Object.values(filters).some(Boolean)
          ? createButton("Clear", "clear-filters", "small")
          : ""}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>INCIDENT</th>
              <th>PRIORITY</th>
              <th>STATUS</th>
              <th>ASSIGNEE</th>
              <th>SLA</th>
            </tr>
          </thead>
          <tbody id="incident-rows">${rows()}</tbody>
        </table>
      </div>
    </section>
  `;
}

function workload() {
  return /* HTML */ `
    <section class="panel">
      <div class="panel-head"><h2>Team workload</h2></div>
      <div class="panel-body">
        ${technicians
          .map((t) => {
            const n = appData.incidents.filter(
              (i) => i.technician === t.name && active(i),
            ).length;
            return /* HTML */ `
              <div class="workload-row">
                <div class="workload-line">
                  <span>${escapeHtml(t.name)}</span>
                  <span class="small-text">${n} active</span>
                </div>
                <div class="bar">
                  <div
                    class="bar-fill"
                    style="width:${Math.min(100, n * 20)}%"
                  ></div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function serviceHealth() {
  return /* HTML */ `
    <section class="panel">
      <div class="panel-head"><h2>Service attention</h2></div>
      <div class="panel-body">
        ${services
          .slice(0, 3)
          .map((s) => {
            const n = appData.incidents.filter(
              (i) => i.service === s.name && active(i),
            ).length;
            return /* HTML */ `
              <div class="status-row">
                <span>${escapeHtml(s.name)}</span>
                ${createStatusBadge(
                  n ? `${n} open` : "No incidents",
                  n ? "at-risk" : "on-track",
                )}
              </div>
            `;
          })
          .join("")}
        <div class="small-text" style="margin-top:10px">
          Based on reported incidents
        </div>
      </div>
    </section>
  `;
}

function overview() {
  const alerts = getVisibleIncidents().filter(
    (i) =>
      active(i) &&
      ["At risk", "Breached"].includes(
        sla(i, getCurrentTime(), appData.policies).label,
      ),
  );
  return (
    heading(
      role === "Employee"
        ? "Hello, Ananya. How can IT help?"
        : role === "Technician"
          ? "Your support workbench"
          : "Service operations",
      role === "Employee"
        ? "A simpler way to get help and follow your requests."
        : role === "Technician"
          ? "Your assigned incidents, priorities, and next actions."
          : "A clear view of incidents, service health, and your team.",
      createButton("＋ Report incident", "create", "primary"),
    ) +
    (role === "Employee"
      ? /* HTML */ `
          <div class="hero">
            <div class="eyebrow">WE’RE HERE TO HELP</div>
            <h2>Something not working?</h2>
            <p>
              Tell us what happened. We’ll find the right technician and keep
              you updated from report to resolution.
            </p>
            ${createButton("Create a support request →", "create", "primary")}
          </div>
        `
      : "") +
    metrics() +
    /* HTML */ `
      <div class="content-grid">
        ${queue()}
        <div class="side-stack">
          <section class="alert-card">
            <h3>
              ◷
              ${alerts.length
                ? alerts.length + " incidents need attention"
                : "No immediate SLA alerts"}
            </h3>
            <p>
              ${alerts.length
                ? "Response or resolution deadlines need a closer look."
                : "Your current incident queue is within its monitored targets."}
            </p>
            ${createButton("Review SLA alerts →", "sla-alerts", "small")}
          </section>
          ${role === "Employee"
            ? /* HTML */ `
                <section class="panel">
                  <div class="panel-head"><h2>What happens next?</h2></div>
                  <div class="panel-body small-text">
                    <p>1. We classify and prioritize your request.</p>
                    <p>2. A technician investigates and updates you.</p>
                    <p>3. You verify the resolution before closure.</p>
                  </div>
                </section>
              `
            : workload()}${serviceHealth()}
        </div>
      </div>
    `
  );
}

function proposalSection(i) {
  if (!i.proposal) {
    return "";
  }
  const p = i.proposal;
  const canReview = role === "Technician" && i.technician === getCurrentUser();
  return /* HTML */ `
    <section class="detail-section proposal-section">
      <div class="proposal-heading">
        <h3>Suggested improvement</h3>
        ${createStatusBadge(
          p.status,
          p.status === "Declined"
            ? "p4"
            : p.status === "Implemented"
              ? "resolved"
              : "p2",
        )}
      </div>
      <p class="proposal-text">${escapeHtml(p.text)}</p>
      <p class="small-text">
        Proposed by ${escapeHtml(i.reporter)} · Reviewed separately from
        incident resolution
      </p>
      ${p.reviewer
        ? /* HTML */ `
            <div class="callout">
              <strong>
                ${escapeHtml(p.status)} by ${escapeHtml(p.reviewer)}
              </strong>
              ${p.note
                ? /* HTML */ `
                    <br />
                    ${escapeHtml(p.note)}
                  `
                : ""}
              <br />
              <span class="small-text">${formatDateTime(p.reviewedAt)}</span>
            </div>
          `
        : ""}${canReview && ["Proposed", "Accepted"].includes(p.status)
        ? /* HTML */ `
            <div class="actions" style="margin-top:14px">
              ${p.status === "Proposed"
                ? createButton(
                    "Accept proposal",
                    "proposal-accept",
                    "primary small",
                  ) +
                  createButton("Decline proposal", "proposal-decline", "small")
                : createButton(
                    "Mark implemented",
                    "proposal-implement",
                    "primary small",
                  )}
            </div>
            <p class="small-text">
              Accepting a proposal records your decision. Mark it implemented
              only after making the change.
            </p>
          `
        : ""}
    </section>
  `;
}

function decideProposal(decision) {
  const i = getSelectedIncident();
  if (role !== "Technician" || i.technician !== getCurrentUser()) {
    return;
  }
  modal(
    decision === "Accepted"
      ? "Accept proposal"
      : decision === "Declined"
        ? "Decline proposal"
        : "Mark implemented",
    /* HTML */ `
      <div class="callout">${escapeHtml(i.proposal.text)}</div>
      <label class="field" style="margin-top:18px">
        ${decision === "Implemented"
          ? "Implementation details"
          : "Decision note"}
        <span class="small-text">Optional · visible to the reporter</span>
        <textarea
          name="decisionNote"
          maxlength="2000"
          placeholder="${decision === "Declined"
            ? "Explain why this change is not being taken forward…"
            : decision === "Implemented"
              ? "Describe the change you made…"
              : "Share your next steps…"}"
        ></textarea>
      </label>
    `,
    (f) => {
      reviewProposal(
        i,
        role,
        getCurrentUser(),
        decision,
        f.get("decisionNote"),
        getCurrentTime(),
      );
      audit(i, `Improvement proposal ${decision.toLowerCase()}`);
      notify(i, `Improvement proposal ${decision.toLowerCase()}`);
      save();
      getElement("#modal").close();
      render();
      toast("Proposal decision saved.");
    },
  );
}

function detail() {
  const i = getSelectedIncident();
  if (!i || !getVisibleIncidents().includes(i)) {
    selected = null;
    return overview();
  }
  const s = sla(i, getCurrentTime(), appData.policies);
  const next = nextStatus(i, role);
  const notes = i.notes.filter((n) => role !== "Employee" || !n.internal);
  return `${heading("Incident workspace", "One place for context, collaboration, and resolution.", createButton("← Back to incidents", "back"))}<div class="detail-grid"><section class="panel"><div class="detail-header"><span class="small-text">INC-${i.id} · ${escapeHtml(i.service)}</span><h2>${escapeHtml(i.title)}</h2><div class="pill-row">${createStatusBadge(i.priority)}${createStatusBadge(i.status)}${i.escalated ? createStatusBadge("Escalated", "breached") : ""}</div></div><div class="detail-section"><h3>Description</h3><p>${escapeHtml(i.description)}</p><div class="facts" style="margin-top:22px">${[
    ["Reported by", i.reporter],
    ["Assigned technician", i.technician || "Unassigned"],
    ["Category", i.category],
    ["Created", formatDateTime(i.created)],
  ]
    .map(
      ([k, v]) => /* HTML */ `
        <div class="fact">
          <label>${k}</label>
          <span>${escapeHtml(v)}</span>
        </div>
      `,
    )
    .join(
      "",
    )}</div></div>${proposalSection(i)}<div class="detail-section"><h3>Priority reasoning</h3><div class="callout">Impact ${i.impact} × urgency ${i.urgency} × service criticality ${services.find((s) => s.name === i.service).criticality} = ${i.impact * i.urgency * services.find((s) => s.name === i.service).criticality}. Assigned ${i.priority} using the configured score thresholds.</div></div>${
    i.resolution
      ? /* HTML */ `
          <div class="detail-section">
            <h3>Resolution</h3>
            <p>${escapeHtml(i.resolution)}</p>
            ${i.feedback
              ? /* HTML */ `
                  <p>Employee feedback: ${escapeHtml(i.feedback)}</p>
                `
              : ""}
          </div>
        `
      : ""
  }<div class="detail-section"><h3>Conversation & investigation</h3>${
    notes.length
      ? notes
          .map(
            (n) => /* HTML */ `
              <div class="note">
                <div class="row">
                  <strong>${escapeHtml(n.author)}</strong>
                  <span class="small-text">
                    ${formatDateTime(n.time)}${n.internal ? " · Internal" : ""}
                  </span>
                </div>
                <p>${escapeHtml(n.text)}</p>
              </div>
            `,
          )
          .join("")
      : "<p>No notes yet. Add information to help the investigation.</p>"
  }${
    i.status !== "Closed"
      ? /* HTML */ `
          <form id="note-form">
            <label class="field">
              ${role === "Employee" ? "Add information" : "Investigation note"}
              <textarea
                name="note"
                required
                maxlength="2000"
                placeholder="Share an update…"
              ></textarea>
            </label>
            ${role !== "Employee"
              ? '<label class="check-field"><input type="checkbox" name="internal"> Internal note · visible to support only</label>'
              : ""}
            <div class="actions">
              ${createButton("Post note", "post-note", "primary small")}
              <span class="small-text">
                ${role === "Employee"
                  ? "Visible to your support team"
                  : "Resolution details are requested separately"}
              </span>
            </div>
          </form>
        `
      : ""
  }</div></section><div class="side-stack"><section class="panel"><div class="panel-head"><h2>SLA & next action</h2>${createStatusBadge(s.label)}</div><div class="panel-body"><div class="facts"><div class="fact"><label>Response deadline</label><span>${formatDateTime(s.responseDue)}</span></div><div class="fact"><label>Resolution deadline</label><span>${formatDateTime(s.resolutionDue)}</span></div></div><p class="small-text">${s.responseBreached ? "Response target missed. " : i.acknowledged ? "Response acknowledged. " : "Waiting for acknowledgement. "}${s.resolutionBreached ? "Resolution target missed." : ""}</p>${next ? createButton(next === "In progress" ? "Start investigation" : next === "Acknowledged" ? "Acknowledge incident" : next === "Resolved" ? "Provide resolution" : next === "Verified" ? "Verify resolution" : next === "Closed" ? "Close incident" : next, "transition", "primary") : ""}${
    role === "Administrator"
      ? /* HTML */ `
          <div style="margin-top:12px">
            ${createButton("Change assignment", "reassign", "small")}
          </div>
        `
      : ""
  }${role === "Employee" && i.status === "Verified" ? '<p class="small-text">Thank you. Support can now close this incident.</p>' : ""}${role === "Employee" && i.status === "Closed" && !i.feedback ? createButton("Leave feedback", "feedback", "small") : ""}</div></section><section class="panel"><div class="panel-head"><h2>Activity timeline</h2></div><div class="panel-body"><div class="timeline">${i.history
    .slice()
    .reverse()
    .map(
      (h) => /* HTML */ `
        <div class="event">
          <p>${escapeHtml(h.text)}</p>
          <time>${formatDateTime(h.time)} · ${escapeHtml(h.actor)}</time>
        </div>
      `,
    )
    .join("")}</div></div></section></div></div>`;
}

function servicesPage() {
  return (
    heading("IT services", "The services your organization depends on.") +
    /* HTML */ `
      <div class="service-grid">
        ${services
          .map((s) => {
            const n = appData.incidents.filter(
              (i) => active(i) && i.service === s.name,
            ).length;
            return /* HTML */ `
              <section class="panel service-card">
                <span class="stat-icon">◇</span>
                <h3>${escapeHtml(s.name)}</h3>
                <p>
                  ${escapeHtml(s.owner)}
                  <br />
                  Category: ${s.category}
                  <br />
                  Business criticality: ${s.criticality} / 3
                </p>
                <div class="actions">
                  ${createStatusBadge(
                    n + " active incidents",
                    n ? "at-risk" : "on-track",
                  )}${createButton(
                    "View incidents →",
                    "service-incidents",
                    "small",
                    `data-service="${escapeHtml(s.name)}"`,
                  )}
                </div>
              </section>
            `;
          })
          .join("")}
      </div>
    `
  );
}

function techniciansPage() {
  return (
    heading("Technicians", "Skills, availability, and active work.") +
    /* HTML */ `
      <div class="service-grid">
        ${technicians
          .map(
            (t) => /* HTML */ `
              <section class="panel service-card">
                <span class="avatar">${initials(t.name)}</span>
                <h3>${t.name}</h3>
                <p>${t.skills.join(" · ")}</p>
                ${createStatusBadge("Available", "on-track")}
                <p>
                  ${appData.incidents.filter(
                    (i) => active(i) && i.technician === t.name,
                  ).length}
                  active incidents
                </p>
                ${createButton(
                  "View workload →",
                  "technician-incidents",
                  "small",
                  `data-technician="${t.name}"`,
                )}
              </section>
            `,
          )
          .join("")}
      </div>
    `
  );
}

function reports() {
  const all = appData.incidents;
  return (
    heading(
      "Reports & insights",
      "Operational summaries calculated from your demo incidents.",
      createButton("Export incidents CSV", "export"),
    ) +
    metrics() +
    /* HTML */ `
      <div class="content-grid">
        <section class="panel">
          <div class="panel-head"><h2>Incidents by service</h2></div>
          <div class="panel-body report-bars">
            ${services
              .map((s) => {
                const n = all.filter((i) => i.service === s.name).length;
                return /* HTML */ `
                  <div class="report-bar">
                    <div class="workload-line">
                      <span>${s.name}</span>
                      <span>${n} incidents</span>
                    </div>
                    <div class="bar">
                      <div
                        class="bar-fill"
                        style="width:${all.length
                          ? (n / all.length) * 100
                          : 0}%"
                      ></div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </section>
        ${workload()}
      </div>
    `
  );
}

function settings() {
  return (
    heading(
      "SLA & assignment",
      "Configure the behavior of this local prototype.",
    ) +
    /* HTML */ `
      <div class="content-grid">
        <section class="panel">
          <div class="panel-head">
            <h2>Service level targets</h2>
            <span class="small-text">Elapsed minutes · 24/7 clock</span>
          </div>
          <div class="panel-body">
            <form id="policy-form">
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>PRIORITY</th>
                      <th>RESPONSE (MIN)</th>
                      <th>RESOLUTION (MIN)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${Object.entries(appData.policies)
                      .map(
                        ([p, t]) => /* HTML */ `
                          <tr>
                            <td>${createStatusBadge(p)}</td>
                            <td>
                              <label class="field">
                                <input
                                  aria-label="${p} response minutes"
                                  name="${p}-response"
                                  type="number"
                                  min="1"
                                  max="10080"
                                  required
                                  value="${t.response}"
                                />
                              </label>
                            </td>
                            <td>
                              <label class="field">
                                <input
                                  aria-label="${p} resolution minutes"
                                  name="${p}-resolution"
                                  type="number"
                                  min="1"
                                  max="10080"
                                  required
                                  value="${t.resolution}"
                                />
                              </label>
                            </td>
                          </tr>
                        `,
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
              <p class="small-text">
                Changing targets recalculates deadlines for demo incidents.
              </p>
              <div id="policy-error" class="error" role="alert"></div>
              <button class="button primary" type="submit">
                Save SLA targets
              </button>
            </form>
          </div>
        </section>
        <div class="side-stack">
          <section class="panel">
            <div class="panel-head"><h2>Assignment strategy</h2></div>
            <div class="panel-body">
              <label class="field">
                Active strategy
                <select id="strategy">
                  ${["Skill based", "Least loaded"]
                    .map(
                      (s) => /* HTML */ `
                        <option ${s === appData.strategy ? "selected" : ""}>
                          ${s}
                        </option>
                      `,
                    )
                    .join("")}
                </select>
              </label>
              <p class="small-text">
                Both strategies require a matching skill and availability. Skill
                based prefers specialists; least loaded balances active work
                across eligible technicians.
              </p>
              <p class="small-text">
                Applies to newly created incidents or reassignment.
              </p>
            </div>
          </section>
          <section class="alert-card">
            <h3>Demo clock</h3>
            <p>
              Advance the simulated clock to test warnings and escalation. Real
              time continues to pass too.
            </p>
            ${createButton("Advance 10 minutes", "advance", "small")}
            <p>Clock offset: +${appData.offset / 60000} minutes</p>
          </section>
        </div>
      </div>
    `
  );
}

function auditPage() {
  const events = appData.incidents
    .flatMap((i) => i.history.map((h) => ({ ...h, id: i.id })))
    .sort((a, b) => b.time - a.time);
  return (
    heading("Audit log", "The history of actions across every incident.") +
    /* HTML */ `
      <section class="panel">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>TIME</th>
                <th>INCIDENT</th>
                <th>ACTOR</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              ${events
                .map(
                  (h) => /* HTML */ `
                    <tr>
                      <td>${formatDateTime(h.time)}</td>
                      <td>
                        <button class="incident-link" data-incident="${h.id}">
                          INC-${h.id}
                        </button>
                      </td>
                      <td>${escapeHtml(h.actor)}</td>
                      <td style="white-space:normal">${escapeHtml(h.text)}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `
  );
}

function knowledge() {
  return (
    heading(
      "Knowledge base",
      "Helpful first steps and previously resolved issues.",
    ) +
    /* HTML */ `
      <section class="panel">
        ${[
          [
            "Payment portal unavailable",
            "Check whether the service is affected for other users. Report the exact error, time, and affected department. Never include payment credentials in your incident.",
          ],
          [
            "Campus Wi-Fi disconnects",
            "Reconnect to the campus network and note your building and access point location. If multiple devices are affected, report a network incident.",
          ],
          [
            "Cannot sign in",
            "Check your account identifier and use the official password reset flow. IT will never ask you to send your password.",
          ],
          ...appData.incidents
            .filter((i) => i.resolution)
            .map((i) => [i.title, i.resolution]),
        ]
          .map(
            ([title, body]) => /* HTML */ `
              <details class="knowledge">
                <summary>${escapeHtml(title)}</summary>
                <p>${escapeHtml(body)}</p>
              </details>
            `,
          )
          .join("")}
      </section>
    `
  );
}

function notifications() {
  const list = appData.notifications.filter(
    (n) =>
      role === "Administrator" ||
      n.audience === getCurrentUser() ||
      n.technician === getCurrentUser(),
  );
  return (
    heading("Notifications", "In-app activity and simulated outgoing email.") +
    /* HTML */ `
      <section class="panel">
        ${list.length
          ? list
              .map(
                (n) => /* HTML */ `
                  <div class="notification">
                    <span class="stat-icon">
                      ${n.channel === "Email simulation" ? "✉" : "◷"}
                    </span>
                    <div>
                      <h3>${escapeHtml(n.title)}</h3>
                      <p>${escapeHtml(n.text)}</p>
                      <span class="small-text">
                        ${formatDateTime(n.time)} · ${escapeHtml(n.channel)} ·
                        ${n.channel === "Email simulation"
                          ? "Not sent externally"
                          : "Demo inbox"}
                      </span>
                    </div>
                  </div>
                `,
              )
              .join("")
          : '<div class="empty">No notifications yet. Create or update an incident to see them here.</div>'}
      </section>
    `
  );
}

function themeToggle() {
  return /* HTML */ `
    <button
      class="theme-switch"
      role="switch"
      data-action="theme"
      aria-label="Dark mode"
      aria-checked="${document.documentElement.dataset.theme === "dark"}"
      title="Toggle dark mode"
    >
      <span class="theme-switch-track" aria-hidden="true">
        <span class="theme-switch-thumb">
          ${document.documentElement.dataset.theme === "dark" ? "☾" : "☀"}
        </span>
      </span>
    </button>
  `;
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    localStorage.setItem("incident-desk-theme", dark ? "dark" : "light");
  } catch {
    toast("Theme changed for this session. Browser storage is unavailable.");
  }
  const button = document.querySelector('[data-action="theme"]');
  if (button) {
    button.setAttribute("aria-checked", String(dark));
    button.querySelector(".theme-switch-thumb").textContent = dark ? "☾" : "☀";
  }
}

function render() {
  const pages = {
    Overview: overview,
    Incidents: () =>
      heading(
        role === "Employee" ? "My incidents" : "Incidents",
        "Search, filter, and follow every step of an incident.",
        createButton("＋ Report incident", "create", "primary"),
      ) + queue(),
    "IT services": servicesPage,
    Technicians: techniciansPage,
    Reports: reports,
    "SLA & assignment": settings,
    "Audit log": auditPage,
    "Knowledge base": knowledge,
    Notifications: notifications,
  };
  getElement("#app").innerHTML =
    nav() +
    /* HTML */ `
      <div class="layout">
        <header class="topbar">
          <div class="breadcrumb">
            Workspace
            <span style="padding:0 12px">/</span>
            <strong>${selected ? "Incident detail" : page}</strong>
          </div>
          <div class="top-right">
            <span class="badge">Prototype</span>
            ${themeToggle()}
            <label class="role-control">
              Preview as
              <select id="role" aria-label="Preview role">
                ${["Administrator", "Technician", "Employee"]
                  .map(
                    (r) => /* HTML */ `
                      <option ${r === role ? "selected" : ""}>${r}</option>
                    `,
                  )
                  .join("")}
              </select>
            </label>
            <button
              class="icon-button"
              data-page="Notifications"
              aria-label="Open notifications"
            >
              ♧
              <span class="notification-dot"></span>
            </button>
            <span class="avatar" title="${getCurrentUser()}">
              ${initials(getCurrentUser())}
            </span>
          </div>
        </header>
        <main class="main">
          ${selected ? detail() : (pages[page] || overview)()}
          <footer class="footer">
            <span>
              Incident Desk · Local prototype · Sample data saved in this
              browser
            </span>
            <span>
              ${escapeHtml(getCurrentUser())} ·
              ${createButton("Reset demo", "reset", "small")}
            </span>
          </footer>
        </main>
      </div>
    `;
  bindForms();
}
// Forms and dialogs for creating or updating incidents.

function modal(title, content, onSubmit) {
  const d = getElement("#modal");
  d.innerHTML = /* HTML */ `
    <div class="modal-header">
      <h2>${title}</h2>
      <button class="icon-button" data-close aria-label="Close dialog">
        ×
      </button>
    </div>
    <form id="modal-form" class="modal-body">
      ${content}
      <div id="form-error" class="error" role="alert"></div>
      <div class="modal-foot">
        <button type="button" class="button" data-close>Cancel</button>
        <button class="button primary" type="submit">
          ${title === "Report an incident" ? "Submit incident" : "Save changes"}
        </button>
      </div>
    </form>
  `;
  d.querySelectorAll("[data-close]").forEach(
    (b) => (b.onclick = () => d.close()),
  );
  getElement("#modal-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      onSubmit(new FormData(e.target));
    } catch (err) {
      getElement("#form-error").textContent = err.message;
    }
  };
  d.showModal();
}

function create() {
  modal(
    "Report an incident",
    /* HTML */ `
      <label class="field">
        Short title
        <input
          name="title"
          id="new-title"
          required
          minlength="5"
          maxlength="150"
          placeholder="e.g. Payment portal is unavailable"
        />
      </label>
      <label class="field">
        Affected service
        <select name="service" id="new-service">
          ${services
            .map(
              (s) => /* HTML */ `
                <option>${s.name}</option>
              `,
            )
            .join("")}
        </select>
      </label>
      <label class="field">
        What happened?
        <textarea
          name="description"
          required
          minlength="10"
          maxlength="5000"
          placeholder="Describe the issue, error, and affected users…"
        ></textarea>
      </label>
      <label class="field">
        Suggested improvement
        <span class="small-text">
          Optional · propose a change to the existing system
        </span>
        <textarea
          name="proposal"
          aria-label="Suggested improvement"
          maxlength="2000"
          placeholder="e.g. Show a service-status banner before users attempt a payment."
        ></textarea>
        <span class="small-text">
          Your technician can review this separately and choose whether to
          implement it.
        </span>
      </label>
      <div class="two-fields">
        <label class="field">
          Impact
          <select name="impact" id="new-impact">
            <option value="1">One person</option>
            <option value="2">A department</option>
            <option value="3">Organization wide</option>
          </select>
        </label>
        <label class="field">
          Urgency
          <select name="urgency" id="new-urgency">
            <option value="1">Can wait</option>
            <option value="2">Work is affected</option>
            <option value="3">Work has stopped</option>
          </select>
        </label>
      </div>
      <div class="callout" id="new-preview"></div>
      <div id="duplicate-preview" style="margin-top:12px"></div>
    `,
    (f) => {
      const service = services.find((s) => s.name === f.get("service"));
      const title = f.get("title").trim();
      const description = f.get("description").trim();
      if (title.length < 5 || description.length < 10) {
        throw Error("Please provide a title and a useful description.");
      }
      const i = {
        id: Math.max(1023, ...appData.incidents.map((i) => i.id)) + 1,
        title,
        description,
        service: service.name,
        category: service.category,
        impact: +f.get("impact"),
        urgency: +f.get("urgency"),
        priority: priority(
          f.get("impact"),
          f.get("urgency"),
          service.criticality,
        ),
        reporter: getCurrentUser(),
        created: getCurrentTime(),
        status: "Assigned",
        technician: assign(
          service.category,
          appData.incidents,
          appData.strategy,
        ),
        acknowledged: null,
        resolved: null,
        resolution: "",
        proposal: f.get("proposal").trim()
          ? {
              text: f.get("proposal").trim(),
              status: "Proposed",
              reviewer: null,
              note: "",
              reviewedAt: null,
            }
          : null,
        notes: [],
        history: [],
        escalated: false,
      };
      if (!i.technician) {
        throw Error("No eligible technician is available.");
      }
      audit(i, "Incident reported");
      if (i.proposal) {
        audit(i, "Improvement proposal submitted");
      }
      audit(
        i,
        `Classified as ${i.category}; priority calculated as ${i.priority}`,
      );
      audit(
        i,
        `Assigned to ${i.technician} using ${appData.strategy.toLowerCase()} strategy`,
      );
      appData.incidents.unshift(i);
      notify(i, "Incident created and assigned");
      save();
      getElement("#modal").close();
      selected = i.id;
      page = "Incidents";
      render();
      toast(`INC-${i.id} created and assigned to ${i.technician}`);
    },
  );
  const preview = () => {
    const s = services.find((s) => s.name === getElement("#new-service").value);
    getElement("#new-preview").textContent =
      `Suggested priority: ${priority(getElement("#new-impact").value, getElement("#new-urgency").value, s.criticality)} · Category: ${s.category} · Assignment: ${appData.strategy}`;
    const ds = duplicates(
      getElement("#new-title").value,
      s.name,
      appData.incidents,
    );
    getElement("#duplicate-preview").innerHTML = ds.length
      ? /* HTML */ `
          <div class="callout">
            Possible duplicate: INC-${ds[0].id} — ${escapeHtml(ds[0].title)}
            <br />
            <span class="small-text">
              Compare with the existing incident before submitting a separate
              report.
            </span>
          </div>
        `
      : "";
  };
  ["#new-title", "#new-service", "#new-impact", "#new-urgency"].forEach((s) =>
    getElement(s).addEventListener("input", preview),
  );
  preview();
}

function changeState() {
  const i = getSelectedIncident();
  const next = nextStatus(i, role);
  if (!next) {
    return;
  }
  if (next === "Resolved") {
    modal(
      "Provide resolution",
      '<label class="field">Resolution details<textarea name="resolution" required minlength="10" maxlength="3000" placeholder="What was fixed and how was it verified?"></textarea></label>',
      (f) => {
        const text = f.get("resolution").trim();
        if (text.length < 10) {
          throw Error("Describe the resolution in at least 10 characters.");
        }
        commitTransition(i, text);
        getElement("#modal").close();
      },
    );
  } else {
    commitTransition(i, "");
  }
}

function commitTransition(i, note) {
  const before = i.status;
  transition(i, role, note, getCurrentTime());
  audit(i, `${before} → ${i.status}`);
  notify(i, `Incident ${i.status.toLowerCase()}`);
  save();
  render();
  toast(`INC-${i.id} is now ${i.status.toLowerCase()}.`);
}

function reassign() {
  const i = getSelectedIncident();
  modal(
    "Change assignment",
    /* HTML */ `
      <label class="field">
        Technician
        <select name="technician">
          ${technicians
            .filter((t) => t.available && t.skills.includes(i.category))
            .map(
              (t) => /* HTML */ `
                <option ${i.technician === t.name ? "selected" : ""}>
                  ${t.name}
                </option>
              `,
            )
            .join("")}
        </select>
      </label>
      <div class="callout">
        ${appData.strategy} recommendation:
        ${assign(i.category, appData.incidents, appData.strategy) ||
        "No eligible technician"}
        <br />
        Only available technicians with a matching skill are shown.
      </div>
    `,
    (f) => {
      i.technician = f.get("technician");
      audit(i, `Assigned to ${i.technician}`);
      notify(i, "Technician assignment updated");
      save();
      getElement("#modal").close();
      render();
      toast("Assignment updated.");
    },
  );
}

function monitor() {
  let changed = false;
  for (const i of appData.incidents) {
    if (
      active(i) &&
      !i.escalated &&
      sla(i, getCurrentTime(), appData.policies).label === "Breached"
    ) {
      i.escalated = true;
      i.history.push({
        time: getCurrentTime(),
        actor: "SLA monitor",
        text: "SLA target breached; escalated to administrator",
      });
      notify(i, "SLA breach escalated");
      changed = true;
    }
  }
  if (changed) {
    save();
  }
  return changed;
}

function bindForms() {
  const nf = getElement("#note-form");
  if (nf) {
    nf.onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(nf);
      const text = f.get("note").trim();
      if (!text) {
        return;
      }
      const i = getSelectedIncident();
      i.notes.push({
        text,
        author: getCurrentUser(),
        time: getCurrentTime(),
        internal: f.has("internal"),
      });
      audit(
        i,
        f.has("internal")
          ? "Internal investigation note added"
          : "Conversation note added",
      );
      save();
      render();
      toast("Note added.");
    };
  }
  const pf = getElement("#policy-form");
  if (pf) {
    pf.onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(pf);
      for (const p of Object.keys(appData.policies)) {
        if (+f.get(p + "-resolution") < +f.get(p + "-response")) {
          getElement("#policy-error").textContent =
            "Resolution targets must be at least as long as response targets.";
          return;
        }
      }
      for (const p of Object.keys(appData.policies)) {
        appData.policies[p] = {
          response: +f.get(p + "-response"),
          resolution: +f.get(p + "-resolution"),
        };
      }
      save();
      monitor();
      render();
      toast("SLA targets updated.");
    };
  }
}

function exportCSV() {
  const lines = [
    ["ID", "Title", "Service", "Priority", "Status", "Technician", "Reporter"],
    ...appData.incidents.map((i) => [
      "INC-" + i.id,
      i.title,
      i.service,
      i.priority,
      i.status,
      i.technician,
      i.reporter,
    ]),
  ];
  const csv = lines
    .map((r) =>
      r
        .map(
          (v) =>
            '"' +
            String(v ?? "")
              .replaceAll('"', '""')
              .replace(/^[=+@-]/, "'$&") +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "incident-desk-demo.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Event listeners: connect buttons and form controls to their actions.
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) {
    return;
  }
  if (b.dataset.action === "theme") {
    toggleTheme();
    return;
  }
  if (b.dataset.page) {
    page = b.dataset.page;
    selected = null;
    filters = {};
    tab = "All incidents";
    render();
    return;
  }
  if (b.dataset.incident) {
    openIncident(b.dataset.incident);
    return;
  }
  if (b.dataset.tab) {
    tab = b.dataset.tab;
    render();
    return;
  }
  const a = b.dataset.action;
  switch (a) {
    case "proposal-accept":
      decideProposal("Accepted");
      break;
    case "proposal-decline":
      decideProposal("Declined");
      break;
    case "proposal-implement":
      decideProposal("Implemented");
      break;
    case "create":
      create();
      break;
    case "back":
      selected = null;
      render();
      break;
    case "clear-filters":
      filters = {};
      render();
      break;
    case "sla-alerts":
      selected = null;
      page = "Incidents";
      filters = { sla: "Breached" };
      tab = "Open";
      render();
      break;
    case "service-incidents":
      page = "Incidents";
      filters = { service: b.dataset.service };
      render();
      break;
    case "technician-incidents":
      page = "Incidents";
      filters = { technician: b.dataset.technician };
      render();
      break;
    case "transition":
      changeState();
      break;
    case "reassign":
      if (role === "Administrator") {
        reassign();
      }
      break;
    case "advance":
      appData.offset += 600000;
      monitor();
      save();
      render();
      toast("Demo clock advanced by 10 minutes. SLA checks completed.");
      break;
    case "export":
      exportCSV();
      break;
    case "feedback":
      modal(
        "Leave feedback",
        '<label class="field">How was the support?<textarea name="feedback" required maxlength="1000"></textarea></label>',
        (f) => {
          const text = f.get("feedback").trim();
          if (!text) {
            throw Error("Please enter feedback.");
          }
          getSelectedIncident().feedback = text;
          audit(getSelectedIncident(), "Employee feedback provided");
          save();
          getElement("#modal").close();
          render();
          toast("Thank you for your feedback.");
        },
      );
      break;
    case "reset":
      modal(
        "Reset demo",
        '<p class="subtitle">Restore the original sample incidents, notes, targets, and clock. Changes made in this prototype will be cleared.</p>',
        () => {
          appData = seed();
          save();
          selected = null;
          page = "Overview";
          filters = {};
          tab = "All incidents";
          getElement("#modal").close();
          monitor();
          render();
          toast("Sample data restored.");
        },
      );
      break;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "role") {
    role = e.target.value;
    page = "Overview";
    selected = null;
    filters = {};
    tab = "All incidents";
    render();
  }
  if (e.target.dataset.filter) {
    filters[e.target.dataset.filter] = e.target.value;
    render();
  }
  if (e.target.id === "strategy") {
    appData.strategy = e.target.value;
    save();
    toast("Assignment strategy saved.");
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    filters.q = e.target.value;
    getElement("#incident-rows").innerHTML = rows();
  }
});
// Start the page and periodically check SLA deadlines.
monitor();
render();
setInterval(() => {
  const changed = monitor();
  if (
    !getElement("#modal").open &&
    !document.activeElement.matches("input,textarea,select")
  ) {
    if (changed || page === "Overview" || page === "Incidents") {
      render();
    }
  }
}, 30000);
