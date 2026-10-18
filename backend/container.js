import { AuthService } from "./auth/auth.js";
import {
  AssignmentEngine, ExperienceBasedStrategy, LoadBasedStrategy, RoundRobinStrategy, SkillBasedStrategy,
} from "./domain/assignment.js";
import { PriorityCalculator } from "./domain/priority.js";
import { SlaResolver, SlaTracker } from "./domain/sla.js";
import { EventBus } from "./events.js";
import {
  CategoryClassifier, DuplicateDetector, EscalationPolicy, IncidentCorrelator, ResolutionSuggester, SlaRiskDetector,
} from "./intelligence/analyzers.js";
import {
  AuditObserver, ChannelFactory, NotificationDispatcher, NotificationObserver,
} from "./notifications/notifications.js";
import { Database } from "./persistence/database.js";
import {
  AuditRepository, CategoryRepository, NotificationRepository, ServiceRepository, SessionRepository, SettingsRepository,
  SlaEventRepository, SlaPolicyRepository, SqliteIncidentRepository, SqliteUserRepository,
} from "./persistence/repositories.js";
import { AdminService } from "./services/AdminService.js";
import { IncidentService } from "./services/IncidentService.js";
import { ReportService } from "./services/ReportService.js";
import { SlaMonitor } from "./services/SlaMonitor.js";
import { Clock } from "./util.js";

// Composition root: builds the object graph once. Everything below receives its
// collaborators through constructors, so tests can swap clock, database or
// channels without touching business code.
export function createContainer({ dbPath = ":memory:", clock = new Clock(), log = null, channels = ["in-app", "email"], allowClockControl = true } = {}) {
  const db = new Database(dbPath);
  const users = new SqliteUserRepository(db);
  const services = new ServiceRepository(db);
  const categories = new CategoryRepository(db);
  const slaPolicies = new SlaPolicyRepository(db);
  const incidents = new SqliteIncidentRepository(db);
  const audit = new AuditRepository(db);
  const notifications = new NotificationRepository(db);
  const slaEvents = new SlaEventRepository(db);
  const sessions = new SessionRepository(db);
  const settings = new SettingsRepository(db);

  const bus = new EventBus();
  const dispatcher = new NotificationDispatcher();
  for (const name of channels) dispatcher.register(ChannelFactory.create(name, { notifications, log }));
  const auditObserver = new AuditObserver({ audit, users });
  const notificationObserver = new NotificationObserver({ dispatcher, users, clock });
  bus.subscribe("*", (event) => auditObserver.handle(event));
  bus.subscribe("*", (event) => notificationObserver.handle(event));

  const tracker = new SlaTracker({ warningRatio: settings.get("slaWarningRatio", 0.25) });
  const assignment = new AssignmentEngine([
    new SkillBasedStrategy(),
    new LoadBasedStrategy(),
    new ExperienceBasedStrategy(),
    new RoundRobinStrategy({ get: () => settings.get("roundRobinLast", 0), set: (id) => settings.set("roundRobinLast", id) }),
  ]);
  const priorityCalculator = new PriorityCalculator();
  const escalation = new EscalationPolicy();
  const slaMonitor = new SlaMonitor({ db, incidents, users, slaEvents, tracker, escalation, bus, clock, log });

  const incidentService = new IncidentService({
    db, incidents, users, services, categories, slaEvents, audit, bus, clock, settings, tracker, assignment,
    priorityCalculator, slaMonitor,
    slaResolver: new SlaResolver(slaPolicies),
    duplicateDetector: new DuplicateDetector(),
    classifier: new CategoryClassifier(),
    riskDetector: new SlaRiskDetector(),
    suggester: new ResolutionSuggester(),
  });

  return {
    db, clock, log, bus, dispatcher, settings, allowClockControl,
    repos: { users, services, categories, slaPolicies, incidents, audit, notifications, slaEvents, sessions },
    auth: new AuthService({ users, sessions, clock }),
    incidents: incidentService,
    reports: new ReportService({ incidents, users, services, categories, slaEvents, tracker, riskDetector: new SlaRiskDetector(), correlator: new IncidentCorrelator(), clock }),
    admin: new AdminService({ users, services, categories, slaPolicies, incidents, sessions, settings, audit, assignment, priorityCalculator, clock, tracker }),
    slaMonitor,
    close() { slaMonitor.stop(); db.close(); },
  };
}
