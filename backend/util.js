import { ValidationError } from "./errors.js";

// Injectable time source: tests and the demo "simulated clock" can move time
// forward without touching the system clock.
export class Clock {
  #offset = 0;
  now() {
    return Date.now() + this.#offset;
  }
  advance(minutes) {
    this.#offset += minutes * 60000;
    return this.now();
  }
}

export class FixedClock {
  constructor(time = Date.UTC(2026, 9, 18, 9, 0, 0)) {
    this.time = time;
  }
  now() {
    return this.time;
  }
  advance(minutes) {
    this.time += minutes * 60000;
    return this.time;
  }
}

export const minutes = (n) => n * 60000;

export function text(value, name, { min = 1, max = 255, optional = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (optional) return undefined;
    throw new ValidationError(`${name} is required.`);
  }
  if (typeof value !== "string") throw new ValidationError(`${name} must be text.`);
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (clean.length < min || clean.length > max) {
    throw new ValidationError(`${name} must contain ${min}–${max} characters.`);
  }
  return clean;
}

export function integer(value, name, { min = -Infinity, max = Infinity, optional = false, fallback } = {}) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    if (optional) return undefined;
    throw new ValidationError(`${name} is required.`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

export function oneOf(value, name, options, { optional = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (optional) return undefined;
    throw new ValidationError(`${name} is required.`);
  }
  if (!options.includes(value)) {
    throw new ValidationError(`${name} must be one of: ${options.join(", ")}.`);
  }
  return value;
}

export const bool = (value) => value === true || value === "true" || value === 1 || value === "1";

export function parseIncidentId(value) {
  const m = String(value ?? "").trim().match(/^(?:INC-?)?(\d{1,12})$/i);
  if (!m) throw new ValidationError("Incident ID must look like INC-1024.");
  return Number(m[1]);
}

export const displayId = (id) => `INC-${id}`;
