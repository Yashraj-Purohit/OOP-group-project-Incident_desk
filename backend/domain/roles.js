export const Role = Object.freeze({
  EMPLOYEE: "Employee",
  TECHNICIAN: "Technician",
  ADMIN: "Administrator",
});

// Escalation ladder (also used as staff "titles" for technicians/administrators).
export const Titles = Object.freeze({
  TECHNICIAN: "Technician",
  TEAM_LEAD: "Team Lead",
  SYSTEM_ADMIN: "System Administrator",
  IT_MANAGER: "IT Manager",
});

const employee = [
  "incident:create",
  "incident:view-own",
  "incident:update-own",
  "incident:respond",
  "incident:verify",
  "incident:feedback",
  "notification:view",
];

const technician = [
  "incident:create",
  "incident:view-assigned",
  "incident:acknowledge",
  "incident:investigate",
  "incident:request-info",
  "incident:resolve",
  "incident:close",
  "workload:view-own",
  "notification:view",
];

const administrator = [
  "incident:create",
  "incident:view-all",
  "incident:assign",
  "incident:update-any",
  "incident:verify",
  "incident:close",
  "user:manage",
  "service:manage",
  "sla:manage",
  "category:manage",
  "settings:manage",
  "report:view",
  "audit:view",
  "workload:view-all",
  "notification:view",
];

export const PERMISSIONS = Object.freeze({
  [Role.EMPLOYEE]: new Set(employee),
  [Role.TECHNICIAN]: new Set(technician),
  [Role.ADMIN]: new Set(administrator),
});
