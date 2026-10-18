// Adapter between the terminal's simple actions and the authenticated REST API.
// `request(method, path, body)` must return parsed JSON or throw an Error with
// a readable message. Used by both the browser terminal and the Node CLI.
export function createTerminalApi(request, me) {
  let services = null;

  const loadServices = async () => (services ??= await request("GET", "/api/services"));

  async function reportBody(report) {
    const list = await loadServices();
    const service = list.find((s) => s.name === report.service);
    if (!service) throw Error("Choose a listed IT service.");
    return {
      title: report.title,
      description: report.description,
      serviceId: service.id,
      impact: report.impact,
      urgency: report.urgency,
      proposal: report.proposal || undefined,
    };
  }

  return async function api(input) {
    switch (input.action) {
      case "services":
        return loadServices();
      case "preview": {
        const result = await request("POST", "/api/incidents/preview", await reportBody(input.report));
        return {
          ...input.report,
          priority: result.priority,
          category: result.category,
          technician: result.recommendedTechnician?.name ?? `None yet (${result.assignmentIssue ?? "will be assigned by an administrator"})`,
          duplicates: result.duplicates.map((d) => ({ id: d.id, title: d.title })),
        };
      }
      case "create": {
        const created = await request("POST", "/api/incidents", await reportBody(input.report));
        return { id: created.id, priority: created.priority, technician: created.technician?.name ?? null };
      }
      case "list": {
        const query = new URLSearchParams();
        if (input.priority) query.set("priority", input.priority);
        if (input.mine) query.set("reporter", String(me.id));
        const result = await request("GET", `/api/incidents?${query}`);
        return result.items.map((i) => ({
          id: i.id, title: i.title, priority: i.priority, status: i.status, technician: i.technician?.name ?? null,
        }));
      }
      case "view": {
        const i = await request("GET", `/api/incidents/${encodeURIComponent(String(input.id))}`);
        return {
          id: i.id, title: i.title, priority: i.priority, status: i.status, sla: i.sla, service: i.service.name,
          reporter: i.reporter.name, technician: i.technician?.name ?? "Unassigned", description: i.description,
          proposal: i.proposal, resolution: i.resolution,
          notes: i.notes.map((n) => ({ author: n.author, text: n.body })),
        };
      }
      default:
        throw Error("Unknown terminal action.");
    }
  };
}
