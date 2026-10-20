/**
 * Pixel-array renderer for the session light bar.
 *
 * A dependency-free 2D-canvas field of pixel blocks on a transparent
 * background. Idle cells sit at a barely visible alpha; while a session runs,
 * every cell flickers independently with its own random noise and occasional
 * white sparkle. There is no track, thumb, slider, or spatial wave.
 *
 * The function is intentionally a plain top-level function: the client bundle
 * inlines it, and preview/index.html loads this file as a classic script.
 */
function createFlameRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: true });
  const reduceQuery =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  let raf = 0;
  let running = false;
  let stopping = false;
  let destroyed = false;
  let level = 0;
  let clock = 0;
  let lastFrame = 0;
  let staticTime = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let observer = null;

  function reduced() {
    return reduceQuery !== null && reduceQuery.matches === true;
  }

  function hash(x, y) {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  /**
   * DeepSeek theme blues. The DSH theme exposes these as static tokens; the
   * hard-coded values are the same palette, used by the standalone preview and
   * as a fallback if the tokens are unavailable.
   */
  function readPalette() {
    const fallback = {
      blue500: [65, 118, 230],
      blue450: [86, 134, 254],
      blue400: [122, 170, 255],
      blue300: [183, 200, 254],
      blue200: [211, 226, 255],
      white: [255, 255, 255],
    };
    if (
      typeof document === "undefined" ||
      typeof getComputedStyle !== "function"
    ) {
      return fallback;
    }
    const styles = getComputedStyle(document.documentElement);
    const read = (name, fallbackRgb) => {
      const value = styles.getPropertyValue(name).trim();
      const match = /^#([0-9a-f]{6})$/i.exec(value);
      if (match === null) return fallbackRgb;
      const int = Number.parseInt(match[1], 16);
      return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
    };
    return {
      blue500: read("--dsw-static-deepseek-500", fallback.blue500),
      blue450: read("--dsw-static-deepseek-450", fallback.blue450),
      blue400: read("--dsw-static-deepseek-400", fallback.blue400),
      blue300: read("--dsw-static-deepseek-300", fallback.blue300),
      blue200: read("--dsw-static-deepseek-200", fallback.blue200),
      white: fallback.white,
    };
  }

  const palette = readPalette();

  /** Map a cell's energy to the transparent -> DeepSeek blue -> white ramp. */
  function pixelColor(energy, alpha) {
    let rgb;
    if (energy >= 0.8) rgb = palette.white;
    else if (energy >= 0.58) rgb = palette.blue200;
    else if (energy >= 0.38) rgb = palette.blue300;
    else if (energy >= 0.22) rgb = palette.blue400;
    else if (energy >= 0.08) rgb = palette.blue450;
    else rgb = palette.blue500;
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
  }

  /** Match the backing buffer to the canvas's laid-out CSS size. */
  function syncSize() {
    if (ctx === null || destroyed) return;
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      2,
    );
    const nextWidth = Math.max(1, Math.round(width * dpr));
    const nextHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
  }

  function clear() {
    if (ctx === null) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /** One frame at a global ignition level and a monotonic time in seconds. */
  function drawPixels(levelValue, time) {
    if (ctx === null || destroyed || width <= 0 || height <= 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;

    const cell = 3;
    const gap = 1;
    const pitch = cell + gap;
    const columns = Math.max(1, Math.floor((width + gap) / pitch));
    const rows = Math.min(5, Math.max(1, Math.floor((height + gap) / pitch)));
    // Align the grid to device pixels.
    const offsetX = Math.round(((width - (columns * pitch - gap)) / 2) * dpr) / dpr;
    const offsetY = Math.round(((height - (rows * pitch - gap)) / 2) * dpr) / dpr;
    const lvl = clamp(levelValue, 0, 1);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const seed = hash(column + 1, row + 3);

        // Off state: every cell remains, but only as a whisper of white.
        const idleAlpha = 0.035 + hash(column * 5 + 1, row * 7 + 2) * 0.055;
        // Running keeps a much fainter version of the same grid so the array
        // never disappears completely behind the sparkles.
        const baseAlpha = idleAlpha * 0.9;
        let alpha = baseAlpha + (idleAlpha - baseAlpha) * (1 - lvl);
        let shade = 0;

        if (lvl > 0) {
          // Each cell joins at its own random moment; no left-to-right front.
          const local = clamp((time - seed * 0.5) / 0.32, 0, 1);
          if (local > 0) {
            // Fast independent noise, interpolated between 9 Hz samples.
            const tick = time * 9;
            const slice = Math.floor(tick);
            const fraction = tick - slice;
            const r1 = hash(column * 17 + slice * 31, row * 19 + slice * 17);
            const r2 = hash(
              column * 17 + (slice + 1) * 31,
              row * 19 + (slice + 1) * 17,
            );
            const noise = r1 + (r2 - r1) * fraction;

            // A second, slower independent noise layer breaks up the rhythm.
            const slowTick = time * 2.1;
            const slowSlice = Math.floor(slowTick);
            const slowFraction = slowTick - slowSlice;
            const s1 = hash(
              column * 19 + slowSlice * 7,
              row * 23 + slowSlice * 11,
            );
            const s2 = hash(
              column * 19 + (slowSlice + 1) * 7,
              row * 23 + (slowSlice + 1) * 11,
            );
            const slow = s1 + (s2 - s1) * slowFraction;

            let energy = Math.pow(noise, 1.45) * (0.55 + 0.45 * slow);

            // A sparse per-cell mask keeps the field from becoming flat static.
            const mask = hash(column * 3 + 7, row * 5 + 11);
            if (mask < 0.18) energy *= 0.45;

            // Rare, unrelated flashes: the "sparkle" layer.
            const sparkleTick = Math.floor(time * 6.5 + seed * 17);
            const sparkle = hash(
              column * 37 + sparkleTick * 23,
              row * 41 + sparkleTick * 29,
            );
            if (sparkle > 0.985) energy = 1.6;

            energy = clamp(energy, 0, 1.5);
            shade = energy;
            if (energy > 0.04) {
              alpha += lvl * local * Math.min(energy, 1) * 1.5;
            }
          }
        }
        alpha = Math.min(alpha, 1);

        const x = offsetX + column * pitch;
        const y = offsetY + row * pitch;

        // Transparent at the dark end, DeepSeek blue in the middle, white at
        // the bright end. Alpha is the brightness; the hue follows the ramp.
        if (alpha < 0.012) continue;
        ctx.fillStyle = pixelColor(shade, alpha);
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  function frame(now) {
    if (destroyed) return;
    const delta =
      lastFrame === 0 ? 0 : Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (running) level = Math.min(1, level + delta / 0.35);
    else if (stopping) level = Math.max(0, level - delta / 0.35);

    drawPixels(level, (now - clock) / 1000);

    if (!running && level <= 0) {
      stopping = false;
      raf = 0;
      drawPixels(0, 0);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (ctx === null || destroyed) return;
    syncSize();

    if (reduced()) {
      running = true;
      stopping = false;
      level = 1;
      staticTime = null;
      clock = performance.now() - 1400;
      drawPixels(1, 1.4);
      return;
    }

    const now = performance.now();
    // Starting from idle: begin a new clock and fade up from the faint array.
    // Restarting during a fade-out keeps the current level and clock.
    if (!running && !stopping) {
      clock = now;
      level = 0;
    }
    running = true;
    stopping = false;
    staticTime = null;

    if (raf === 0) {
      lastFrame = now;
      raf = requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (ctx === null || destroyed) return;

    if (reduced() || level <= 0) {
      running = false;
      stopping = false;
      level = 0;
      staticTime = null;
      drawPixels(0, 0);
      return;
    }

    running = false;
    stopping = true;
    staticTime = null;

    if (raf === 0) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function renderAt(seconds) {
    syncSize();
    running = false;
    stopping = false;
    level = clamp(seconds / 0.35, 0, 1);
    staticTime = seconds;
    cancelAnimationFrame(raf);
    raf = 0;
    drawPixels(level, seconds);
  }

  function resize() {
    syncSize();
    if (running) {
      if (reduced()) drawPixels(1, 1.4);
      else drawPixels(level, (performance.now() - clock) / 1000);
    } else if (stopping) {
      drawPixels(level, (performance.now() - clock) / 1000);
    } else if (staticTime !== null) {
      drawPixels(clamp(staticTime / 0.35, 0, 1), staticTime);
    } else {
      drawPixels(0, 0);
    }
  }

  function destroy() {
    destroyed = true;
    running = false;
    stopping = false;
    level = 0;
    staticTime = null;
    cancelAnimationFrame(raf);
    raf = 0;
    if (observer !== null) {
      observer.disconnect();
      observer = null;
    }
    clear();
  }

  if (ctx !== null) {
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
    }
    syncSize();
    drawPixels(0, 0);
  }

  return { start, stop, renderAt, resize, clear, destroy };
}
