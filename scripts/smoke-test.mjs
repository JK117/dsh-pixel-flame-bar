import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const bundlePath = fileURLToPath(new URL("../lib/client.js", import.meta.url));
const source = readFileSync(bundlePath, "utf8");

let registration;
const styles = [];
const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: props ?? {},
    children,
  }),
  useRef: (initial) => ({ current: initial }),
  useState: (initial) => [
    typeof initial === "function" ? initial() : initial,
    () => {},
  ],
  useEffect: () => {},
};

const context = vm.createContext({
  window: { __ModuleLoader__: { load: (value) => { registration = value; } } },
  document: {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { appendChild: (element) => styles.push(element) },
  },
  Symbol,
  console,
});

vm.runInContext(source, context);

assert.equal(registration.id, "dsh-pixel-flame-bar");
const plugin = registration.factory((name) => {
  assert.equal(name, "react", `unexpected require: ${name}`);
  return React;
});

assert.deepEqual(Object.keys(plugin).sort(), ["apply", "inject"]);
assert.deepEqual([...plugin.inject], ["slots"]);
assert.equal(styles.length, 1);
assert.equal(styles[0].dataset.plugin, "dsh-pixel-flame-bar");
assert.equal(styles[0].dataset.pluginCss, "dsh-pixel-flame-bar/lightbar.css");

let registered;
plugin.apply({
  slots: {
    inject: (name, callback) => {
      assert.equal(name, "sidebar.footer.action");
      return callback();
    },
    register: (options, component) => {
      registered = { options, component };
      return () => {};
    },
  },
});

assert.equal(registered.options.name, "sidebar.footer.action");
assert.equal(registered.options.id, "pixel-flame-bar");
assert.equal(registered.component.displayName, "PixelFlameBar");

const running = new Map([
  ["s1", { running: false }],
  ["s2", { running: true }],
]);
const idle = new Map([["s1", { running: false }]]);
let hookCalls = 0;
const props = (statuses, wide = true) => ({
  wide,
  useSessionStatus: (selector) => {
    hookCalls += 1;
    return selector(statuses);
  },
});

const active = registered.component(props(running));
const resting = registered.component(props(idle));
const collapsed = registered.component(props(running, false));

assert.equal(active.props["data-running"], "true");
assert.equal(active.props["data-active"], "true");
assert.equal(resting.props["data-running"], "false");
assert.equal(resting.props["data-active"], "false");
assert.equal(active.props["aria-label"], "会话运行中 · Session running");
assert.equal(resting.props["aria-label"], "点击亮 5 秒 · Click to light for 5 seconds");
assert.equal(collapsed.props["data-wide"], "false");
assert.equal(collapsed.props["data-running"], "true");
assert.equal(collapsed.props["data-active"], "true");
// The Session hook must run on every render, including the collapsed one, or
// React sees a changing hook order while the sidebar collapses.
assert.equal(hookCalls, 3);

console.log("smoke test passed:", bundlePath);
