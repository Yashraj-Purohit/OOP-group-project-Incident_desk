// Custom exception hierarchy. Every error carries an HTTP status and a stable
// machine-readable code so the API layer can map failures without type checks.
export class AppError extends Error {
  constructor(message, { status = 500, code = "INTERNAL_ERROR", details } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

const define = (name, status, code) =>
  ({
    [name]: class extends AppError {
      constructor(message, details) {
        super(message, { status, code, details });
      }
    },
  })[name];

export const ValidationError = define("ValidationError", 400, "INVALID_INPUT");
export const AuthenticationError = define("AuthenticationError", 401, "AUTHENTICATION_FAILED");
export const AuthorizationError = define("AuthorizationError", 403, "FORBIDDEN");
export const NotFoundError = define("NotFoundError", 404, "NOT_FOUND");
export const IncidentNotFoundError = define("IncidentNotFoundError", 404, "INCIDENT_NOT_FOUND");
export const ServiceNotFoundError = define("ServiceNotFoundError", 404, "SERVICE_NOT_FOUND");
export const InvalidTransitionError = define("InvalidTransitionError", 409, "INVALID_STATE_TRANSITION");
export const TechnicianUnavailableError = define("TechnicianUnavailableError", 409, "TECHNICIAN_UNAVAILABLE");
export const WorkloadExceededError = define("WorkloadExceededError", 409, "WORKLOAD_EXCEEDED");
export const DuplicateIncidentError = define("DuplicateIncidentError", 409, "DUPLICATE_INCIDENT");
export const MissingSlaConfigError = define("MissingSlaConfigError", 422, "MISSING_SLA_CONFIGURATION");
export const RateLimitError = define("RateLimitError", 429, "TOO_MANY_ATTEMPTS");
export const PersistenceError = define("PersistenceError", 503, "PERSISTENCE_FAILURE");
export const NotificationError = define("NotificationError", 502, "NOTIFICATION_FAILURE");
