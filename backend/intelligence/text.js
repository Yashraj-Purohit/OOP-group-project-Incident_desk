// Shared text normalisation for classification, duplicate detection and
// resolution suggestions. Synonyms collapse near-identical wording
// ("unavailable", "failing", "unable to") onto one token.
const STOP = new Set(
  "a an the and or but to of in on at for from with by is are was were be been am it its this that these those my our your their i we you they he she me us them not no can could would should will just please very also still again now today make made get got has have had do does did".split(" "),
);

const SYNONYMS = new Map(Object.entries({
  unavailable: "fail", unable: "fail", failing: "fail", failed: "fail", fails: "fail", failure: "fail",
  down: "fail", outage: "fail", error: "fail", errors: "fail", broken: "fail", crash: "fail", crashed: "fail",
  crashing: "fail", cannot: "fail", cant: "fail", "can't": "fail", stuck: "fail", unreachable: "fail", timeout: "fail",
  slow: "slow", sluggish: "slow", lagging: "slow", laggy: "slow", latency: "slow",
  transaction: "payment", transactions: "payment", payments: "payment", pay: "payment", paying: "payment", checkout: "payment",
  application: "app", applications: "app", apps: "app", software: "app", program: "app",
  login: "auth", logins: "auth", signin: "auth", password: "auth", authentication: "auth", locked: "auth", sso: "auth",
  wifi: "network", "wi-fi": "network", internet: "network", connection: "network", connectivity: "network", vpn: "network", lan: "network",
  laptop: "hardware", computer: "hardware", workstation: "hardware", monitor: "hardware", keyboard: "hardware", printer: "hardware",
  db: "database", sql: "database", query: "database",
}));

export function tokenize(input) {
  const words = String(input ?? "").toLowerCase().match(/[a-z][a-z'-]{1,}/g) ?? [];
  const tokens = new Set();
  for (const raw of words) {
    if (STOP.has(raw)) continue;
    const word = SYNONYMS.get(raw) ?? SYNONYMS.get(raw.replace(/s$/, "")) ?? raw.replace(/(ing|ed|es|s)$/, "");
    if (word.length > 1 && !STOP.has(word)) tokens.add(word);
  }
  return tokens;
}

// Blend of Jaccard and overlap coefficient: robust for short titles.
export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  const jaccard = shared / (a.size + b.size - shared);
  const overlap = shared / Math.min(a.size, b.size);
  return Math.round((0.5 * jaccard + 0.5 * overlap) * 100) / 100;
}
