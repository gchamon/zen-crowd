// ==UserScript==
// @name           zen-crowd-subtab-grouping
// @description    Tints tabs by opener depth so the subtab tree is visible at a glance
// @include        main
// ==/UserScript==

// Subtab Grouping — zen-crowd mod
//
// Tints each tab by its depth in the opener tree. A tab opened from a
// parent gets depth = parent.depth + 1; a fresh top-level tab has no
// depth (untinted). Depth is tracked in-memory per window and
// persisted via SessionStore so it survives restart.
//
// Tab placement is intentionally NOT modified — Firefox / Zen's
// default is acceptable.
//
// USAGE
//   Development : paste into Zen's Browser Console (Ctrl+Shift+J).
//                 Re-pasting is safe; prior listeners and <style> are
//                 torn down before re-init.
//   Persistent  : picked up by fx-autoconfig.
//
// PREREQUISITES in about:config
//   devtools.chrome.enabled         = true
//   devtools.debugger.remote-enabled = true

(() => {
const lib = ChromeUtils.importESModule(
  "chrome://userchromejs/content/zen-crowd-shared.sys.mjs"
);

const GLOBAL_KEY = "__zenCrowdSubtabGrouping";
const STYLE_ID = "zen-crowd-subtab-grouping";
const DEPTH_ATTR = "zen-crowd-depth";
const TAB_UUID_KEY = "zenCrowdTabUuid";
const PARENT_UUID_KEY = "zenCrowdParentTabUuid";
const OLD_PARENT_ID_KEY = "zenCrowdParentTabId";
const SNAPSHOT_PREF = "zen.crowd.subtab.restoreSnapshot";

const SUBTAB_BRANCH = "zen.crowd.subtab.";
const FOLDER_BRANCH = "zen.crowd.folder.";

// How many palette steps to materialize. The tint cycles past this
// when depth exceeds it.
const PALETTE_STEPS = 6;
// Depth coverage of the emitted CSS rules. Beyond this the palette
// silently stops cycling — practical browsing won't hit it.
const DEPTH_COVERAGE = 64;
const HUE_STEP = 40;

globalThis[GLOBAL_KEY]?.destroy?.();

const state = {
  windows: new WeakMap(), // win → { parentOf, childrenOf, listeners }
  removeWindowListener: null,
  removePrefObserver: null,
  enabled: true,
  restoreReady: false,
};

globalThis[GLOBAL_KEY] = state;

// ─── Config ─────────────────────────────────────────────────────────────────

function readConfig() {
  return {
    enabled: lib.readBoolPref(`${SUBTAB_BRANCH}enabled`, true),
    colorSource: lib.inheritedString(
      `${SUBTAB_BRANCH}colorSource`, `${FOLDER_BRANCH}colorSource`, ""
    ),
    customBaseColor: lib.inheritedString(
      `${SUBTAB_BRANCH}customBaseColor`, `${FOLDER_BRANCH}customBaseColor`, "#2980b9"
    ),
    customColors: lib.inheritedString(
      `${SUBTAB_BRANCH}customColors`, `${FOLDER_BRANCH}customColors`, ""
    ),
    colorTreatment: lib.inheritedString(
      `${SUBTAB_BRANCH}colorTreatment`, `${FOLDER_BRANCH}colorTreatment`, "background"
    ),
    tintOpacityLight: lib.inheritedInt(
      `${SUBTAB_BRANCH}tintOpacityLight`, `${FOLDER_BRANCH}tintOpacityLight`, 18
    ),
    tintOpacityDark: lib.inheritedInt(
      `${SUBTAB_BRANCH}tintOpacityDark`, `${FOLDER_BRANCH}tintOpacityDark`, 22
    ),
    borderRadius: lib.inheritedInt(
      `${SUBTAB_BRANCH}borderRadius`, `${FOLDER_BRANCH}folderBorderRadius`, 6
    ),
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
  const lightPct = `${config.tintOpacityLight}%`;
  const darkPct  = `${config.tintOpacityDark}%`;
  const r = config.borderRadius;
  const treatment = config.colorTreatment;

  const rules = [];
  for (let depth = 1; depth <= DEPTH_COVERAGE; depth++) {
    const { light, dark } = palette[(depth - 1) % palette.length];
    const selector = `#tabbrowser-tabs tab[${DEPTH_ATTR}="${depth}"]`;
    const tinted = `light-dark(
      color-mix(in srgb, ${light} ${lightPct}, transparent),
      color-mix(in srgb, ${dark}  ${darkPct},  transparent)
    )`;
    if (treatment === "background" || treatment === "both") {
      rules.push(`${selector} {
  background-color: ${tinted};
  border-radius: ${r}px;
}`);
    }
    if (treatment === "left-line" || treatment === "both") {
      rules.push(`${selector} {
  box-shadow: inset 3px 0 0 0 light-dark(${light}, ${dark});
}`);
    }
  }
  return rules.join("\n\n");
}

// ─── Per-window state ───────────────────────────────────────────────────────

function getWinState(win) {
  let s = state.windows.get(win);
  if (!s) {
    s = {
      parentOf: new Map(),
      childrenOf: new Map(),
      capturedOpeners: new WeakMap(),
      listeners: null,
      originalAddTab: null,
      originalAddTrustedTab: null,
      drag: null,
    };
    state.windows.set(win, s);
  }
  return s;
}

function recordLink(s, childUuid, parentUuid) {
  const cid = childUuid, pid = parentUuid;
  if (!cid || !pid) return;
  const oldPid = s.parentOf.get(cid);
  if (oldPid && oldPid !== pid) {
    const oldKids = s.childrenOf.get(oldPid);
    if (oldKids) {
      const i = oldKids.indexOf(cid);
      if (i !== -1) oldKids.splice(i, 1);
      if (!oldKids.length) s.childrenOf.delete(oldPid);
    }
  }
  s.parentOf.set(cid, pid);
  let kids = s.childrenOf.get(pid);
  if (!kids) { kids = []; s.childrenOf.set(pid, kids); }
  if (!kids.includes(cid)) kids.push(cid);
}

function dropLink(s, childUuid) {
  const cid = childUuid;
  if (!cid) return;
  const pid = s.parentOf.get(cid);
  s.parentOf.delete(cid);
  if (pid) {
    const kids = s.childrenOf.get(pid);
    if (kids) {
      const i = kids.indexOf(cid);
      if (i !== -1) kids.splice(i, 1);
      if (!kids.length) s.childrenOf.delete(pid);
    }
  }
}

// ─── Persistence ────────────────────────────────────────────────────────────

function flushTab(win, tab) {
  try {
    if (tab.linkedBrowser) {
      win.gBrowser.TabStateFlusher.flush(tab.linkedBrowser);
    }
  } catch (_) {}
}

function generateUuid() {
  return Services.uuid.generateUUID().toString();
}

function getCustomTabValue(win, tab, key) {
  try {
    return win.SessionStore.getCustomTabValue(tab, key) || null;
  } catch (_) { return null; }
}

function setTabUuid(win, tab, uuid) {
  setCustomTabValue(win, tab, TAB_UUID_KEY, uuid);
}

function setCustomTabValue(win, tab, key, value) {
  try {
    win.SessionStore.setCustomTabValue(tab, key, value);
    flushTab(win, tab);
  } catch (e) {
    console.warn(`[${STYLE_ID}] setCustomTabValue failed`, e);
  }
}

function assignTabUuid(win, tab) {
  const uuid = generateUuid();
  setCustomTabValue(win, tab, TAB_UUID_KEY, uuid);
  return uuid;
}

function deleteCustomTabValue(win, tab, key) {
  try {
    win.SessionStore.deleteCustomTabValue(tab, key);
    flushTab(win, tab);
  } catch (_) {}
}

function ensureTabUuid(win, tab) {
  let uuid = getCustomTabValue(win, tab, TAB_UUID_KEY);
  if (!uuid) {
    uuid = assignTabUuid(win, tab);
  }
  return uuid;
}

function getStoredParentUuid(win, tab) {
  return getCustomTabValue(win, tab, PARENT_UUID_KEY);
}

function setStoredParentUuid(win, tab, parentUuid) {
  setCustomTabValue(win, tab, PARENT_UUID_KEY, parentUuid);
}

function clearStoredParentUuid(win, tab) {
  deleteCustomTabValue(win, tab, PARENT_UUID_KEY);
}

function clearOldStoredParentId(win, tab) {
  deleteCustomTabValue(win, tab, OLD_PARENT_ID_KEY);
}

// ─── Snapshot fallback ──────────────────────────────────────────────────────

function tabUrl(tab) {
  return tab.linkedBrowser?.currentURI?.spec || "";
}

function tabWorkspace(tab) {
  return tab.getAttribute("zen-workspace-id") || "";
}

function readSnapshot() {
  try {
    const raw = Services.prefs.getStringPref(SNAPSHOT_PREF, "");
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeSnapshot(snapshot) {
  try {
    Services.prefs.setStringPref(SNAPSHOT_PREF, JSON.stringify(snapshot));
  } catch (e) {
    console.warn(`[${STYLE_ID}] restore snapshot write failed`, e);
  }
}

function snapshotMatchesWindow(snapshotWindow, win) {
  if (!snapshotWindow?.tabs) return false;
  const tabs = [...win.gBrowser.tabs];
  if (snapshotWindow.tabs.length !== tabs.length) return false;
  return snapshotWindow.tabs.every((savedTab, i) => {
    const tab = tabs[i];
    if (Boolean(savedTab.pinned) !== Boolean(tab.pinned)) return false;
    if (savedTab.workspace && savedTab.workspace !== tabWorkspace(tab)) return false;
    return !savedTab.url || !tabUrl(tab) || savedTab.url === tabUrl(tab);
  });
}

function applySnapshotToWindow(win, snapshotWindow) {
  if (!snapshotMatchesWindow(snapshotWindow, win)) return false;
  const tabs = [...win.gBrowser.tabs];
  snapshotWindow.tabs.forEach((savedTab, i) => {
    if (!savedTab.uuid) return;
    const tab = tabs[i];
    if (!getCustomTabValue(win, tab, TAB_UUID_KEY)) {
      setTabUuid(win, tab, savedTab.uuid);
    }
    if (savedTab.parentUuid && !getStoredParentUuid(win, tab)) {
      setStoredParentUuid(win, tab, savedTab.parentUuid);
    }
  });
  return true;
}

function updateSnapshot() {
  if (!state.restoreReady) return;
  const windows = lib.enumerateBrowserWindows().filter(win => win.gBrowser);
  const snapshot = {
    version: 1,
    windows: windows.map(win => {
      const s = state.windows.get(win);
      return {
        tabs: [...win.gBrowser.tabs].map(tab => {
          const uuid = getCustomTabValue(win, tab, TAB_UUID_KEY);
          return {
            uuid,
            parentUuid: uuid && s ? s.parentOf.get(uuid) || "" : "",
            url: tabUrl(tab),
            pinned: Boolean(tab.pinned),
            workspace: tabWorkspace(tab),
          };
        }),
      };
    }),
  };
  writeSnapshot(snapshot);
}

// ─── Depth + DOM tagging ────────────────────────────────────────────────────

function findTabByRuntimeId(win, tabId) {
  if (!tabId) return null;
  for (const tab of win.gBrowser.tabs) {
    if (tab.id === tabId) return tab;
  }
  return null;
}

function findTabByUuid(win, uuid) {
  if (!uuid) return null;
  for (const tab of win.gBrowser.tabs) {
    if (getCustomTabValue(win, tab, TAB_UUID_KEY) === uuid) return tab;
  }
  return null;
}

function depthOf(s, tabUuid) {
  let depth = 0;
  let cursor = tabUuid;
  const seen = new Set();
  while (cursor && s.parentOf.has(cursor)) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    cursor = s.parentOf.get(cursor);
    depth++;
  }
  return depth;
}

function applyDepthAttr(tab, depth) {
  if (depth <= 0) tab.removeAttribute(DEPTH_ATTR);
  else tab.setAttribute(DEPTH_ATTR, String(depth));
}

function retagSubtree(win, s, rootId) {
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    const tab = findTabByUuid(win, id);
    if (!tab) continue;
    applyDepthAttr(tab, depthOf(s, id));
    const kids = s.childrenOf.get(id);
    if (kids) stack.push(...kids);
  }
}

function retagAll(win, s) {
  for (const tab of win.gBrowser.tabs) {
    applyDepthAttr(tab, depthOf(s, ensureTabUuid(win, tab)));
  }
}

function isDescendantOfAny(s, childUuid, ancestorUuids) {
  let cursor = childUuid;
  const seen = new Set();
  while (cursor && s.parentOf.has(cursor)) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = s.parentOf.get(cursor);
    if (ancestorUuids.has(cursor)) return true;
  }
  return false;
}

function movedRootUuids(s, movedUuids) {
  return [...movedUuids].filter(uuid => !movedUuids.has(s.parentOf.get(uuid)));
}

// ─── Event handlers ─────────────────────────────────────────────────────────

function resolveOpener(win, s, tab) {
  const opener = tab.openerTab || s.capturedOpeners.get(tab);
  if (!opener || !opener.isConnected || opener === tab) return null;
  if (opener.ownerGlobal !== win) return null;
  return opener;
}

function onTabOpen(win, s, event) {
  const tab = event.target;
  // Defer one tick so Zen's own TabOpen handlers settle first.
  win.setTimeout(() => {
    if (!tab.isConnected) return;
    const opener = resolveOpener(win, s, tab);
    let tabUuid = ensureTabUuid(win, tab);
    if (!opener) {
      updateSnapshot();
      return;
    }

    const parentUuid = ensureTabUuid(win, opener);
    if (tabUuid === parentUuid) {
      tabUuid = assignTabUuid(win, tab);
    }
    if (!tabUuid || !parentUuid || tabUuid === parentUuid) return;

    recordLink(s, tabUuid, parentUuid);
    setStoredParentUuid(win, tab, parentUuid);
    applyDepthAttr(tab, depthOf(s, tabUuid));
    updateSnapshot();
  }, 0);
}

function onTabClose(win, s, event) {
  const tab = event.target;
  const tabUuid = getCustomTabValue(win, tab, TAB_UUID_KEY);
  if (!tabUuid) return;
  const orphans = s.childrenOf.get(tabUuid);
  if (orphans) {
    const orphanIds = [...orphans];
    for (const oid of orphanIds) {
      const orphanTab = findTabByUuid(win, oid);
      if (!orphanTab) continue;
      dropLink(s, oid);
      clearStoredParentUuid(win, orphanTab);
    }
    for (const oid of orphanIds) {
      retagSubtree(win, s, oid);
    }
  }
  dropLink(s, tabUuid);
  clearStoredParentUuid(win, tab);
  updateSnapshot();
}

function onTabMove(win) {
  win.setTimeout(() => updateSnapshot(), 0);
}

function draggedTabs(win, tab) {
  const selected = tab.multiselected ? win.gBrowser.selectedTabs : [tab];
  return selected.filter(t => t?.isConnected);
}

function onDragStart(win, s, event) {
  const tab = event.target?.closest?.("tab");
  if (!tab || !win.gBrowser.tabContainer.contains(tab)) return;
  const tabs = draggedTabs(win, tab);
  const movedUuids = new Set(tabs.map(t => ensureTabUuid(win, t)));
  if (!movedUuids.size) return;
  s.drag = { movedUuids };
}

function findBelowReferenceTab(win, s, movedUuids) {
  const tabs = [...win.gBrowser.tabs];
  const movedIndexes = tabs
    .map((tab, index) => movedUuids.has(ensureTabUuid(win, tab)) ? index : -1)
    .filter(index => index !== -1);
  if (!movedIndexes.length) return null;

  for (let i = Math.max(...movedIndexes) + 1; i < tabs.length; i++) {
    const uuid = ensureTabUuid(win, tabs[i]);
    if (movedUuids.has(uuid)) continue;
    if (isDescendantOfAny(s, uuid, movedUuids)) continue;
    return tabs[i];
  }
  return null;
}

function applyDragHierarchyPolicy(win, s) {
  const movedUuids = s.drag?.movedUuids;
  s.drag = null;
  if (!movedUuids?.size) {
    updateSnapshot();
    return;
  }

  const belowTab = findBelowReferenceTab(win, s, movedUuids);
  const inheritedParentUuid = belowTab
    ? s.parentOf.get(ensureTabUuid(win, belowTab)) || null
    : null;

  for (const rootUuid of movedRootUuids(s, movedUuids)) {
    const rootTab = findTabByUuid(win, rootUuid);
    if (!rootTab) continue;
    if (
      inheritedParentUuid &&
      inheritedParentUuid !== rootUuid &&
      !movedUuids.has(inheritedParentUuid) &&
      !wouldCreateCycle(s, rootUuid, inheritedParentUuid)
    ) {
      recordLink(s, rootUuid, inheritedParentUuid);
      setStoredParentUuid(win, rootTab, inheritedParentUuid);
    } else {
      dropLink(s, rootUuid);
      clearStoredParentUuid(win, rootTab);
    }
    retagSubtree(win, s, rootUuid);
  }

  updateSnapshot();
}

function scheduleDragHierarchyPolicy(win, s) {
  if (!s.drag) return;
  if (s.drag.scheduled) return;
  s.drag.scheduled = true;
  win.setTimeout(() => applyDragHierarchyPolicy(win, s), 0);
}

// ─── Window setup / teardown ────────────────────────────────────────────────

function wouldCreateCycle(s, childUuid, parentUuid) {
  let cursor = parentUuid;
  const seen = new Set();
  while (cursor) {
    if (cursor === childUuid) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = s.parentOf.get(cursor);
  }
  return false;
}

function rebuildFromSession(win, s, snapshotWindow = null) {
  s.parentOf.clear();
  s.childrenOf.clear();
  applySnapshotToWindow(win, snapshotWindow);
  const uuidToTab = new Map();

  for (const tab of win.gBrowser.tabs) {
    let uuid = ensureTabUuid(win, tab);
    if (uuidToTab.has(uuid)) {
      uuid = assignTabUuid(win, tab);
    }
    uuidToTab.set(uuid, tab);
  }

  for (const tab of win.gBrowser.tabs) {
    const tabUuid = ensureTabUuid(win, tab);
    let parentUuid = getStoredParentUuid(win, tab);
    const oldParentId = getCustomTabValue(win, tab, OLD_PARENT_ID_KEY);

    if (!parentUuid && oldParentId) {
      const oldParent = findTabByRuntimeId(win, oldParentId);
      if (oldParent) {
        parentUuid = ensureTabUuid(win, oldParent);
        setStoredParentUuid(win, tab, parentUuid);
      }
      clearOldStoredParentId(win, tab);
    }

    if (!parentUuid) continue;
    if (
      parentUuid === tabUuid ||
      !uuidToTab.has(parentUuid) ||
      wouldCreateCycle(s, tabUuid, parentUuid)
    ) {
      clearStoredParentUuid(win, tab);
      continue;
    }

    recordLink(s, tabUuid, parentUuid);
  }

  retagAll(win, s);
  updateSnapshot();
}

function captureOpenerForCreatedTab(win, s, tab, options) {
  const opener = options?.ownerTab ||
    (options?.relatedToCurrent ? win.gBrowser.selectedTab : null);
  if (tab && opener && opener.isConnected && opener !== tab) {
    s.capturedOpeners.set(tab, opener);
  }
}

function wrapTabCreation(win, s) {
  if (s.originalAddTab || !win.gBrowser?.addTab) return;

  s.originalAddTab = win.gBrowser.addTab;
  win.gBrowser.addTab = function zenCrowdAddTab(...args) {
    const options = args[1] && typeof args[1] === "object" ? args[1] : {};
    const tab = s.originalAddTab.apply(this, args);
    captureOpenerForCreatedTab(win, s, tab, options);
    return tab;
  };

  if (win.gBrowser.addTrustedTab) {
    s.originalAddTrustedTab = win.gBrowser.addTrustedTab;
    win.gBrowser.addTrustedTab = function zenCrowdAddTrustedTab(...args) {
      const options = args[1] && typeof args[1] === "object" ? args[1] : {};
      const tab = s.originalAddTrustedTab.apply(this, args);
      captureOpenerForCreatedTab(win, s, tab, options);
      return tab;
    };
  }
}

function unwrapTabCreation(win, s) {
  if (s.originalAddTab && win.gBrowser?.addTab?.name === "zenCrowdAddTab") {
    win.gBrowser.addTab = s.originalAddTab;
  }
  if (
    s.originalAddTrustedTab &&
    win.gBrowser?.addTrustedTab?.name === "zenCrowdAddTrustedTab"
  ) {
    win.gBrowser.addTrustedTab = s.originalAddTrustedTab;
  }
  s.originalAddTab = null;
  s.originalAddTrustedTab = null;
}

function attachToWindow(win, { rebuild = state.restoreReady } = {}) {
  const config = readConfig();
  if (!config.enabled) {
    return;
  }
  lib.injectStyle(win, STYLE_ID, buildCSS(win, config));
  const s = getWinState(win);
  wrapTabCreation(win, s);
  if (rebuild) {
    rebuildFromSession(win, s);
  }

  const handlers = {
    onTabOpen: (e) => onTabOpen(win, s, e),
    onTabClose: (e) => onTabClose(win, s, e),
    onTabMove: () => onTabMove(win),
    onDragStart: (e) => onDragStart(win, s, e),
    onDrop: () => scheduleDragHierarchyPolicy(win, s),
    onDragEnd: () => scheduleDragHierarchyPolicy(win, s),
  };
  const tc = win.gBrowser.tabContainer;
  tc.addEventListener("TabOpen", handlers.onTabOpen);
  tc.addEventListener("TabClose", handlers.onTabClose);
  tc.addEventListener("TabMove", handlers.onTabMove);
  tc.addEventListener("dragstart", handlers.onDragStart);
  tc.addEventListener("drop", handlers.onDrop);
  tc.addEventListener("dragend", handlers.onDragEnd);
  s.listeners = handlers;

  console.log(`[${STYLE_ID}] attached — ${s.parentOf.size} link(s) restored`);
}

function detachFromWindow(win) {
  lib.removeStyle(win, STYLE_ID);
  const s = state.windows.get(win);
  if (s) {
    const tc = win.gBrowser?.tabContainer;
    if (s.listeners && tc) {
      tc.removeEventListener("TabOpen", s.listeners.onTabOpen);
      tc.removeEventListener("TabClose", s.listeners.onTabClose);
      tc.removeEventListener("TabMove", s.listeners.onTabMove);
      tc.removeEventListener("dragstart", s.listeners.onDragStart);
      tc.removeEventListener("drop", s.listeners.onDrop);
      tc.removeEventListener("dragend", s.listeners.onDragEnd);
    }
    unwrapTabCreation(win, s);
    for (const tab of win.gBrowser?.tabs ?? []) {
      tab.removeAttribute(DEPTH_ATTR);
    }
  }
  state.windows.delete(win);
}

// On a pref change, re-render every open window. Tab linkage state
// is unaffected; only the CSS palette/treatment/opacity may change.
function reapplyAll() {
  const config = readConfig();
  for (const win of lib.enumerateBrowserWindows()) {
    if (!win.gBrowser) continue;
    if (config.enabled) {
      if (state.windows.has(win)) {
        lib.injectStyle(win, STYLE_ID, buildCSS(win, config));
      } else {
        attachToWindow(win);
      }
    } else {
      detachFromWindow(win);
    }
  }
}

// ─── Top-level lifecycle ────────────────────────────────────────────────────

function setup() {
  for (const win of lib.enumerateBrowserWindows()) {
    if (win.gBrowser) attachToWindow(win, { rebuild: false });
  }
  state.removeWindowListener = lib.addWindowOpenListener(attachToWindow);

  // Observe both our own branch and the folder branch, since we
  // inherit defaults from there.
  const observer = () => reapplyAll();
  const removeSubtab = lib.addPrefObserver(SUBTAB_BRANCH, observer);
  const removeFolder = lib.addPrefObserver(FOLDER_BRANCH, observer);
  state.removePrefObserver = () => { removeSubtab(); removeFolder(); };

  console.log(`[${STYLE_ID}] loaded`);
}

async function waitForRestoreReady() {
  const waits = [];
  try { waits.push(SessionStore.promiseAllWindowsRestored); } catch (_) {}
  try { waits.push(SessionStore.promiseInitialized); } catch (_) {}
  for (const win of lib.enumerateBrowserWindows()) {
    if (win.gZenStartup?.promiseInitialized) {
      waits.push(win.gZenStartup.promiseInitialized);
    }
    if (win.gZenWorkspaces?.promiseInitialized) {
      waits.push(win.gZenWorkspaces.promiseInitialized);
    }
  }
  if (waits.length) {
    await Promise.allSettled(waits);
  }
}

async function rebuildAllAfterRestore() {
  await waitForRestoreReady();
  state.restoreReady = true;
  const snapshot = readSnapshot();
  const windows = lib.enumerateBrowserWindows().filter(win => win.gBrowser);
  windows.forEach((win, index) => {
    const config = readConfig();
    if (!config.enabled) return;
    lib.injectStyle(win, STYLE_ID, buildCSS(win, config));
    const s = getWinState(win);
    wrapTabCreation(win, s);
    rebuildFromSession(win, s, snapshot?.windows?.[index] ?? null);
  });
  updateSnapshot();
}

state.destroy = () => {
  state.removePrefObserver?.();
  state.removePrefObserver = null;
  state.removeWindowListener?.();
  state.removeWindowListener = null;
  for (const win of lib.enumerateBrowserWindows()) {
    detachFromWindow(win);
  }
  console.log(`[${STYLE_ID}] destroyed`);
};

setup();
rebuildAllAfterRestore().catch(e => {
  console.warn(`[${STYLE_ID}] restore rebuild failed`, e);
});
})();
