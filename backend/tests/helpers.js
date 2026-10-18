import { createContainer } from "../container.js";
import { seedReferenceData } from "../seed.js";
import { FixedClock } from "../util.js";

export const PASSWORD = "DemoPass123";

export function makeApp(options = {}) {
  const clock = new FixedClock();
  const container = createContainer({ clock, channels: ["in-app", "email"], ...options });
  seedReferenceData(container, clock.now());
  const user = (email) => container.repos.users.findByEmail(`${email}@incidentdesk.test`).user;
  const service = (name) => container.repos.services.findByName(name).id;
  return {
    container, clock, user, service,
    jordan: user("jordan"), maya: user("maya"), admin: user("admin"), manager: user("manager"),
    lead: user("lead"), asha: user("asha"), ravi: user("ravi"), neha: user("neha"),
    report: (overrides = {}) => ({
      title: "Payment application unavailable",
      description: "Users are unable to complete transactions in the payment application.",
      serviceId: service("Payment portal"), impact: 3, urgency: 3, ...overrides,
    }),
  };
}
