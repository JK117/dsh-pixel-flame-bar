/* Pixel flame bar — browser half.
 *
 * This file is a source template: `scripts/build.mjs` injects the stylesheet
 * from src/lightbar.css, inlines src/flame.js, and writes lib/client.js, which
 * is the bundle the DSH client module loader serves.
 */
window.__ModuleLoader__.load({
  id: "dsh-pixel-flame-bar",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");

    const PLUGIN_ID = "dsh-pixel-flame-bar";
    const CSS_TAG_ID = PLUGIN_ID + "/lightbar.css";
    const CSS = __LIGHTBAR_CSS_JSON__;

    if (typeof document !== "undefined") {
      const existing = document.querySelector(
        "style[data-plugin-css=" + JSON.stringify(CSS_TAG_ID) + "]",
      );
      if (existing === null) {
        const tag = document.createElement("style");
        tag.dataset.plugin = PLUGIN_ID;
        tag.dataset.pluginCss = CSS_TAG_ID;
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }
    }

    /*__FLAME_RENDERER__*/

    const COPY = {
      running: "会话运行中 · Session running",
      preview: "已点亮，5 秒后熄灭 · Lit for 5 seconds",
      idle: "点击亮 5 秒 · Click to light for 5 seconds",
    };

    /** True while at least one Session reports running work. */
    function selectAnyRunning(statuses) {
      if (statuses === undefined || statuses === null) return false;
      if (typeof statuses.values !== "function") return false;
      for (const status of statuses.values()) {
        if (status !== null && status !== undefined && status.running === true) {
          return true;
        }
      }
      return false;
    }

    /**
     * A transparent pixel array above the sidebar account row. There is no
     * track, thumb, slider, or effort affordance: just cells whose alpha is
     * near zero when idle and random white sparkles while a session runs.
     */
    function PixelFlameBar({ wide, useSessionStatus }) {
      // All hooks run before any layout shortcut: `wide` flips while the
      // sidebar collapses, and a conditional hook would change hook order.
      const running =
        typeof useSessionStatus === "function"
          ? useSessionStatus(selectAnyRunning)
          : false;
      const canvasRef = React.useRef(null);
      const flameRef = React.useRef(null);
      const previewTimer = React.useRef(null);
      const [previewing, setPreviewing] = React.useState(false);
      const active = running || previewing;

      React.useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null || typeof createFlameRenderer !== "function") {
          return undefined;
        }
        const flame = createFlameRenderer(canvas);
        flameRef.current = flame;
        return () => {
          flame.destroy();
          flameRef.current = null;
        };
      }, []);

      React.useEffect(
        () => () => {
          if (previewTimer.current !== null) {
            clearTimeout(previewTimer.current);
            previewTimer.current = null;
          }
        },
        [],
      );

      React.useEffect(() => {
        const flame = flameRef.current;
        if (flame === null) return;
        if (active && wide !== false) flame.start();
        else flame.stop();
      }, [active, wide]);

      /** Idle click: light the array for five seconds; repeat clicks extend it. */
      function activate() {
        if (running) return;
        setPreviewing(true);
        if (previewTimer.current !== null) {
          clearTimeout(previewTimer.current);
        }
        previewTimer.current = setTimeout(() => {
          previewTimer.current = null;
          setPreviewing(false);
        }, 5000);
      }

      const label = running
        ? COPY.running
        : previewing
          ? COPY.preview
          : COPY.idle;

      return React.createElement(
        "button",
        {
          type: "button",
          className: "dsh-sl",
          "data-running": running ? "true" : "false",
          "data-previewing": previewing ? "true" : "false",
          "data-active": active ? "true" : "false",
          "data-wide": wide === false ? "false" : "true",
          "aria-label": label,
          title: label,
          onClick: activate,
        },
        React.createElement("canvas", {
          ref: canvasRef,
          className: "dsh-sl__pixels",
          "aria-hidden": "true",
        }),
      );
    }

    PixelFlameBar.displayName = "PixelFlameBar";

    /** Registers the array into the sidebar's footer-action seat. */
    function apply(ctx) {
      ctx.slots.inject("sidebar.footer.action", () =>
        ctx.slots.register(
          {
            name: "sidebar.footer.action",
            id: "pixel-flame-bar",
            order: 40,
            label: "Pixel flame bar",
          },
          PixelFlameBar,
        ),
      );
    }

    const inject = ["slots"];

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
