// Shared helpers for zen-crowd mods.
//
// Loaded as an ES module by fx-autoconfig and importable from any
// .uc.js script via:
//
//   const lib = ChromeUtils.importESModule(
//     "chrome://userchromejs/content/zen-crowd-shared.sys.mjs"
//   );

// ─── Color math ─────────────────────────────────────────────────────────────

// [r,g,b] (0-255) → [h (0-360), s (0-100), l (0-100)]
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return `#${[f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

// Parses any CSS color string via canvas.
export function parseCssColor(win, cssColor) {
  const canvas = win.document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

// ─── Palette builders ───────────────────────────────────────────────────────

export const DEFAULT_PALETTE = [
  { light: "#e74c3c", dark: "#ff7a6b" },
  { light: "#e67e22", dark: "#ffa15c" },
  { light: "#27ae60", dark: "#5fd38c" },
  { light: "#2980b9", dark: "#6cb4ff" },
  { light: "#8e44ad", dark: "#c89cff" },
  { light: "#16a085", dark: "#5ed6c1" },
];

function adjustForLightDark(h, s, l) {
  const lLight = Math.min(l + 10, 65);
  const lDark = Math.min(l + 25, 80);
  const sDark = Math.min(s + 10, 100);
  return { lLight, lDark, sDark };
}

export function buildHueRotatedPalette(win, cssColor, count, hueStep) {
  const [r, g, b] = parseCssColor(win, cssColor);
  const [h, s, l] = rgbToHsl(r, g, b);
  const { lLight, lDark, sDark } = adjustForLightDark(h, s, l);
  return Array.from({ length: count }, (_, i) => {
    const hue = h + i * hueStep;
    return {
      light: hslToHex(hue, s, lLight),
      dark:  hslToHex(hue, sDark, lDark),
    };
  });
}

export function buildCustomListPalette(win, hexes, count) {
  return Array.from({ length: count }, (_, i) => {
    const hex = hexes[i % hexes.length];
    const [r, g, b] = parseCssColor(win, hex);
    const [h, s, l] = rgbToHsl(r, g, b);
    const { lLight, lDark, sDark } = adjustForLightDark(h, s, l);
    return {
      light: hslToHex(h, s, lLight),
      dark:  hslToHex(h, sDark, lDark),
    };
  });
}

export function buildThemePalette(win, count, hueStep) {
  const raw = win.getComputedStyle(win.document.documentElement)
    .getPropertyValue("--zen-primary-color").trim();
  return buildHueRotatedPalette(win, raw || "#2980b9", count, hueStep);
}

// Selects a palette based on a colorSource string.
//   ""            → theme accent (default)
//   "palette"     → DEFAULT_PALETTE
//   "custom-hue"  → hue-rotated from customBaseColor
//   "custom-list" → comma-separated list, falls back to theme if empty
export function selectPalette(win, {
  colorSource,
  customBaseColor,
  customColors,
  count,
  hueStep,
}) {
  switch (colorSource) {
    case "palette":
      return DEFAULT_PALETTE;
    case "custom-hue":
      return buildHueRotatedPalette(
        win, customBaseColor || "#2980b9", count, hueStep
      );
    case "custom-list": {
      const hexes = (customColors || "").split(",").map(s => s.trim()).filter(Boolean);
      return hexes.length
        ? buildCustomListPalette(win, hexes, count)
        : buildThemePalette(win, count, hueStep);
    }
    default:
      return buildThemePalette(win, count, hueStep);
  }
}

// ─── Window enumeration ─────────────────────────────────────────────────────

export function enumerateBrowserWindows() {
  const out = [];
  const e = Services.wm.getEnumerator("navigator:browser");
  while (e.hasMoreElements()) out.push(e.getNext());
  return out;
}

// Registers a listener that fires `handler(win)` for each newly opened
// browser window after the window has loaded. Returns a remover.
export function addWindowOpenListener(handler) {
  const listener = {
    onOpenWindow(xulWindow) {
      const win = xulWindow
        .QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIDOMWindow);
      win.addEventListener("load", function onLoad() {
        win.removeEventListener("load", onLoad);
        if (
          win.document.documentElement.getAttribute("windowtype") ===
          "navigator:browser"
        ) {
          handler(win);
        }
      });
    },
    onCloseWindow() {},
    onWindowTitleChange() {},
  };
  Services.wm.addListener(listener);
  return () => Services.wm.removeListener(listener);
}

// ─── Style injection ────────────────────────────────────────────────────────

export function injectStyle(win, id, css) {
  const doc = win.document;
  doc.getElementById(id)?.remove();
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = css;
  doc.documentElement.appendChild(style);
}

export function removeStyle(win, id) {
  win.document.getElementById(id)?.remove();
}

// ─── Pref helpers ───────────────────────────────────────────────────────────

// Adds a pref observer on a branch prefix. Returns a remover.
export function addPrefObserver(branch, handler) {
  const observer = { observe: handler };
  Services.prefs.addObserver(branch, observer);
  return () => Services.prefs.removeObserver(branch, observer);
}

// Reads a string pref returning fallback for missing or empty values.
export function readStringPref(key, fallback = "") {
  try {
    const v = Services.prefs.getStringPref(key, "");
    return v === "" ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

export function readBoolPref(key, fallback) {
  try {
    return Services.prefs.getBoolPref(key, fallback);
  } catch (_) {
    return fallback;
  }
}

export function readIntPref(key, fallback) {
  try {
    const raw = Services.prefs.getStringPref(key, "");
    if (raw === "") return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch (_) {
    return fallback;
  }
}

// Returns the value of `key` if non-empty, otherwise the value of
// `fallbackKey`, otherwise `ultimateFallback`. Used by mods that
// "inherit" their visual prefs from another mod's namespace when
// the local pref is left blank.
export function inheritedString(key, fallbackKey, ultimateFallback = "") {
  const local = readStringPref(key, "");
  if (local !== "") return local;
  return readStringPref(fallbackKey, ultimateFallback);
}

export function inheritedInt(key, fallbackKey, ultimateFallback) {
  try {
    const local = Services.prefs.getStringPref(key, "");
    if (local !== "") {
      const n = parseInt(local, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch (_) {}
  return readIntPref(fallbackKey, ultimateFallback);
}
