import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Parses every palette block out of styles.css and checks WCAG contrast, so a
// careless colour edit cannot make the interface unreadable.
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const PALETTES = ["harbor", "forest", "sunset", "graphite", "arcade"];

function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing block ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT = [
  ["ink", "panel"], ["ink", "bg"], ["muted", "panel"], ["muted", "bg"], ["ink", "soft"], ["muted", "soft"],
  ["on-sidebar", "sidebar"], ["on-sidebar-dim", "sidebar"], ["on-sidebar", "hover"], ["brand", "sidebar"],
  ["on-sidebar", "nav-active"], ["on-sidebar-dim", "nav-active"],
  ["on-cta", "cta"], ["on-cta", "cta-deep"], ["cta-text", "panel"], ["cta-text", "bg"],
  ["on-danger", "danger"], ["danger-text", "panel"], ["danger-text", "bg"],
  ["on-green", "green"], ["on-blue", "blue"], ["on-highlight", "highlight"], ["link", "panel"], ["link", "bg"],
  ["on-blue-soft", "blue-soft"], ["ink", "yellow-soft"], ["ink", "danger-soft"], ["ink", "blue-soft"], ["ink", "green-soft"],
  ["on-hero", "hero-bg"], ["highlight", "hero-bg"],
  ["console-ink", "console-bg"], ["console-input", "console-bg"], ["console-error", "console-bg"], ["console-line", "console-bg"],
];
const UI = [["line", "panel"], ["line", "bg"], ["line", "soft"], ["focus", "panel"], ["focus", "bg"]];

test("every palette defines the same tokens for light and dark", () => {
  const reference = Object.keys(tokens(':root, :root[data-palette="harbor"]')).sort();
  assert.ok(reference.length > 40);
  for (const name of PALETTES) {
    for (const mode of ["light", "dark"]) {
      const selector = name === "harbor" ? (mode === "light" ? ':root, :root[data-palette="harbor"]' : ':root[data-theme="dark"], :root[data-palette="harbor"][data-theme="dark"]') : mode === "light" ? `:root[data-palette="${name}"]` : `:root[data-palette="${name}"][data-theme="dark"]`;
      assert.deepEqual(Object.keys(tokens(selector)).sort().filter((k) => k !== "color-scheme"), reference.filter((k) => k !== "color-scheme"), `${name}/${mode}`);
    }
  }
});

test("all palettes meet WCAG AA contrast for text (4.5:1) and controls (3:1), in light and dark", () => {
  const failures = [];
  for (const name of PALETTES) {
    for (const mode of ["light", "dark"]) {
      const selector = name === "harbor" ? (mode === "light" ? ':root, :root[data-palette="harbor"]' : ':root[data-theme="dark"], :root[data-palette="harbor"][data-theme="dark"]') : mode === "light" ? `:root[data-palette="${name}"]` : `:root[data-palette="${name}"][data-theme="dark"]`;
      const t = tokens(selector);
      for (const [fg, bg] of TEXT) if (ratio(t[fg], t[bg]) < 4.5) failures.push(`${name}/${mode}: ${fg} on ${bg} = ${ratio(t[fg], t[bg]).toFixed(2)}`);
      for (const [fg, bg] of UI) if (ratio(t[fg], t[bg]) < 3) failures.push(`${name}/${mode}: ${fg} vs ${bg} = ${ratio(t[fg], t[bg]).toFixed(2)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("components use tokens, not hard-coded colours, and motion respects reduced-motion", () => {
  // Allowed raw colours: the token blocks, the swatch previews and the terminal's fixed success green.
  const stripped = css
    .replace(/:root[^{]*\{[^}]*\}/g, "")
    .replace(/\.menu-item\[data-palette-pick[^{]*\{[^}]*\}/g, "")
    .replace(/\.terminal-entry\.success[^{]*\{[^}]*\}/g, "");
  assert.deepEqual([...stripped.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)].map((m) => m[0]), [], "use a var(--token) instead");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important/);
});
