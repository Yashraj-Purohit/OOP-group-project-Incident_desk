// Browser API client. The session token lives in sessionStorage so closing the
// tab signs the user out; it is sent as a bearer token, never as a cookie.
const TOKEN_KEY = "incident-desk-token";

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let token = null;
try {
  token = sessionStorage.getItem(TOKEN_KEY);
} catch {}

export const hasToken = () => Boolean(token);

export function setToken(value) {
  token = value;
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}

let onSessionExpired = () => {};
export function handleSessionExpiry(callback) {
  onSessionExpired = callback;
}

export async function request(method, path, body) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError("The Incident Desk server is unavailable. Check that npm start is running, then try again.", 0, "NETWORK");
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {}
  if (!response.ok) {
    if (response.status === 401 && token && !path.startsWith("/api/auth/login")) {
      setToken(null);
      onSessionExpired();
    }
    throw new ApiError(payload.error || "Could not complete the request.", response.status, payload.code, payload.details);
  }
  return payload;
}

export const get = (path) => request("GET", path);
export const post = (path, body) => request("POST", path, body ?? {});
export const patch = (path, body) => request("PATCH", path, body ?? {});
export const del = (path) => request("DELETE", path);

export const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, v);
  const text = q.toString();
  return text ? `?${text}` : "";
};
