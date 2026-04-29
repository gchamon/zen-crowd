// Nested Folder Colorization — zen-crowd mod
//
// Colorizes Zen Browser's native nested folders by depth with a translucent
// tint, and adds hover-expand: hovering a collapsed folder expands it;
// leaving collapses it after a configurable delay unless it contains the
// active tab or was already expanded before the hover.
//
// USAGE
//   Development  : paste into Zen Browser Console (Ctrl+Shift+J) and press Enter.
//                  Re-pasting is safe; the prior <style> is replaced cleanly.
//   Persistent   : picked up by fx-autoconfig as described in work item -03.
//
// PREREQUISITES in about:config
//   devtools.chrome.enabled         = true
//   devtools.debugger.remote-enabled = true

// ─── Configuration (backed by Services.prefs) ───────────────────────────────

function readConfig() {
  return {
    colorSource: Services.prefs.getStringPref("zen.crowd.folder.colorSource", "palette"),
    tintOpacityLight: parseInt(Services.prefs.getStringPref("zen.crowd.folder.tintOpacityLight", "18"), 10) / 100,
    tintOpacityDark: parseInt(Services.prefs.getStringPref("zen.crowd.folder.tintOpacityDark", "22"), 10) / 100,
    folderBorderRadius: parseInt(Services.prefs.getStringPref("zen.crowd.folder.folderBorderRadius", "6"), 10),
    hoverCollapseDelay: parseInt(Services.prefs.getStringPref("zen.crowd.folder.hoverCollapseDelay", "200"), 10),
    hoverExpandEnabled: Services.prefs.getBoolPref("zen.crowd.folder.hoverExpandEnabled", true),
    // Static (not user-facing via UI — edit src directly to override)
    palette: [
      { light: "#e74c3c", dark: "#ff7a6b" },
      { light: "#e67e22", dark: "#ffa15c" },
      { light: "#27ae60", dark: "#5fd38c" },
      { light: "#2980b9", dark: "#6cb4ff" },
      { light: "#8e44ad", dark: "#c89cff" },
      { light: "#16a085", dark: "#5ed6c1" },
    ],
    themeHueStep: 40,
    themeDepthCount: 6,
  };
}

// ─── Implementation ──────────────────────────────────────────────────────────

const STYLE_ID = "zen-crowd-folder-colorization";
const HOVER_CLASS = "zen-crowd-hover-expanded";

// Converts [r, g, b] (0–255) to [h (0–360), s (0–100), l (0–100)].
function rgbToHsl(r, g, b) {
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

// Returns a CSS hex string for an HSL triplet (h 0–360, s/l 0–100).
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return `#${[f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

// Reads --zen-primary-color from a window's document and builds a hue-rotated
// palette of `count` steps with `hueStep` degrees between them.
function buildThemePalette(win, count, hueStep) {
  const raw = win.getComputedStyle(win.document.documentElement)
    .getPropertyValue("--zen-primary-color").trim();

  // Resolve the value; it may be a named color or hex. Parse it via a
  // temporary canvas element to normalize to rgb().
  const canvas = win.document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = raw || "#2980b9";
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

  const [h, s, l] = rgbToHsl(r, g, b);

  // For the dark variant use a lighter, more saturated tone.
  const lLight = Math.min(l + 10, 65);
  const lDark  = Math.min(l + 25, 80);
  const sDark  = Math.min(s + 10, 100);

  return Array.from({ length: count }, (_, i) => {
    const hue = h + i * hueStep;
    return {
      light: hslToHex(hue, s,     lLight),
      dark:  hslToHex(hue, sDark, lDark),
    };
  });
}

// Builds the CSS string for all depth levels.
function buildCSS(win, config) {
  const palette = config.colorSource === "theme"
    ? buildThemePalette(win, config.themeDepthCount, config.themeHueStep)
    : config.palette;

  const lightPct = Math.round(config.tintOpacityLight * 100) + "%";
  const darkPct  = Math.round(config.tintOpacityDark  * 100) + "%";
  const r        = config.folderBorderRadius;

  const rules = palette.map(({ light, dark }, i) => {
    const depth    = i + 1;
    const selector = "#tabbrowser-tabs " + Array(depth).fill("zen-folder").join(" ");
    const bg = `light-dark(
      color-mix(in srgb, ${light} ${lightPct}, transparent),
      color-mix(in srgb, ${dark}  ${darkPct},  transparent)
    )`;
    return `${selector} {\n  background-color: ${bg};\n  border-radius: ${r}px;\n}`;
  });

  return rules.join("\n\n");
}

// Injects (or replaces) the colorization stylesheet in a single window.
function injectStyle(win, config) {
  const doc = win.document;
  const prior = doc.getElementById(STYLE_ID);
  if (prior) prior.remove();

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildCSS(win, config);
  doc.documentElement.appendChild(style);
}

// ─── Hover-expand ────────────────────────────────────────────────────────────

// Returns true if the folder contains the currently active tab.
function folderHasActiveTab(folder) {
  return folder.hasAttribute("has-active");
}

// Attaches hover-expand handlers to a single zen-folder element within a
// window. Idempotent: re-attaching after script re-paste is harmless because
// the WeakSet guard prevents duplicate listeners.
const _attachedFolders = new WeakSet();

function attachHoverHandlers(folder) {
  if (_attachedFolders.has(folder)) return;
  _attachedFolders.add(folder);

  let wasCollapsedBeforeHover = false;
  let collapseTimer = null;

  folder.addEventListener("mouseenter", () => {
    if (!Services.prefs.getBoolPref("zen.crowd.folder.hoverExpandEnabled", true)) return;
    if (collapseTimer !== null) {
      clearTimeout(collapseTimer);
      collapseTimer = null;
    }
    wasCollapsedBeforeHover = folder.collapsed;
    if (folder.collapsed) {
      folder.collapsed = false;
      folder.classList.add(HOVER_CLASS);
    }
  });

  folder.addEventListener("mouseleave", () => {
    if (!Services.prefs.getBoolPref("zen.crowd.folder.hoverExpandEnabled", true)) return;
    const delay = parseInt(Services.prefs.getStringPref("zen.crowd.folder.hoverCollapseDelay", "200"), 10);
    collapseTimer = setTimeout(() => {
      collapseTimer = null;
      // Rule a: folder has the active tab — keep open.
      if (folderHasActiveTab(folder)) {
        folder.classList.remove(HOVER_CLASS);
        return;
      }
      // Rule b: folder was already expanded before this hover — keep open.
      if (!wasCollapsedBeforeHover) {
        folder.classList.remove(HOVER_CLASS);
        return;
      }
      // Auto-collapse: return to pre-hover state.
      if (folder.classList.contains(HOVER_CLASS)) {
        folder.collapsed = true;
        folder.classList.remove(HOVER_CLASS);
      }
    }, delay);
  });
}

// Attaches hover handlers to all existing zen-folder elements in a window and
// sets up a MutationObserver so newly added folders are handled automatically.
const _windowObservers = new WeakMap();

function setupHoverExpand(win) {
  const doc = win.document;
  const tabsContainer = doc.getElementById("tabbrowser-tabs");
  if (!tabsContainer) return;

  // Attach to folders already in the DOM.
  for (const folder of tabsContainer.querySelectorAll("zen-folder")) {
    attachHoverHandlers(folder);
  }

  // Watch for new zen-folder elements added later.
  if (_windowObservers.has(win)) {
    _windowObservers.get(win).disconnect();
  }

  const observer = new win.MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName?.toLowerCase() === "zen-folder") {
          attachHoverHandlers(node);
        }
        for (const folder of node.querySelectorAll?.("zen-folder") ?? []) {
          attachHoverHandlers(folder);
        }
      }
    }
  });

  observer.observe(tabsContainer, { childList: true, subtree: true });
  _windowObservers.set(win, observer);
}

// ─── Pref observer & reinjection ─────────────────────────────────────────────

function reinjectAll() {
  const windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    const win = windows.getNext();
    applyToWindow(win);
  }
}

function observePrefs() {
  const observer = {
    observe() {
      reinjectAll();
    }
  };
  Services.prefs.addObserver("zen.crowd.folder.", observer);
}

// ─── Window enumeration & listener ───────────────────────────────────────────

function applyToWindow(win) {
  const config = readConfig();
  injectStyle(win, config);
  setupHoverExpand(win);
}

function setup() {
  observePrefs();

  // Apply to all already-open browser windows.
  const windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    const win = windows.getNext();
    applyToWindow(win);
  }

  // Listen for windows opened after script load.
  const windowListener = {
    onOpenWindow(xulWindow) {
      const win = xulWindow
        .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIDOMWindow);
      win.addEventListener("load", function onLoad() {
        win.removeEventListener("load", onLoad);
        if (win.document.documentElement.getAttribute("windowtype") === "navigator:browser") {
          applyToWindow(win);
        }
      });
    },
    onCloseWindow() {},
    onWindowTitleChange() {},
  };

  Services.wm.addListener(windowListener);

  const config = readConfig();
  console.log(`[${STYLE_ID}] loaded — colorSource: ${config.colorSource}, hoverExpand: ${config.hoverExpandEnabled}`);
}

setup();
