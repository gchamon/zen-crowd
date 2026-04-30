// ==UserScript==
// @name           zen-crowd-folder-colorization
// @description    Colorizes nested folders by depth and adds hover-expand behavior
// @include        main
// ==/UserScript==

// Nested Folder Colorization — zen-crowd mod
//
// Colorizes Zen Browser's native nested folders by depth with a translucent
// tint, and adds hover-expand: hovering a collapsed folder expands it;
// moving the pointer out of the sidebar collapses auto-expanded folders
// with a staggered delay.
//
// USAGE
//   Development  : paste into Zen Browser Console (Ctrl+Shift+J) and press Enter.
//                  Re-pasting is safe; the prior <style> is replaced cleanly.
//   Persistent   : picked up by fx-autoconfig as described in work item -03.
//
// PREREQUISITES in about:config
//   devtools.chrome.enabled         = true
//   devtools.debugger.remote-enabled = true

(() => {
const GLOBAL_KEY = "__zenCrowdFolderColorization";
const STYLE_ID = "zen-crowd-folder-colorization";
const HOVER_CLASS = "zen-crowd-hover-expanded";

globalThis[GLOBAL_KEY]?.destroy?.();

const state = {
  attachedFolders: new WeakSet(),
  folderListeners: new WeakMap(),
  windowObservers: new WeakMap(),
  sidebarLeaveListeners: new WeakMap(),
  sidebarEnterListeners: new WeakMap(),
  dragEndListeners: new WeakMap(),
  collapseTimers: new WeakMap(),
  prefObserver: null,
  windowListener: null,
};

globalThis[GLOBAL_KEY] = state;

// ─── Configuration (backed by Services.prefs) ───────────────────────────────

function readConfig() {
  return {
    colorSource: Services.prefs.getStringPref("zen.crowd.folder.colorSource", ""),
    customBaseColor: Services.prefs.getStringPref("zen.crowd.folder.customBaseColor", "#2980b9"),
    customColors: Services.prefs.getStringPref("zen.crowd.folder.customColors", ""),
    colorTopLevelFolders: Services.prefs.getBoolPref("zen.crowd.folder.colorTopLevelFolders", true),
    colorTreatment: Services.prefs.getStringPref("zen.crowd.folder.colorTreatment", "background"),
    tintOpacityLight: parseInt(Services.prefs.getStringPref("zen.crowd.folder.tintOpacityLight", "18"), 10) / 100,
    tintOpacityDark: parseInt(Services.prefs.getStringPref("zen.crowd.folder.tintOpacityDark", "22"), 10) / 100,
    folderBorderRadius: parseInt(Services.prefs.getStringPref("zen.crowd.folder.folderBorderRadius", "6"), 10),
    hoverCollapseDelay: parseInt(Services.prefs.getStringPref("zen.crowd.folder.hoverCollapseDelay", "500"), 10),
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

// Parses any CSS color string via canvas and returns [r, g, b] (0–255).
function parseCssColor(win, cssColor) {
  const canvas = win.document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

// Builds a hue-rotated palette from any CSS color string.
function buildHueRotatedPalette(win, cssColor, count, hueStep) {
  const [r, g, b] = parseCssColor(win, cssColor);
  const [h, s, l] = rgbToHsl(r, g, b);
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

// Reads --zen-primary-color and delegates to buildHueRotatedPalette.
function buildThemePalette(win, count, hueStep) {
  const raw = win.getComputedStyle(win.document.documentElement)
    .getPropertyValue("--zen-primary-color").trim();
  return buildHueRotatedPalette(win, raw || "#2980b9", count, hueStep);
}

// Builds a palette from a list of hex strings, applying the same light/dark
// lightness adjustments as buildHueRotatedPalette. Cycles the list if it is
// shorter than count.
function buildCustomListPalette(win, hexes, count) {
  return Array.from({ length: count }, (_, i) => {
    const hex = hexes[i % hexes.length];
    const [r, g, b] = parseCssColor(win, hex);
    const [h, s, l] = rgbToHsl(r, g, b);
    const lLight = Math.min(l + 10, 65);
    const lDark  = Math.min(l + 25, 80);
    const sDark  = Math.min(s + 10, 100);
    return {
      light: hslToHex(h, s,     lLight),
      dark:  hslToHex(h, sDark, lDark),
    };
  });
}

// Builds the CSS string for all depth levels.
function buildCSS(win, config) {
  let palette;
  switch (config.colorSource) {
    case "palette":
      palette = config.palette;
      break;
    case "custom-hue":
      palette = buildHueRotatedPalette(
        win, config.customBaseColor || "#2980b9",
        config.themeDepthCount, config.themeHueStep
      );
      break;
    case "custom-list": {
      const hexes = config.customColors.split(",").map(s => s.trim()).filter(Boolean);
      palette = hexes.length
        ? buildCustomListPalette(win, hexes, config.themeDepthCount)
        : buildThemePalette(win, config.themeDepthCount, config.themeHueStep);
      break;
    }
    default: // "" or unrecognised → theme accent
      palette = buildThemePalette(win, config.themeDepthCount, config.themeHueStep);
  }

  const lightPct = Math.round(config.tintOpacityLight * 100) + "%";
  const darkPct  = Math.round(config.tintOpacityDark  * 100) + "%";
  const r        = config.folderBorderRadius;

  const rules = palette.map(({ light, dark }, i) => {
    const depth    = i + (config.colorTopLevelFolders ? 1 : 2);
    const selector = "#tabbrowser-tabs " + Array(depth).fill("zen-folder").join(" ");
    const color = `light-dark(
      color-mix(in srgb, ${light} ${lightPct}, transparent),
      color-mix(in srgb, ${dark}  ${darkPct},  transparent)
    )`;
    if (config.colorTreatment === "left-line") {
      return `${selector} {\n  border-inline-start: 3px solid ${color};\n}`;
    }
    return `${selector} {\n  background-color: ${color};\n  border-radius: ${r}px;\n}`;
  });

  rules.push(
    `#tabbrowser-tabs zen-folder.${HOVER_CLASS} {\n  opacity: 0.75;\n}`
  );

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

function attachHoverHandlers(folder) {
  if (state.attachedFolders.has(folder)) return;
  state.attachedFolders.add(folder);

  const onMouseEnter = (event) => {
    if (!Services.prefs.getBoolPref("zen.crowd.folder.hoverExpandEnabled", true)) return;
    if (event.shiftKey) return;
    if (!folder.collapsed) return;
    folder.collapsed = false;
    // A folder containing the active tab is implicitly user-pinned: skip
    // the marker so it isn't faded and isn't swept on sidebar-leave.
    if (!folderHasActiveTab(folder)) {
      folder.classList.add(HOVER_CLASS);
    }
  };

  const onDragEnter = () => {
    if (!Services.prefs.getBoolPref("zen.crowd.folder.hoverExpandEnabled", true)) return;
    const tabsContainer = folder.closest("#tabbrowser-tabs");
    if (tabsContainer) cancelCollapseTimers(tabsContainer);
    if (!folder.collapsed) return;
    folder.collapsed = false;
    if (!folderHasActiveTab(folder)) {
      folder.classList.add(HOVER_CLASS);
    }
  };

  folder.addEventListener("mouseenter", onMouseEnter);
  folder.addEventListener("dragenter", onDragEnter);
  state.folderListeners.set(folder, { onMouseEnter, onDragEnter });
}

// Attaches hover handlers to all existing zen-folder elements in a window and
// sets up a MutationObserver so newly added folders are handled automatically.
// Tracks pending stagger timers per tabsContainer so re-entry cancels them.

function cancelCollapseTimers(tabsContainer) {
  const timers = state.collapseTimers.get(tabsContainer);
  if (!timers) return;
  for (const t of timers) clearTimeout(t);
  state.collapseTimers.set(tabsContainer, []);
}

function collapseAutoExpandedFolders(tabsContainer) {
  const folders = [...tabsContainer.querySelectorAll(`zen-folder.${HOVER_CLASS}`)];
  const delay = parseInt(Services.prefs.getStringPref("zen.crowd.folder.hoverCollapseDelay", "500"), 10);
  const timers = [];
  folders.forEach((folder) => {
    timers.push(setTimeout(() => {
      if (!folder.classList.contains(HOVER_CLASS)) return;
      folder.classList.remove(HOVER_CLASS);
      if (folderHasActiveTab(folder)) return;
      folder.collapsed = true;
    }, delay));
  });
  state.collapseTimers.set(tabsContainer, timers);
}

function setupHoverExpand(win) {
  const doc = win.document;
  const tabsContainer = doc.getElementById("tabbrowser-tabs");
  if (!tabsContainer) return;

  // Attach to folders already in the DOM.
  for (const folder of tabsContainer.querySelectorAll("zen-folder")) {
    attachHoverHandlers(folder);
  }

  // Single sidebar-level mouseleave: when the pointer truly leaves
  // #tabbrowser-tabs, sweep all auto-expanded folders shut. This is the
  // only place auto-expanded folders get collapsed — no per-folder
  // timers, no reflow races.
  const priorLeave = state.sidebarLeaveListeners.get(tabsContainer);
  if (priorLeave) {
    tabsContainer.removeEventListener("mouseleave", priorLeave);
  }
  const onSidebarLeave = (event) => {
    if (!Services.prefs.getBoolPref("zen.crowd.folder.hoverExpandEnabled", true)) return;
    if (event.relatedTarget instanceof Element && tabsContainer.contains(event.relatedTarget)) return;
    // Pointer left onto the drag image — keep folders open so the user can
    // drop into them. The dragend listener handles collapse after the drag.
    if (win.gZenCompactModeManager?._isTabBeingDragged) return;
    collapseAutoExpandedFolders(tabsContainer);
  };
  tabsContainer.addEventListener("mouseleave", onSidebarLeave);
  state.sidebarLeaveListeners.set(tabsContainer, onSidebarLeave);

  // If the pointer re-enters the sidebar before the stagger completes,
  // cancel any pending collapse timers.
  const priorEnter = state.sidebarEnterListeners.get(tabsContainer);
  if (priorEnter) {
    tabsContainer.removeEventListener("mouseenter", priorEnter);
  }
  const onSidebarEnter = () => cancelCollapseTimers(tabsContainer);
  tabsContainer.addEventListener("mouseenter", onSidebarEnter);
  state.sidebarEnterListeners.set(tabsContainer, onSidebarEnter);

  // After a drag ends, sweep auto-expanded folders. We always sweep here
  // since we can't reliably read pointer position in dragend.
  const priorDragEnd = state.dragEndListeners.get(tabsContainer);
  if (priorDragEnd) {
    tabsContainer.removeEventListener("dragend", priorDragEnd);
  }
  const onDragEnd = () => {
    if (!Services.prefs.getBoolPref("zen.crowd.folder.hoverExpandEnabled", true)) return;
    collapseAutoExpandedFolders(tabsContainer);
  };
  tabsContainer.addEventListener("dragend", onDragEnd);
  state.dragEndListeners.set(tabsContainer, onDragEnd);

  // Watch for new zen-folder elements added later.
  if (state.windowObservers.has(win)) {
    state.windowObservers.get(win).disconnect();
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
  state.windowObservers.set(win, observer);
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
  state.prefObserver = observer;
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
  state.windowListener = {
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

  Services.wm.addListener(state.windowListener);

  const config = readConfig();
  console.log(`[${STYLE_ID}] loaded — colorSource: ${config.colorSource}, hoverExpand: ${config.hoverExpandEnabled}`);
}

state.destroy = () => {
  if (state.prefObserver) {
    Services.prefs.removeObserver("zen.crowd.folder.", state.prefObserver);
    state.prefObserver = null;
  }

  if (state.windowListener) {
    Services.wm.removeListener(state.windowListener);
    state.windowListener = null;
  }

  const windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    const win = windows.getNext();
    const doc = win.document;
    doc.getElementById(STYLE_ID)?.remove();

    const tabsContainer = doc.getElementById("tabbrowser-tabs");
    if (!tabsContainer) continue;

    cancelCollapseTimers(tabsContainer);

    const onLeave = state.sidebarLeaveListeners.get(tabsContainer);
    if (onLeave) tabsContainer.removeEventListener("mouseleave", onLeave);

    const onEnter = state.sidebarEnterListeners.get(tabsContainer);
    if (onEnter) tabsContainer.removeEventListener("mouseenter", onEnter);

    const onDragEnd = state.dragEndListeners.get(tabsContainer);
    if (onDragEnd) tabsContainer.removeEventListener("dragend", onDragEnd);

    state.windowObservers.get(win)?.disconnect();

    for (const folder of tabsContainer.querySelectorAll("zen-folder")) {
      folder.classList.remove(HOVER_CLASS);
      const listeners = state.folderListeners.get(folder);
      if (!listeners) continue;
      folder.removeEventListener("mouseenter", listeners.onMouseEnter);
      folder.removeEventListener("dragenter", listeners.onDragEnter);
    }
  }
};

setup();
})();
