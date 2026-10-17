import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";

test("Terminal navigation and role references render with the team's text-only navigation", async (t) => {
  const globals = [
    "document",
    "location",
    "localStorage",
    "fetch",
    "setInterval",
  ];
  const previous = Object.fromEntries(
    globals.map((name) => [name, globalThis[name]]),
  );
  t.after(() => {
    for (const name of globals) {
      if (previous[name] === undefined) delete globalThis[name];
      else globalThis[name] = previous[name];
    }
  });

  const handlers = {};
  const output = { innerHTML: "" };
  const input = { value: "", focus() {} };
  const form = {};
  const record = { data: seed(), initialized: true, revision: 0 };
  globalThis.location = { hash: "#terminal" };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.setInterval = () => 0;
  globalThis.fetch = async (path, options) => {
    if (options?.method === "PUT") record.revision += 1;
    return { ok: true, json: async () => structuredClone(record) };
  };
  globalThis.document = {
    documentElement: { dataset: { theme: "light" } },
    addEventListener(type, handler) {
      handlers[type] = handler;
    },
    querySelector(selector) {
      if (selector === "#app") return output;
      if (selector === "#terminal-input") return input;
      if (selector === "#terminal-form") return form;
      if (selector === "#toast") return { style: {}, textContent: "" };
      return null;
    },
  };

  await import("./app.js?navigation-integration-test");
  for (const role of ["Employee", "Technician", "Administrator"]) {
    handlers.change({ target: { id: "role", value: role, dataset: {} } });
    assert.match(output.innerHTML, /data-page="Terminal"/);
    assert.doesNotMatch(output.innerHTML, /Terminal,&gt;_/);
    handlers.click({
      target: { closest: () => ({ dataset: { page: "Terminal" } }) },
    });
    assert.match(output.innerHTML, new RegExp(role + " commands"));
    assert.match(output.innerHTML, /id="terminal-form"/);
    assert.match(output.innerHTML, /data-terminal-command="whoami"/);
  }
});
