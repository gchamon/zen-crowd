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
const lib = ChromeUtils.importESModule(
  "chrome://userchromejs/content/zen-crowd-shared.sys.mjs"
);

const GLOBAL_KEY = "__zenCrowdFolderColorization";
const STYLE_ID = "zen-crowd-folder-colorization";
const HOVER_CLASS = "zen-crowd-hover-expanded";
const BACKGROUND_DEPTH_LIMIT = 24;
const LEFT_LINE_DEPTH_LIMIT = 7;
const PALETTE_STEPS = 6;
const HUE_STEP = 40;

globalThis[GLOBAL_KEY]?.destroy?.();

const state = {
  attachedFolders: new WeakSet(),
  folderListeners: new WeakMap(),
  windowObservers: new WeakMap(),
  sidebarLeaveListeners: new WeakMap(),
  sidebarEnterListeners: new WeakMap(),
  dragEndListeners: new WeakMap(),
  collapseTimers: new WeakMap(),
  removePrefObserver: null,
  removeWindowListener: null,
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
  };
}

// ─── CSS ────────────────────────────────────────────────────────────────────

function buildCSS(win, config) {
  const palette = lib.selectPalette(win, {
    colorSource: config.colorSource,
    customBaseColor: config.customBaseColor,
    customColors: config.customColors,
    count: PALETTE_STEPS,
    hueStep: HUE_STEP,
  });

  const lightPct = Math.round(config.tintOpacityLight * 100) + "%";
  const darkPct  = Math.round(config.tintOpacityDark  * 100) + "%";
  const r        = config.folderBorderRadius;
  const firstColoredDepth = config.colorTopLevelFolders ? 1 : 2;
  const treatment = config.colorTreatment;

  const depthSelector = depth =>
    "#tabbrowser-tabs " + Array(depth).fill("zen-folder").join(" ");

  const tinted = ({ light, dark }) => `light-dark(
      color-mix(in srgb, ${light} ${lightPct}, transparent),
      color-mix(in srgb, ${dark}  ${darkPct},  transparent)
    )`;

  const backgroundRule = (depth, color) =>
    `${depthSelector(depth)} {\n  background-color: ${tinted(color)};\n  border-radius: ${r}px;\n}`;

  const leftLineRule = (depth, color) =>
    `${depthSelector(depth)} {\n  border-inline-start: 3px solid ${tinted(color)};\n}`;

  const rules = [];

  if (treatment === "background" || treatment === "both") {
    for (let depth = firstColoredDepth; depth <= BACKGROUND_DEPTH_LIMIT; depth++) {
      rules.push(backgroundRule(depth, palette[(depth - firstColoredDepth) % palette.length]));
    }
  }
  if (treatment === "left-line" || treatment === "both") {
    for (let depth = firstColoredDepth; depth <= LEFT_LINE_DEPTH_LIMIT; depth++) {
      rules.push(leftLineRule(depth, palette[(depth - firstColoredDepth) % palette.length]));
    }
    rules.push(`${depthSelector(LEFT_LINE_DEPTH_LIMIT + 1)} {\n  border-inline-start: 0;\n}`);
  }

  rules.push(
    `#tabbrowser-tabs zen-folder.${HOVER_CLASS} {\n  opacity: 0.75;\n}`
  );

  return rules.join("\n\n");
}

// ─── Hover-expand ───────────────────────────────────────────────────────────

function folderHasActiveTab(folder) {
  return folder.hasAttribute("has-active");
}

function attachHoverHandlers(folder) {
  if (state.attachedFolders.has(folder)) return;
  state.attachedFolders.add(folder);

  const onMouseEnter = (event) => {
    if (!Services.prefs.getBoolPref("zen.crowd.folder.hoverExpandEnabled", true)) return;
    if (event.shiftKey) return;
    if (!folder.collapsed) return;
    folder.collapsed = false;
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

  for (const folder of tabsContainer.querySelectorAll("zen-folder")) {
    attachHoverHandlers(folder);
  }

  const priorLeave = state.sidebarLeaveListeners.get(tabsContainer);
  if (priorLeave) {
    tabsContainer.removeEventListener("mouseleave", priorLeave);
  }
  const onSidebarLeave = (event) => {
    if (!Services.prefs.getBoolPref("zen.crowd.folder.hoverExpandEnabled", true)) return;
    if (event.relatedTarget instanceof Element && tabsContainer.contains(event.relatedTarget)) return;
    if (win.gZenCompactModeManager?._isTabBeingDragged) return;
    collapseAutoExpandedFolders(tabsContainer);
  };
  tabsContainer.addEventListener("mouseleave", onSidebarLeave);
  state.sidebarLeaveListeners.set(tabsContainer, onSidebarLeave);

  const priorEnter = state.sidebarEnterListeners.get(tabsContainer);
  if (priorEnter) {
    tabsContainer.removeEventListener("mouseenter", priorEnter);
  }
  const onSidebarEnter = () => cancelCollapseTimers(tabsContainer);
  tabsContainer.addEventListener("mouseenter", onSidebarEnter);
  state.sidebarEnterListeners.set(tabsContainer, onSidebarEnter);

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

// ─── Window application & lifecycle ─────────────────────────────────────────

function applyToWindow(win) {
  const config = readConfig();
  lib.injectStyle(win, STYLE_ID, buildCSS(win, config));
  setupHoverExpand(win);
}

function reinjectAll() {
  for (const win of lib.enumerateBrowserWindows()) {
    applyToWindow(win);
  }
}

function setup() {
  state.removePrefObserver = lib.addPrefObserver("zen.crowd.folder.", () => reinjectAll());

  for (const win of lib.enumerateBrowserWindows()) {
    applyToWindow(win);
  }

  state.removeWindowListener = lib.addWindowOpenListener(applyToWindow);

  const config = readConfig();
  console.log(`[${STYLE_ID}] loaded — colorSource: ${config.colorSource}, hoverExpand: ${config.hoverExpandEnabled}`);
}

state.destroy = () => {
  state.removePrefObserver?.();
  state.removePrefObserver = null;
  state.removeWindowListener?.();
  state.removeWindowListener = null;

  for (const win of lib.enumerateBrowserWindows()) {
    const doc = win.document;
    lib.removeStyle(win, STYLE_ID);

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
