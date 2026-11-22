// Incident Desk web client. Everything shown comes from the authenticated API;
// the browser only keeps its session token (in sessionStorage) and UI state.
// All dynamic text passes through escapeHtml before it is placed in a template.
import { TerminalSession } from "./terminal-session.js";
import { createTerminalApi } from "./terminal-client.js";
import { ApiError, del, get, handleSessionExpiry, hasToken, patch, post, query, request, setToken } from "./ui/api.js";
import { csvCell, escapeHtml, formatDateTime } from "./ui/helpers.js";
import { installRipples, morph } from "./ui/fx.js";
import { auditPage, peoplePage, reportsPage, servicesPage, settingsPage } from "./ui/adminViews.js";
import { authScreen, detail, heading, incidentQueue, incidentRows, knowledge, notifications, overview, shell, terminalPage } from "./ui/views.js";

const $ = (selector) => document.querySelector(selector);
const AUDIT_ACTIONS = [
  "INCIDENT_CREATED", "INCIDENT_CLASSIFIED", "TECHNICIAN_ASSIGNED", "ASSIGNMENT_FAILED", "INCIDENT_ACKNOWLEDGED", "INVESTIGATION_STARTED",
  "INCIDENT_RESOLVED", "INCIDENT_VERIFIED", "INCIDENT_REOPENED", "INCIDENT_CLOSED", "PRIORITY_CHANGED", "NOTE_ADDED", "INFO_REQUESTED",
  "INFO_PROVIDED", "FEEDBACK_GIVEN", "PROPOSAL_SUBMITTED", "PROPOSAL_REVIEWED", "DUPLICATE_FLAGGED", "SLA_WARNING", "SLA_VIOLATED",
  "INCIDENT_ESCALATED", "USER_CREATED", "USER_UPDATED", "SERVICE_CREATED", "SERVICE_UPDATED", "CATEGORY_SAVED", "SLA_POLICY_SAVED", "SETTINGS_CHANGED",
];

const S = {
  menuOpen: false, user: null, page: "Overview", selected: null, tab: "All incidents", filters: {}, notifTab: "in-app",
  ref: { services: [], categories: [], technicians: [] }, data: {}, unread: 0, openCount: undefined,
  advanceMinutes: 10, terminal: null, auditActions: AUDIT_ACTIONS, clockResult: "", authMode: "login", authError: "",
};
let noticeTimer;
let lastSignature = "";

// ---- small utilities ----------------------------------------------------------------------
function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.style.display = "block";
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (el.style.display = "none"), 4500);
}

const theme = () => document.documentElement.dataset.theme;

const palette = () => document.documentElement.dataset.palette || "harbor";
let fadeTimer;

// Briefly transition colours so a theme or palette change fades instead of snapping.
function fadeColours() {
  const root = document.documentElement;
  root.classList.add("theme-fade");
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => root.classList.remove("theme-fade"), 450);
}

function setPalette(id) {
  fadeColours();
  document.documentElement.dataset.palette = id;
  try {
    localStorage.setItem("incident-desk-palette", id);
  } catch {
    toast("Palette changed for this session. Browser storage is unavailable.");
  }
  render();
}

function setMode(mode) {
  if (mode === theme()) return;
  const dark = mode === "dark";
  fadeColours();
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    localStorage.setItem("incident-desk-theme", dark ? "dark" : "light");
  } catch {
    toast("Theme changed for this session. Browser storage is unavailable.");
  }
  render();
}

async function guard(work, success) {
  try {
    const result = await work();
    if (success) toast(typeof success === "function" ? success(result) : success);
    return result;
  } catch (error) {
    toast(error.message);
    return undefined;
  }
}

// ---- data loading -----------------------------------------------------------------------
function listQuery(extra = {}) {
  const f = S.filters;
  return query({
    q: f.q, priority: f.priority, status: f.status, service: f.service, category: f.category, technician: f.technician,
    sla: f.sla, from: f.from, to: f.to,
    state: S.tab === "Open" ? "open" : S.tab === "Resolved" ? "closed" : undefined,
    limit: 200, ...extra,
  });
}

async function loadRef() {
  const [services, categories] = await Promise.all([get("/api/services"), get("/api/categories")]);
  S.ref.services = services;
  S.ref.categories = categories;
  S.ref.technicians = S.user.role === "Administrator" ? await get("/api/technicians") : [];
}

async function loadChrome() {
  const [notes, open] = await Promise.all([get("/api/notifications?limit=1"), get("/api/incidents?state=open&limit=1")]);
  S.unread = notes.unread;
  S.openCount = open.total;
}

const loaders = {
  async Overview() {
    const unfiltered = !Object.values(S.filters).some(Boolean) && S.tab === "All incidents";
    const all = await get(`/api/incidents${query({ limit: 200 })}`);
    S.data.all = all.items;
    S.data.list = unfiltered ? all : await get(`/api/incidents${listQuery()}`);
    S.data.workload = S.user.role === "Employee" ? [] : await get("/api/reports/workload");
  },
  async Incidents() {
    S.data.list = await get(`/api/incidents${listQuery()}`);
    S.data.all = undefined;
  },
  async "IT services"() {
    await loadRef();
    S.data.serviceStats = await get("/api/reports/services");
  },
  async People() {
    [S.data.users, S.data.workload] = await Promise.all([get("/api/admin/users"), get("/api/reports/workload")]);
  },
  async Reports() {
    const [overview, serviceStats, categoryStats, trend, correlations, slaRisk, violations, workload] = await Promise.all([
      get("/api/reports/overview"), get("/api/reports/services"), get("/api/reports/categories"), get("/api/reports/trend?days=7"),
      get("/api/reports/correlations"), get("/api/reports/sla-risk"), get("/api/reports/sla-violations"), get("/api/reports/workload"),
    ]);
    Object.assign(S.data, { overview, serviceStats, categoryStats, trend, correlations, slaRisk, violations, workload });
  },
  async "SLA & assignment"() {
    await loadRef();
    [S.data.policies, S.data.settings] = await Promise.all([get("/api/sla-policies"), get("/api/admin/settings")]);
  },
  async "Audit log"() {
    S.data.audit = await get(`/api/admin/audit${query({ incident: S.filters.auditIncident, action: S.filters.auditAction, limit: 200 })}`);
  },
  async "Knowledge base"() {
    S.data.knowledge = await get("/api/knowledge");
  },
  async Notifications() {
    S.data.notifications = await get(`/api/notifications${query({ channel: S.notifTab === "email" ? "email" : undefined, limit: 100 })}`);
  },
  async Terminal() {},
};

async function loadCurrent() {
  if (S.selected) S.data.incident = await get(`/api/incidents/${S.selected}`);
  else await loaders[S.page]?.();
  await loadChrome();
}

// Navigate: move the sidebar marker immediately, keep the current content on
// screen while the next page loads, then reveal it with the entrance animation.
async function go(page, { filters = {}, tab = "All incidents", selected = null } = {}) {
  S.page = page;
  S.filters = filters;
  S.tab = tab;
  S.selected = selected;
  S.data.incident = undefined;
  if (mounted) renderChrome();
  else mountLoading();
  await withLoading(() => guard(loadCurrent));
  render({ enter: true });
  if (page === "Terminal") focusTerminal();
}

async function withLoading(work) {
  document.body.classList.add("loading");
  try {
    return await work();
  } finally {
    document.body.classList.remove("loading");
  }
}

const openIncident = (id) => go("Incidents", { selected: Number(id), filters: S.filters, tab: S.tab });

// ---- rendering -----------------------------------------------------------------------------
const pages = {
  Overview: overview,
  Incidents: (s) => heading(s, s.user.role === "Employee" ? "My incidents" : "Incidents", "Search and filter every incident.", `<button class="button primary" data-action="create">Report incident</button>`) + incidentQueue(s, { advanced: true }),
  "IT services": servicesPage,
  People: peoplePage,
  Reports: reportsPage,
  "SLA & assignment": settingsPage,
  "Audit log": auditPage,
  "Knowledge base": knowledge,
  Notifications: notifications,
  Terminal: terminalPage,
};

let mounted = false;

const parse = (html) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
};

function mountLoading() {
  mounted = true;
  $("#app").innerHTML = shell(S, '<div class="empty">Loading…</div>', theme(), palette(), { intro: true });
}

// Update only the sidebar and top bar in place so their CSS transitions play.
function renderChrome() {
  const next = parse(shell(S, "", theme(), palette()));
  morph($(".sidebar"), next.querySelector(".sidebar"));
  morph($(".topbar"), next.querySelector(".topbar"));
}

function render({ enter = false } = {}) {
  const app = $("#app");
  if (!S.user) {
    mounted = false;
    app.innerHTML = authScreen({ mode: S.authMode, error: S.authError, theme: theme(), palette: palette(), open: S.menuOpen });
    bindForms();
    return;
  }
  const body = S.selected ? detail({ ...S }) : (pages[S.page] ?? overview)({ ...S });
  if (!mounted || !$(".layout")) {
    mounted = true;
    app.innerHTML = shell(S, body, theme(), palette(), { intro: true, enter: true });
  } else {
    const next = parse(shell(S, body, theme(), palette(), { enter }));
    morph($(".sidebar"), next.querySelector(".sidebar"));
    morph($(".topbar"), next.querySelector(".topbar"));
    $(".main").replaceWith(next.querySelector(".main"));
  }
  lastSignature = JSON.stringify([S.data, S.unread, S.openCount]);
  bindForms();
}

function focusTerminal() {
  const log = $("#terminal-log");
  if (log) log.scrollTop = log.scrollHeight;
  $("#terminal-input")?.focus({ preventScroll: true });
}

// ---- dialogs ---------------------------------------------------------------------------------
function modal(title, content, onSubmit, { submit = "Save changes", wide = false } = {}) {
  const d = $("#modal");
  d.innerHTML = `<div class="modal-header"><h2>${title}</h2><button class="icon-button" data-close aria-label="Close dialog">×</button></div><form id="modal-form" class="modal-body">${content}<div id="form-error" class="error" role="alert"></div><div class="modal-foot"><button type="button" class="button" data-close>Cancel</button><button class="button primary" type="submit" id="modal-submit">${submit}</button></div></form>`;
  d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => d.close()));
  $("#modal-form").onsubmit = async (event) => {
    event.preventDefault();
    const submitButton = $("#modal-submit");
    submitButton.disabled = true;
    $("#form-error").textContent = "";
    try {
      await onSubmit(new FormData(event.target), event.target);
    } catch (error) {
      $("#form-error").textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  };
  d.style.maxWidth = wide ? "min(760px, 94vw)" : "";
  d.showModal();
}

const closeModal = () => $("#modal").close();

const field = (label, control, hint = "") => `<label class="field">${label}${hint ? `<span class="small-text">${hint}</span>` : ""}${control}</label>`;
const options = (list, selected) => list.map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");

async function afterIncidentChange(result, message) {
  if (result?.id) S.data.incident = result;
  await loadChrome();
  render();
  if (message) toast(message);
}

// Report an incident, with a live preview of priority, SLA, technician and duplicates.
function createIncident() {
  const services = S.ref.services.filter((x) => x.active);
  let force = false;
  let previewTimer;
  modal(
    "Report an incident",
    `${field("Short title", '<input name="title" id="new-title" required minlength="5" maxlength="150" placeholder="e.g. Payment portal is unavailable" />')}
${field("Affected service", `<select name="serviceId" id="new-service">${options(services.map((x) => [x.id, x.name]), "")}</select>`)}
${field("What happened?", '<textarea name="description" id="new-description" required minlength="10" maxlength="5000" placeholder="Describe the issue, error, and affected users..."></textarea>')}
<div class="two-fields">${field("Impact", '<select name="impact" id="new-impact"><option value="1">One person</option><option value="2">A department</option><option value="3">Organization wide</option></select>')}${field("Urgency", '<select name="urgency" id="new-urgency"><option value="1">Can wait</option><option value="2">Work is affected</option><option value="3">Work has stopped</option></select>')}</div>
<div class="two-fields">${field("How many people are affected?", '<input name="affectedUsers" id="new-users" type="number" min="1" max="1000000" value="1" />')}${field("Category", `<select name="category" id="new-category"><option value="">Detect automatically</option>${options(S.ref.categories.map((x) => [x.name, x.name]), "")}</select>`)}</div>
${field("Suggested improvement", '<textarea name="proposal" aria-label="Suggested improvement" maxlength="2000" placeholder="e.g. Show a service-status banner before users attempt a payment."></textarea>', "Optional, propose a change to the existing system")}
<div class="callout" id="new-preview">Fill in the details to see the calculated priority.</div><div id="duplicate-preview" style="margin-top:12px"></div>`,
    async (f) => {
      const body = Object.fromEntries(f);
      body.serviceId = Number(body.serviceId);
      if (!body.category) delete body.category;
      if (!body.proposal?.trim()) delete body.proposal;
      if (force) body.force = true;
      try {
        const created = await post("/api/incidents", body);
        closeModal();
        S.filters = {};
        S.tab = "All incidents";
        S.page = "Incidents";
        S.selected = created.id;
        S.data.incident = created;
        await loadChrome();
        render();
        toast(`${created.displayId} created${created.technician ? ` and assigned to ${created.technician.name}` : ". Waiting for an administrator to assign a technician."}`);
      } catch (error) {
        if (error.code === "DUPLICATE_INCIDENT") {
          force = true;
          $("#modal-submit").textContent = "Submit anyway";
          const matches = (error.details?.matches ?? []).map((m) => `INC-${Number(m.id)}: ${escapeHtml(m.title)}`).join("<br />");
          $("#duplicate-preview").innerHTML = `<div class="callout"><strong>You already reported something very similar.</strong><br />${matches}<br /><span class="small-text">Press “Submit anyway” only if this is a different problem.</span></div>`;
          throw new Error("A very similar open incident of yours already exists.");
        }
        throw error;
      }
    },
    { submit: "Submit incident", wide: true },
  );
  const refreshPreview = async () => {
    const title = $("#new-title").value.trim();
    const description = $("#new-description").value.trim();
    if (title.length < 5 || description.length < 10) return;
    try {
      const p = await post("/api/incidents/preview", {
        title, description, serviceId: Number($("#new-service").value), impact: Number($("#new-impact").value),
        urgency: Number($("#new-urgency").value), affectedUsers: Number($("#new-users").value) || 1, category: $("#new-category").value || undefined,
      });
      $("#new-preview").innerHTML = `Suggested priority: <strong>${escapeHtml(p.priority)}</strong> (score ${Number(p.score)}) · Category: ${escapeHtml(p.category)}<br />SLA: respond within ${Number(p.sla.responseMinutes)} min, resolve within ${Number(p.sla.resolutionMinutes)} min<br />${p.recommendedTechnician ? `Recommended technician: ${escapeHtml(p.recommendedTechnician.name)}` : `Assignment: ${escapeHtml(p.assignmentIssue ?? "pending")}`}`;
      $("#duplicate-preview").innerHTML = p.duplicates.length
        ? `<div class="callout"><strong>Possible duplicate${p.duplicates.length > 1 ? "s" : ""}</strong><br />${p.duplicates.map((d) => `INC-${Number(d.id)}: ${escapeHtml(d.title)} <span class="small-text">(${Math.round(d.score * 100)}% similar)</span>`).join("<br />")}<br /><span class="small-text">Compare with existing incidents before submitting a separate report.</span></div>`
        : "";
    } catch (error) {
      $("#new-preview").textContent = error.message;
    }
  };
  for (const id of ["#new-title", "#new-description", "#new-service", "#new-impact", "#new-urgency", "#new-users", "#new-category"]) {
    $(id).addEventListener("input", () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(refreshPreview, 300);
    });
  }
}

function editIncident() {
  const i = S.data.incident;
  modal(
    "Edit incident",
    `${field("Title", `<input name="title" required minlength="5" maxlength="150" value="${escapeHtml(i.title)}" />`)}${field("Description", `<textarea name="description" required minlength="10" maxlength="5000">${escapeHtml(i.description)}</textarea>`)}<div class="two-fields">${field("Impact", `<select name="impact">${options([[1, "One person"], [2, "A department"], [3, "Organization wide"]], i.impact)}</select>`)}${field("Urgency", `<select name="urgency">${options([[1, "Can wait"], [2, "Work is affected"], [3, "Work has stopped"]], i.urgency)}</select>`)}</div>${field("People affected", `<input name="affectedUsers" type="number" min="1" value="${Number(i.affectedUsers)}" />`)}<p class="small-text">Changing impact, urgency or people affected recalculates priority and SLA deadlines.</p>`,
    async (f) => {
      const result = await patch(`/api/incidents/${i.id}`, { title: f.get("title"), description: f.get("description"), impact: Number(f.get("impact")), urgency: Number(f.get("urgency")), affectedUsers: Number(f.get("affectedUsers")) });
      closeModal();
      await afterIncidentChange(result, "Incident updated.");
    },
  );
}

async function assignIncident() {
  const i = S.data.incident;
  const rec = await guard(() => get(`/api/incidents/${i.id}/recommendations`));
  if (!rec) return;
  const recommended = rec.technicians.find((t) => t.id === rec.recommendedTechnicianId);
  modal(
    i.technician ? "Change assignment" : "Assign technician",
    `${field("Technician", `<select name="technicianId"><option value="">Let the ${escapeHtml(rec.strategy)} strategy choose</option>${rec.technicians.filter((t) => t.available).map((t) => `<option value="${Number(t.id)}" ${t.id === i.technician?.id ? "selected" : ""}>${escapeHtml(t.name)}${t.id === rec.recommendedTechnicianId ? " (recommended)" : ""} · ${Number(t.load)}/${Number(t.capacity)} active${t.skillMatch ? "" : " · no matching skill"}</option>`).join("")}</select>`)}
<div class="callout">${recommended ? `Recommended: <strong>${escapeHtml(recommended.name)}</strong> (${escapeHtml(rec.strategy)} strategy).` : `No automatic recommendation: ${escapeHtml(rec.issue ?? "")}`}</div>
<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Technician</th><th>Skills</th><th>Load</th><th>Exp.</th></tr></thead><tbody>${rec.technicians.map((t) => `<tr><td>${escapeHtml(t.name)}${t.available ? "" : ' <span class="small-text">(unavailable)</span>'}</td><td style="white-space:normal">${escapeHtml(t.skills.join(", "))}</td><td>${Number(t.load)}/${Number(t.capacity)}</td><td>${Number(t.experience)}y</td></tr>`).join("")}</tbody></table></div>`,
    async (f) => {
      const result = await post(`/api/incidents/${i.id}/assign`, f.get("technicianId") ? { technicianId: Number(f.get("technicianId")) } : {});
      closeModal();
      await afterIncidentChange(result, `Assigned to ${result.technician.name}.`);
    },
    { submit: "Assign", wide: true },
  );
}

function textModal(title, label, name, endpoint, bodyKey, success, extra = {}) {
  modal(title, field(label, `<textarea name="${name}" required minlength="5" maxlength="${extra.max ?? 3000}" placeholder="${escapeHtml(extra.placeholder ?? "")}"></textarea>`), async (f) => {
    const result = await post(endpoint(), { [bodyKey]: f.get(name) });
    closeModal();
    await afterIncidentChange(result, success);
  });
}

function giveFeedback() {
  const i = S.data.incident;
  modal(
    "Leave feedback",
    `${field("Rating", `<select name="rating">${options([[5, "5 — Excellent"], [4, "4 — Good"], [3, "3 — Okay"], [2, "2 — Poor"], [1, "1 — Very poor"]], 5)}</select>`)}${field("How was the support?", '<textarea name="comment" maxlength="1000"></textarea>', "Optional")}`,
    async (f) => {
      const result = await post(`/api/incidents/${i.id}/feedback`, { rating: Number(f.get("rating")), comment: f.get("comment") });
      closeModal();
      await afterIncidentChange(result, "Thank you for your feedback.");
    },
  );
}

function setCategory() {
  const i = S.data.incident;
  modal("Change category", field("Category", `<select name="category">${options(S.ref.categories.map((c) => [c.name, c.name]), i.category)}</select>`, "Affects which technicians are considered on reassignment."), async (f) => {
    const result = await post(`/api/incidents/${i.id}/category`, { category: f.get("category") });
    closeModal();
    await afterIncidentChange(result, "Category updated.");
  });
}

function decideProposal(decision) {
  const i = S.data.incident;
  const title = decision === "Accepted" ? "Accept proposal" : decision === "Declined" ? "Decline proposal" : "Mark implemented";
  modal(
    title,
    `<div class="callout">${escapeHtml(i.proposal.text)}</div>${field(decision === "Implemented" ? "Implementation details" : "Decision note", `<textarea name="note" maxlength="2000" placeholder="${decision === "Declined" ? "Explain why this change is not being taken forward..." : decision === "Implemented" ? "Describe the change you made..." : "Share your next steps..."}"></textarea>`, "Optional, visible to the reporter")}`,
    async (f) => {
      const result = await post(`/api/incidents/${i.id}/proposal`, { decision, note: f.get("note") });
      closeModal();
      await afterIncidentChange(result, "Proposal decision saved.");
    },
  );
}

// ---- administrator dialogs --------------------------------------------------------------------
function serviceForm(existing) {
  modal(
    existing ? "Edit IT service" : "Add IT service",
    `${field("Name", `<input name="name" required minlength="2" maxlength="80" value="${escapeHtml(existing?.name ?? "")}" />`)}${field("Category", `<select name="category">${options(S.ref.categories.map((c) => [c.name, c.name]), existing?.category)}</select>`)}<div class="two-fields">${field("Business criticality", `<select name="criticality">${options([[1, "1 — Low"], [2, "2 — Medium"], [3, "3 — Critical"]], existing?.criticality ?? 2)}</select>`)}${field("Owner", `<input name="owner" maxlength="80" value="${escapeHtml(existing?.owner ?? "")}" />`)}</div><label class="check-field"><input type="checkbox" name="active" ${existing?.active === false ? "" : "checked"}> Service is active (can be reported against)</label>`,
    async (f) => {
      const body = { name: f.get("name"), category: f.get("category"), criticality: Number(f.get("criticality")), owner: f.get("owner"), active: f.has("active") };
      if (existing) await patch(`/api/admin/services/${existing.id}`, body);
      else await post("/api/admin/services", body);
      closeModal();
      await loadCurrent();
      render();
      toast(existing ? "Service updated." : "Service added.");
    },
  );
}

function categoryForm(existing) {
  modal(
    existing ? "Edit category" : "Add category",
    `${field("Name", `<input name="name" required minlength="2" maxlength="40" value="${escapeHtml(existing?.name ?? "")}" ${existing ? "readonly" : ""} />`)}${field("Description", `<input name="description" maxlength="200" value="${escapeHtml(existing?.description ?? "")}" />`)}${field("Keywords", `<textarea name="keywords" placeholder="wifi, vpn, router">${escapeHtml((existing?.keywords ?? []).join(", "))}</textarea>`, "Comma separated. Used to suggest this category from the incident text.")}`,
    async (f) => {
      await post("/api/admin/categories", { name: f.get("name"), description: f.get("description"), keywords: f.get("keywords").split(",").map((k) => k.trim()).filter(Boolean) });
      closeModal();
      await loadCurrent();
      render();
      toast("Category saved.");
    },
  );
}

const TITLES = ["Technician", "Team Lead", "System Administrator", "IT Manager"];

function userForm(existing) {
  const role = existing?.role ?? "Employee";
  modal(
    existing ? "Edit user" : "Add user",
    `${field("Full name", `<input name="name" required minlength="2" maxlength="80" value="${escapeHtml(existing?.name ?? "")}" />`)}${field("Email", `<input name="email" type="email" required value="${escapeHtml(existing?.email ?? "")}" />`)}
${existing ? "" : field("Role", `<select name="role" id="user-role">${options([["Employee", "Employee"], ["Technician", "Technician"], ["Administrator", "Administrator"]], role)}</select>`) + field("Initial password", '<input name="password" type="password" autocomplete="new-password" required minlength="8" />', "8+ characters with a letter and a number")}
<div id="staff-fields" style="display:${role === "Employee" ? "none" : "block"}">${field("Escalation title", `<select name="title">${options(TITLES.map((t) => [t, t]), existing?.title ?? "Technician")}</select>`, "Used by automatic escalation: Technician → Team Lead → System Administrator → IT Manager")}
<div id="tech-fields" style="display:${role === "Technician" ? "block" : "none"}"><fieldset class="field"><legend>Skills</legend>${S.ref.categories.map((c) => `<label class="check-field"><input type="checkbox" name="skills" value="${escapeHtml(c.name)}" ${existing?.skills?.includes(c.name) ? "checked" : ""}> ${escapeHtml(c.name)}</label>`).join("")}</fieldset><div class="two-fields">${field("Experience (years)", `<input name="experience" type="number" min="0" max="60" value="${Number(existing?.experience ?? 0)}" />`)}${field("Maximum active incidents", `<input name="maxWorkload" type="number" min="1" max="50" value="${Number(existing?.maxWorkload ?? 5)}" />`)}</div><label class="check-field"><input type="checkbox" name="available" ${existing?.available === false ? "" : "checked"}> Available for new assignments</label></div></div>`,
    async (f) => {
      const r = existing?.role ?? f.get("role");
      const body = { name: f.get("name"), email: f.get("email") };
      if (r !== "Employee") body.title = f.get("title");
      if (r === "Technician") Object.assign(body, { skills: f.getAll("skills"), experience: Number(f.get("experience")), maxWorkload: Number(f.get("maxWorkload")), available: f.has("available") });
      if (existing) await patch(`/api/admin/users/${existing.id}`, body);
      else await post("/api/admin/users", { ...body, role: r, password: f.get("password") });
      closeModal();
      await loadCurrent();
      await loadRef();
      render();
      toast(existing ? "User updated." : "User created.");
    },
    { wide: true },
  );
  $("#user-role")?.addEventListener("change", (e) => {
    $("#staff-fields").style.display = e.target.value === "Employee" ? "none" : "block";
    $("#tech-fields").style.display = e.target.value === "Technician" ? "block" : "none";
  });
}

function policyForm() {
  modal(
    "Service-specific SLA target",
    `${field("Service", `<select name="serviceId">${options(S.ref.services.map((x) => [x.id, x.name]), "")}</select>`)}${field("Priority", `<select name="priority">${options(["P1", "P2", "P3", "P4"].map((p) => [p, p]), "P1")}</select>`)}<div class="two-fields">${field("Response (min)", '<input name="responseMinutes" type="number" min="1" required />')}${field("Resolution (min)", '<input name="resolutionMinutes" type="number" min="1" required />')}</div>`,
    async (f) => {
      await post("/api/admin/sla-policies", { serviceId: Number(f.get("serviceId")), priority: f.get("priority"), responseMinutes: Number(f.get("responseMinutes")), resolutionMinutes: Number(f.get("resolutionMinutes")) });
      closeModal();
      await loadCurrent();
      render();
      toast("SLA target saved.");
    },
  );
}

function confirmModal(title, text, onConfirm, label = "Confirm") {
  modal(title, `<p class="subtitle">${escapeHtml(text)}</p>`, async () => {
    await onConfirm();
    closeModal();
  }, { submit: label });
}

async function exportCsv() {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const page = await get(`/api/incidents${query({ limit: 200, offset })}`);
    rows.push(...page.items);
    if (rows.length >= page.total || !page.items.length) break;
  }
  const lines = [["ID", "Title", "Service", "Category", "Priority", "Status", "SLA", "Technician", "Reporter", "Created"], ...rows.map((i) => [i.displayId, i.title, i.service.name, i.category, i.priority, i.status, i.sla.label, i.technician?.name ?? "", i.reporter.name, new Date(i.createdAt).toISOString()])];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv" }));
  a.download = "incident-desk-incidents.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- terminal -------------------------------------------------------------------------------------
const terminalHistory = [];
let terminalIndex = 0;

function newTerminal() {
  S.terminal = { session: new TerminalSession(createTerminalApi(request, S.user), S.user), busy: false };
}

async function runTerminalCommand(command) {
  if (S.terminal.busy) return;
  S.terminal.busy = true;
  terminalHistory.push(command);
  terminalIndex = terminalHistory.length;
  const input = $("#terminal-input");
  if (input) input.disabled = true;
  await S.terminal.session.send(command);
  S.terminal.busy = false;
  await guard(loadChrome);
  render();
  focusTerminal();
}

// ---- forms bound after each render ------------------------------------------------------------------
function bindForms() {
  const auth = $("#auth-form");
  if (auth) {
    auth.onsubmit = async (event) => {
      event.preventDefault();
      const f = new FormData(auth);
      const email = String(f.get("email")).trim();
      const password = String(f.get("password"));
      try {
        if (S.authMode === "register") {
          await post("/api/auth/register", { name: String(f.get("name")).trim(), email, password });
        }
        const login = await post("/api/auth/login", { email, password });
        setToken(login.token);
        S.authError = "";
        await startSession(login.user);
      } catch (error) {
        S.authError = error.message;
        $("#auth-error").textContent = error.message;
      }
    };
  }
  const terminalForm = $("#terminal-form");
  if (terminalForm) {
    terminalForm.onsubmit = (event) => {
      event.preventDefault();
      runTerminalCommand($("#terminal-input").value);
    };
    $("#terminal-input").onkeydown = (event) => {
      if (["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        terminalIndex = Math.max(0, Math.min(terminalHistory.length, terminalIndex + (event.key === "ArrowUp" ? -1 : 1)));
        event.target.value = terminalHistory[terminalIndex] || "";
      }
    };
  }
  const noteForm = $("#note-form");
  if (noteForm) {
    noteForm.onsubmit = (event) => {
      event.preventDefault();
      postNote(new FormData(noteForm));
    };
  }
  const policyFormEl = $("#policy-form");
  if (policyFormEl) {
    policyFormEl.onsubmit = async (event) => {
      event.preventDefault();
      const f = new FormData(policyFormEl);
      const error = $("#policy-error");
      error.textContent = "";
      for (const p of ["P1", "P2", "P3", "P4"]) {
        if (Number(f.get(`${p}-resolution`)) < Number(f.get(`${p}-response`))) {
          error.textContent = "Resolution targets must be at least as long as response targets.";
          return;
        }
      }
      try {
        for (const p of ["P1", "P2", "P3", "P4"]) {
          await post("/api/admin/sla-policies", { priority: p, responseMinutes: Number(f.get(`${p}-response`)), resolutionMinutes: Number(f.get(`${p}-resolution`)) });
        }
        await loadCurrent();
        render();
        toast("Default SLA targets saved.");
      } catch (e) {
        error.textContent = e.message;
      }
    };
  }
}

async function postNote(f) {
  const i = S.data.incident;
  const text = String(f.get("note")).trim();
  if (!text) return;
  const staff = i.actions.includes("add-note");
  const result = await guard(
    () => (staff ? post(`/api/incidents/${i.id}/notes`, { text, internal: f.has("internal") }) : post(`/api/incidents/${i.id}/respond`, { text })),
    "Note added.",
  );
  if (result) await afterIncidentChange(result);
}

// ---- click handling -----------------------------------------------------------------------------------
const incidentCommands = {
  acknowledge: ["acknowledge", "Incident acknowledged."],
  start: ["start", "Investigation started."],
  verify: ["verify", "Resolution verified."],
  close: ["close", "Incident closed."],
};

async function handleAction(action, target) {
  const i = S.data.incident;
  if (incidentCommands[action] && i) {
    const [path, message] = incidentCommands[action];
    const result = await guard(() => post(`/api/incidents/${i.id}/${path}`), message);
    if (result) await afterIncidentChange(result);
    return;
  }
  switch (action) {
    case "appearance": return toggleMenu();
    case "logout": return logout();
    case "create": return createIncident();
    case "back": return go("Incidents", { filters: S.filters, tab: S.tab });
    case "clear-filters": S.filters = {}; return reloadList();
    case "sla-alerts": return go("Incidents", { filters: { sla: "Breached" }, tab: "Open" });
    case "service-incidents": return go("Incidents", { filters: { service: target.dataset.service } });
    case "edit": return editIncident();
    case "assign": return assignIncident();
    case "set-category": return setCategory();
    case "feedback": return giveFeedback();
    case "resolve": return textModal("Provide resolution", "Resolution details", "resolution", () => `/api/incidents/${i.id}/resolve`, "resolution", "Resolution recorded.", { placeholder: "What was fixed and how was it verified?" });
    case "reopen": return textModal("Reject resolution", "What is still wrong?", "reason", () => `/api/incidents/${i.id}/reopen`, "reason", "Incident reopened.", { max: 1000 });
    case "request-info": return textModal("Request information", "What do you need from the reporter?", "question", () => `/api/incidents/${i.id}/request-info`, "question", "Information requested.", { max: 2000 });
    case "proposal-accept": return decideProposal("Accepted");
    case "proposal-decline": return decideProposal("Declined");
    case "proposal-implement": return decideProposal("Implemented");
    case "read-all":
      await guard(() => post("/api/notifications/read-all"));
      return refreshView();
    case "export": return guard(exportCsv);
    case "service-new": return serviceForm(null);
    case "service-edit": return serviceForm(S.ref.services.find((x) => x.id === Number(target.dataset.id)));
    case "category-new": return categoryForm(null);
    case "category-edit": return categoryForm(S.ref.categories.find((x) => x.name === target.dataset.name));
    case "category-remove":
      return confirmModal("Remove category", `Remove “${target.dataset.name}”? Categories used by services or incidents cannot be removed.`, async () => {
        await del(`/api/admin/categories/${encodeURIComponent(target.dataset.name)}`);
        await loadCurrent();
        render();
        toast("Category removed.");
      }, "Remove");
    case "user-new": return userForm(null);
    case "user-edit": return userForm(S.data.users.find((u) => u.id === Number(target.dataset.id)));
    case "user-password": {
      const id = Number(target.dataset.id);
      return modal("Reset password", field("New password", '<input name="password" type="password" autocomplete="new-password" required minlength="8" />', "The user is signed out everywhere."), async (f) => {
        await post(`/api/admin/users/${id}/password`, { password: f.get("password") });
        closeModal();
        toast("Password reset.");
      });
    }
    case "user-toggle": {
      const u = S.data.users.find((x) => x.id === Number(target.dataset.id));
      return confirmModal(u.active ? "Deactivate user" : "Activate user", u.active ? `${u.name} will be signed out and unable to sign in.` : `${u.name} will be able to sign in again.`, async () => {
        await patch(`/api/admin/users/${u.id}`, { active: !u.active });
        await loadCurrent();
        render();
        toast(u.active ? "User deactivated." : "User activated.");
      }, u.active ? "Deactivate" : "Activate");
    }
    case "policy-new": return policyForm();
    case "policy-remove":
      return confirmModal("Remove SLA target", "Incidents of this service will use the default target for new deadlines.", async () => {
        await del(`/api/admin/sla-policies/${Number(target.dataset.id)}`);
        await loadCurrent();
        render();
      }, "Remove");
    case "advance":
    case "run-monitor": {
      const result = await guard(() => (action === "advance" ? post("/api/admin/simulate-time", { minutes: S.advanceMinutes }) : post("/api/admin/run-sla-monitor")));
      if (result) {
        const m = result.monitor ?? result;
        S.clockResult = `${action === "advance" ? `Clock advanced ${S.advanceMinutes} min; demo time is now ${formatDateTime(result.now)}. ` : ""}Monitor checked ${m.checked} incidents: ${m.warnings} warnings, ${m.violations} violations, ${m.escalations} escalations.`;
        await loadChrome();
        render();
      }
    }
  }
}

// The appearance menu is state, but toggling it only touches the menu itself.
function showMenu(open) {
  S.menuOpen = open;
  const menu = $("#appearance-menu");
  if (!menu) return;
  menu.hidden = !open;
  const trigger = $('[data-action="appearance"]');
  trigger?.setAttribute("aria-expanded", String(open));
}
const toggleMenu = () => showMenu(!S.menuOpen);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.menuOpen) {
    showMenu(false);
    $('[data-action="appearance"]')?.focus();
  }
});

document.addEventListener("click", (e) => {
  if (S.menuOpen && !e.target.closest(".appearance")) showMenu(false);
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.close !== undefined) return;
  if (b.dataset.palettePick) return setPalette(b.dataset.palettePick);
  if (b.dataset.mode) return setMode(b.dataset.mode);
  if (b.dataset.authMode) {
    S.authMode = b.dataset.authMode;
    S.authError = "";
    return render();
  }
  if (b.dataset.terminalCommand) {
    $("#terminal-input").value = b.dataset.terminalCommand;
    $("#terminal-input").focus({ preventScroll: true });
    return;
  }
  if (b.dataset.notifTab) {
    S.notifTab = b.dataset.notifTab;
    return void refreshView();
  }
  if (b.dataset.page) return void go(b.dataset.page);
  if (b.dataset.incident) {
    if (b.dataset.read) post(`/api/notifications/${Number(b.dataset.read)}/read`).catch(() => {});
    return void openIncident(b.dataset.incident);
  }
  if (b.dataset.tab) {
    S.tab = b.dataset.tab;
    return void reloadList();
  }
  if (b.dataset.action) handleAction(b.dataset.action, b);
});

async function reloadList() {
  await withLoading(() => guard(loadCurrent));
  render();
}

const refreshView = reloadList;

let searchTimer;
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    S.filters.q = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      try {
        S.data.list = await get(`/api/incidents${listQuery()}`);
        $("#incident-rows").innerHTML = incidentRows(S);
      } catch (error) {
        toast(error.message);
      }
    }, 250);
  }
  if (e.target.id === "audit-incident") {
    S.filters.auditIncident = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      try {
        await loaders["Audit log"]();
        render();
        const box = $("#audit-incident");
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      } catch (error) {
        toast(error.message);
      }
    }, 350);
  }
});

document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset?.filter) {
    S.filters[t.dataset.filter] = t.value;
    if (S.page === "People") return render();
    return reloadList();
  }
  if (t.id === "advance-minutes") {
    S.advanceMinutes = Number(t.value);
    return;
  }
  if (t.id === "strategy") {
    await guard(() => patch("/api/admin/settings", { assignmentStrategy: t.value }), "Assignment strategy saved.");
    return refreshView();
  }
  if (t.id === "priority-strategy") {
    await guard(() => patch("/api/admin/settings", { priorityStrategy: t.value }), "Priority calculation saved.");
    return refreshView();
  }
});

// ---- session -------------------------------------------------------------------------------------------------
async function startSession(user) {
  S.user = user;
  S.data = {};
  S.filters = {};
  S.tab = "All incidents";
  S.selected = null;
  S.page = location.hash === "#terminal" ? "Terminal" : "Overview";
  newTerminal();
  mounted = false;
  await guard(loadRef);
  await go(S.page);
}

async function logout() {
  await request("POST", "/api/auth/logout").catch(() => {});
  endSession("You have been signed out.");
}

function endSession(message) {
  setToken(null);
  S.user = null;
  S.authError = "";
  render();
  if (message) toast(message);
}

handleSessionExpiry(() => endSession("Your session has expired. Please sign in again."));

async function boot() {
  if (hasToken()) {
    try {
      await startSession(await get("/api/auth/me"));
    } catch {
      setToken(null);
    }
  }
  if (!S.user) render();
  const splash = $("#splash");
  if (splash) {
    await Promise.all([new Promise((r) => setTimeout(r, 900)), document.fonts ? document.fonts.ready : Promise.resolve()]);
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 450);
  }
}

// Quietly refresh the visible page; skip while the user is typing or a dialog is open.
setInterval(async () => {
  if (!S.user || $("#modal").open || S.page === "Terminal") return;
  const active = document.activeElement;
  if (active?.matches("input,textarea,select") && (active.value || active.tagName === "SELECT")) return;
  try {
    await loadCurrent();
    const signature = JSON.stringify([S.data, S.unread, S.openCount]);
    if (signature !== lastSignature) render();
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }
}, 8000);

installRipples();
await boot();
