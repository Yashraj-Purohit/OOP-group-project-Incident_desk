import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { AuthenticationError, RateLimitError, ValidationError } from "../errors.js";
import { Role } from "../domain/roles.js";
import { text } from "../util.js";

const KEY_LENGTH = 64;
const COST = 16384;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: COST });
  return `scrypt$${COST}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [scheme, cost, saltHex, hashHex] = String(stored).split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, { N: Number(cost) });
  return timingSafeEqual(actual, expected);
}

export function assertStrongPassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ValidationError("Password must be 8–128 characters and contain a letter and a number.");
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validEmail(value) {
  const email = text(value, "Email", { max: 254 }).toLowerCase();
  if (!EMAIL.test(email)) throw new ValidationError("Enter a valid email address.");
  return email;
}

// Locks an account/address pair after repeated failures.
export class LoginThrottle {
  #attempts = new Map();
  constructor({ maxFailures = 5, windowMs = 15 * 60000, clock }) {
    Object.assign(this, { maxFailures, windowMs, clock });
  }
  check(key) {
    const recent = this.#recent(key);
    if (recent.length >= this.maxFailures) {
      throw new RateLimitError("Too many failed sign-in attempts. Try again in a few minutes.");
    }
  }
  fail(key) { this.#attempts.set(key, [...this.#recent(key), this.clock.now()]); }
  succeed(key) { this.#attempts.delete(key); }
  #recent(key) {
    const cutoff = this.clock.now() - this.windowMs;
    return (this.#attempts.get(key) ?? []).filter((t) => t > cutoff);
  }
}

// A fixed hash lets unknown-email logins take the same time as wrong passwords.
const DUMMY_HASH = hashPassword("not-a-real-password-1");

export class AuthService {
  constructor({ users, sessions, clock, ttlMs = 8 * 3600000 }) {
    this.users = users;
    this.sessions = sessions;
    this.clock = clock;
    this.ttlMs = ttlMs;
    this.throttle = new LoginThrottle({ clock });
  }

  // Public self-registration always creates an Employee.
  register({ name, email, password }) {
    const clean = { name: text(name, "Name", { min: 2, max: 80 }), email: validEmail(email) };
    assertStrongPassword(password);
    if (this.users.findByEmail(clean.email)) throw new ValidationError("An account with that email already exists.");
    return this.users.insert({ ...clean, role: Role.EMPLOYEE }, hashPassword(password), this.clock.now());
  }

  login(email, password) {
    const key = String(email ?? "").trim().toLowerCase();
    this.throttle.check(key);
    const found = typeof password === "string" ? this.users.findByEmail(key) : null;
    const ok = verifyPassword(typeof password === "string" ? password : "", found?.passwordHash ?? DUMMY_HASH);
    if (!found || !ok || !found.user.active) {
      this.throttle.fail(key);
      throw new AuthenticationError("Incorrect email or password.");
    }
    this.throttle.succeed(key);
    const token = randomBytes(32).toString("base64url");
    this.sessions.create(token, found.user.id, this.clock.now(), this.ttlMs);
    return { token, user: found.user, expiresAt: this.clock.now() + this.ttlMs };
  }

  authenticate(token) {
    if (!token) throw new AuthenticationError("Sign in to continue.");
    const session = this.sessions.find(token, this.clock.now());
    const user = session && this.users.findById(session.userId);
    if (!user || !user.active) throw new AuthenticationError("Your session has expired. Sign in again.");
    return user;
  }

  logout(token) { this.sessions.remove(token); }

  changePassword(user, current, next) {
    const found = this.users.findByEmail(user.email);
    if (!verifyPassword(String(current ?? ""), found.passwordHash)) throw new AuthenticationError("Current password is incorrect.");
    assertStrongPassword(next);
    this.users.setPasswordHash(user.id, hashPassword(next));
    this.sessions.removeAllFor(user.id);
  }
}
