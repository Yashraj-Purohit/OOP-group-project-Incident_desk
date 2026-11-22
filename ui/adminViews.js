// Administrator screens: services, categories, people, reports, SLA settings and the audit log.
import { badge, button, escapeHtml, formatDateTime, initials } from "./helpers.js";
import { heading, workloadPanel } from "./views.js";

const bar = (value, max, label, detail) =>
  `<div class="report-bar"><div class="workload-line"><span>${escapeHtml(label)}</span><span>${escapeHtml(detail)}</span></div><div class="bar"><div class="bar-fill" style="width:${max ? Math.round((value / max) * 100) : 0}%"></div></div></div>`;

export function servicesPage(s) {
  const stats = new Map((s.data.serviceStats ?? []).map((x) => [x.id, x]));
  const categories = s.ref.categories ?? [];
  return (
    heading(s, "IT services", "Services supported by the IT team, and the categories used to classify incidents.", button("Add service", "service-new", "primary")) +
    `<div class="service-grid">${(s.ref.services ?? [])
      .map((svc) => {
        const st = stats.get(svc.id);
        const n = st?.open ?? 0;
        return `<section class="panel service-card"><h3>${escapeHtml(svc.name)}</h3><p>${escapeHtml(svc.owner)}<br />Category: ${escapeHtml(svc.category)}<br />Business criticality: ${svc.criticality} / 3</p><div class="actions">${badge(`${n} active incidents`, n ? "at-risk" : "on-track")}${svc.active ? "" : badge("Retired", "closed")}${button("View incidents", "service-incidents", "small", `data-service="${escapeHtml(svc.name)}"`)}${button("Edit", "service-edit", "small", `data-id="${svc.id}"`)}</div></section>`;
      })
      .join("")}</div>` +
    `<section class="panel" style="margin-top:28px"><div class="panel-head"><div><h2>Incident categories</h2><p class="subtitle">Keywords drive automatic category suggestions. New categories need no code changes.</p></div>${button("Add category", "category-new", "primary small")}</div><div class="table-wrap"><table><thead><tr><th>Category</th><th>Description</th><th>Keywords</th><th></th></tr></thead><tbody>${categories
      .map(
        (c) =>
          `<tr><td><strong>${escapeHtml(c.name)}</strong></td><td style="white-space:normal">${escapeHtml(c.description)}</td><td style="white-space:normal" class="small-text">${escapeHtml(c.keywords.join(", "))}</td><td>${button("Edit", "category-edit", "small", `data-name="${escapeHtml(c.name)}"`)}${button("Remove", "category-remove", "small", `data-name="${escapeHtml(c.name)}"`)}</td></tr>`,
      )
      .join("")}</tbody></table></div></section>`
  );
}

export function peoplePage(s) {
  const users = s.data.users ?? [];
  const load = new Map((s.data.workload ?? []).map((w) => [w.id, w]));
  const role = s.filters.role ?? "";
  const shown = users.filter((u) => !role || u.role === role);
  return (
    heading(s, "People", "Manage accounts, technician skills and availability.", button("Add user", "user-new", "primary")) +
    `<section class="panel"><div class="filters"><select data-filter="role" aria-label="Filter by role"><option value="">All roles</option>${["Employee", "Technician", "Administrator"].map((r) => `<option ${role === r ? "selected" : ""}>${r}</option>`).join("")}</select><span class="small-text">${shown.length} of ${users.length} accounts</span></div><div class="table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Details</th><th>Status</th><th></th></tr></thead><tbody>${shown
      .map((u) => {
        const w = load.get(u.id);
        const details = u.role === "Technician" ? `${escapeHtml(u.title)} · ${escapeHtml((u.skills ?? []).join(", ") || "No skills")}<br /><span class="small-text">${u.experience} yrs · ${w ? `${w.activeIncidents}/${u.maxWorkload} active` : `max ${u.maxWorkload}`}</span>` : u.role === "Administrator" ? escapeHtml(u.title) : "";
        return `<tr><td><div class="person"><span class="mini-avatar">${escapeHtml(initials(u.name))}</span><span>${escapeHtml(u.name)}<div class="incident-id">${escapeHtml(u.email)}</div></span></div></td><td>${escapeHtml(u.role)}</td><td style="white-space:normal">${details}</td><td>${u.active ? (u.role === "Technician" && !u.available ? badge("Unavailable", "at-risk") : badge("Active", "on-track")) : badge("Deactivated", "closed")}</td><td>${button("Edit", "user-edit", "small", `data-id="${u.id}"`)}${button("Reset password", "user-password", "small", `data-id="${u.id}"`)}${u.id === s.user.id ? "" : button(u.active ? "Deactivate" : "Activate", "user-toggle", "small", `data-id="${u.id}"`)}</td></tr>`;
      })
      .join("")}</tbody></table></div></section>`
  );
}

export function reportsPage(s) {
  const d = s.data;
  const o = d.overview;
  if (!o) return heading(s, "Reports & insights", "Loading…") + '<div class="empty">Loading reports…</div>';
  const stats = [
    ["Total incidents", o.total, `${o.open} open`],
    ["Critical incidents", o.critical, "Open priority P1"],
    ["SLA violations", o.slaViolations, o.slaCompliancePercent === null ? "No finished incidents yet" : `${o.slaCompliancePercent}% of finished incidents met SLA`],
    ["Resolved incidents", o.resolved, `${o.closed} closed`],
    ["Mean time to resolve", o.meanTimeToResolveMinutes === null ? "—" : `${o.meanTimeToResolveMinutes}m`, o.meanTimeToAcknowledgeMinutes === null ? "" : `Acknowledged in ${o.meanTimeToAcknowledgeMinutes}m on average`],
    ["Satisfaction", o.averageRating === null ? "—" : `${o.averageRating}/5`, "Average feedback rating"],
  ];
  const maxService = Math.max(1, ...(d.serviceStats ?? []).map((x) => x.total));
  const maxCategory = Math.max(1, ...(d.categoryStats ?? []).map((x) => x.total));
  const maxTrend = Math.max(1, ...(d.trend ?? []).flatMap((x) => [x.opened, x.resolved]));
  return (
    heading(s, "Reports & insights", "Operational view of incidents, SLA performance and risk.", button("Export incidents CSV", "export")) +
    `<div class="stats">${stats.map(([l, v, dt]) => `<div class="stat"><div class="stat-label">${l}</div><div class="stat-value">${escapeHtml(v)}</div><div class="stat-detail">${escapeHtml(dt)}</div></div>`).join("")}</div>
<div class="content-grid"><section class="panel"><div class="panel-head"><h2>Incidents by service</h2></div><div class="panel-body report-bars">${(d.serviceStats ?? []).map((x) => bar(x.total, maxService, x.service, `${x.total} incidents (${x.open} open)`)).join("")}</div></section>${workloadPanel(d.workload)}</div>
<div class="content-grid" style="margin-top:28px"><section class="panel"><div class="panel-head"><h2>Incidents by category</h2></div><div class="panel-body report-bars">${(d.categoryStats ?? []).filter((x) => x.total || true).map((x) => bar(x.total, maxCategory, x.category, `${x.total} incidents`)).join("")}</div></section><section class="panel"><div class="panel-head"><h2>Last ${(d.trend ?? []).length} days</h2><span class="small-text">Opened / resolved</span></div><div class="panel-body report-bars">${(d.trend ?? []).map((x) => bar(x.opened, maxTrend, x.date, `${x.opened} opened · ${x.resolved} resolved`)).join("")}</div></section></div>
<div class="content-grid" style="margin-top:28px"><section class="panel"><div class="panel-head"><div><h2>Correlated incidents</h2><p class="subtitle">Several open reports about one service in a short time.</p></div></div><div class="panel-body">${
      (d.correlations ?? []).length
        ? d.correlations.map((c) => `<div class="callout" style="margin-bottom:12px"><strong>${escapeHtml(c.serviceName)}: ${c.count} related reports</strong><br />${c.incidents.map((i) => `<button class="incident-link" data-incident="${i.id}">INC-${i.id}</button>`).join(" ")}<br /><span class="small-text">${escapeHtml(c.suggestion)}</span></div>`).join("")
        : '<p class="small-text">No clusters of related incidents right now.</p>'
    }</div></section><section class="panel"><div class="panel-head"><div><h2>SLA risk</h2><p class="subtitle">Open incidents likely to miss their targets.</p></div></div><div class="panel-body">${
      (d.slaRisk ?? []).length
        ? d.slaRisk.map((r) => `<div class="status-row"><span><button class="incident-link" data-incident="${r.id}">${escapeHtml(r.displayId)}</button> ${escapeHtml(r.title)}<br /><span class="small-text">${escapeHtml(r.reasons.join(" · "))}</span></span>${badge(r.level === "breached" ? "Breached" : `${r.level} risk`, r.level === "high" || r.level === "breached" ? "breached" : "at-risk")}</div>`).join("")
        : '<p class="small-text">No incidents are currently at risk.</p>'
    }</div></section></div>
<section class="panel" style="margin-top:28px"><div class="panel-head"><div><h2>Recorded SLA violations</h2><p class="subtitle">Each violation is stored once, with the time it was detected.</p></div></div>${
      (d.violations ?? []).length
        ? `<div class="table-wrap"><table><thead><tr><th>Incident</th><th>Service</th><th>Violation</th><th>Priority</th><th>Detected</th></tr></thead><tbody>${d.violations.map((v) => `<tr><td><button class="incident-link" data-incident="${v.incidentId}">INC-${v.incidentId}</button><div class="incident-id">${escapeHtml(v.title)}</div></td><td>${escapeHtml(v.service)}</td><td>${v.kind.startsWith("response") ? "Response" : "Resolution"} target</td><td>${badge(v.priority)}</td><td>${formatDateTime(v.at)}</td></tr>`).join("")}</tbody></table></div>`
        : '<div class="empty">No SLA violations recorded.</div>'
    }</section>`
  );
}

export function settingsPage(s) {
  const policies = s.data.policies ?? [];
  const settings = s.data.settings;
  const services = new Map((s.ref.services ?? []).map((x) => [x.id, x.name]));
  if (!settings) return heading(s, "SLA & assignment", "Loading…");
  const defaults = ["P1", "P2", "P3", "P4"].map((p) => policies.find((x) => x.serviceId === null && x.priority === p) ?? { priority: p, serviceId: null, responseMinutes: "", resolutionMinutes: "" });
  const overrides = policies.filter((x) => x.serviceId !== null);
  const strategyInfo = (list, current) => list.find((x) => x.name === current)?.description ?? "";
  return (
    heading(s, "SLA & assignment", "Response targets, priority scoring and how incidents are assigned.") +
    `<div class="content-grid"><section class="panel"><div class="panel-head"><h2>Default service level targets</h2><span class="small-text">Elapsed minutes, 24/7 clock</span></div><div class="panel-body"><form id="policy-form"><div class="table-wrap"><table><thead><tr><th>Priority</th><th>Response (min)</th><th>Resolution (min)</th></tr></thead><tbody>${defaults
      .map(
        (p) =>
          `<tr><td>${badge(p.priority)}</td><td><label class="field"><input aria-label="${p.priority} response minutes" name="${p.priority}-response" type="number" min="1" max="525600" required value="${p.responseMinutes}" /></label></td><td><label class="field"><input aria-label="${p.priority} resolution minutes" name="${p.priority}-resolution" type="number" min="1" max="525600" required value="${p.resolutionMinutes}" /></label></td></tr>`,
      )
      .join("")}</tbody></table></div><p class="small-text">Deadlines are fixed when an incident is created or its priority changes; existing deadlines are not rewritten.</p><div id="policy-error" class="error" role="alert"></div><button class="button primary" type="submit">Save default targets</button></form></div></section>
<div class="side-stack"><section class="panel"><div class="panel-head"><h2>Assignment strategy</h2></div><div class="panel-body"><label class="field">Active strategy<select id="strategy">${settings.assignmentStrategies.map((x) => `<option value="${x.name}" ${x.name === settings.assignmentStrategy ? "selected" : ""}>${escapeHtml(x.label)}</option>`).join("")}</select></label><p class="small-text">${escapeHtml(strategyInfo(settings.assignmentStrategies, settings.assignmentStrategy))}</p><p class="small-text">Applies to newly created incidents and to recommendations when assigning manually.</p></div></section>
<section class="panel"><div class="panel-head"><h2>Priority calculation</h2></div><div class="panel-body"><label class="field">Active method<select id="priority-strategy">${settings.priorityStrategies.map((x) => `<option value="${x.name}" ${x.name === settings.priorityStrategy ? "selected" : ""}>${escapeHtml(x.label)}</option>`).join("")}</select></label><p class="small-text">${escapeHtml(strategyInfo(settings.priorityStrategies, settings.priorityStrategy))}</p></div></section>
<section class="alert-card"><h3>Demo clock &amp; SLA monitor</h3><p>The monitor checks deadlines every 30 seconds. Advance the shared clock to test warnings, violations and escalation.</p><label class="field">Advance the clock by<select id="advance-minutes" aria-label="Minutes to advance">${[1, 2, 3, 5, 10, 30, 60, 90].map((m) => `<option value="${m}" ${m === (s.advanceMinutes ?? 10) ? "selected" : ""}>${m} minute${m === 1 ? "" : "s"}</option>`).join("")}</select></label><div class="actions">${button("Advance clock", "advance", "small")}${button("Run monitor now", "run-monitor", "small")}</div>${s.clockResult ? `<p class="small-text">${escapeHtml(s.clockResult)}</p>` : ""}</section></div></div>
<section class="panel" style="margin-top:28px"><div class="panel-head"><div><h2>Service-specific targets</h2><p class="subtitle">Override the defaults for a critical service.</p></div>${button("Add override", "policy-new", "primary small")}</div>${
      overrides.length
        ? `<div class="table-wrap"><table><thead><tr><th>Service</th><th>Priority</th><th>Response</th><th>Resolution</th><th></th></tr></thead><tbody>${overrides.map((p) => `<tr><td>${escapeHtml(services.get(p.serviceId) ?? `Service ${p.serviceId}`)}</td><td>${badge(p.priority)}</td><td>${p.responseMinutes} min</td><td>${p.resolutionMinutes} min</td><td>${button("Remove", "policy-remove", "small", `data-id="${p.id}"`)}</td></tr>`).join("")}</tbody></table></div>`
        : '<div class="empty">No service-specific targets yet.</div>'
    }</section>`
  );
}

export function auditPage(s) {
  const rows = s.data.audit ?? [];
  const f = s.filters;
  return (
    heading(s, "Audit log", "Every recorded action, newest first.") +
    `<section class="panel"><div class="filters"><input type="search" id="audit-incident" aria-label="Filter by incident" placeholder="Incident, e.g. INC-1003" value="${escapeHtml(f.auditIncident ?? "")}" /><select data-filter="auditAction" aria-label="Filter by action"><option value="">All actions</option>${(s.auditActions ?? []).map((a) => `<option ${f.auditAction === a ? "selected" : ""}>${escapeHtml(a)}</option>`).join("")}</select></div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Incident</th><th>User</th><th>Action</th><th>Change</th></tr></thead><tbody>${
      rows.length
        ? rows.map((h) => `<tr><td>${formatDateTime(h.at)}</td><td>${h.incidentId ? `<button class="incident-link" data-incident="${h.incidentId}">INC-${h.incidentId}</button>` : "—"}</td><td>${escapeHtml(h.user)}</td><td style="white-space:normal">${escapeHtml(h.description)}<div class="incident-id">${escapeHtml(h.action)}</div></td><td>${h.previousState || h.newState ? `${escapeHtml(h.previousState ?? "—")} → ${escapeHtml(h.newState ?? "—")}` : ""}</td></tr>`).join("")
        : '<tr><td colspan="5"><div class="empty">No audit records match.</div></td></tr>'
    }</tbody></table></div></section>`
  );
}
