// Small presentation helpers shared by the views and the app shell.
export function escapeHtml(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

export function formatDateTime(timestamp) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const initials = (name) => String(name ?? "?").split(" ").map((part) => part[0]).slice(0, 2).join("");

export function badge(label, style = label) {
  const className = escapeHtml(String(style).toLowerCase().replaceAll(" ", "-"));
  return `<span class="badge ${className}">${escapeHtml(label)}</span>`;
}

export function button(label, action, style = "", extra = "") {
  return `<button class="button ${style}" data-action="${escapeHtml(action)}" ${extra}>${label}</button>`;
}

export function slaText(incident) {
  if (!incident.sla) return "";
  if (!["New", "Classified", "Assigned", "Acknowledged", "In progress"].includes(incident.status)) return "Resolution recorded";
  const m = incident.sla.remainingMinutes;
  return m < 0 ? `${formatDuration(-m)} overdue` : `${formatDuration(m)} left`;
}

export function formatDuration(minutes) {
  if (minutes < 90) return `${minutes}m`;
  if (minutes < 60 * 36) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export const isActive = (incident) => ["New", "Classified", "Assigned", "Acknowledged", "In progress"].includes(incident.status);

export const PALETTES = [
  { id: "harbor", label: "Harbor" },
  { id: "forest", label: "Forest" },
  { id: "sunset", label: "Sunset" },
  { id: "graphite", label: "Graphite" },
  { id: "arcade", label: "Arcade (classic 8-bit)" },
];

export const STATUSES = ["Assigned", "Acknowledged", "In progress", "Resolved", "Verified", "Closed"];
export const PRIORITIES = ["P1", "P2", "P3", "P4"];
export const SLA_STATES = ["On track", "At risk", "Breached", "Met"];

export function csvCell(value) {
  // Prefix formula characters so spreadsheets do not execute exported text.
  return '"' + String(value ?? "").replaceAll('"', '""').replace(/^[=+@-]/, "'$&") + '"';
}
