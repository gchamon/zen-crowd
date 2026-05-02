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
const policy = ChromeUtils.importESModule(
  "chrome://userchromejs/content/zen-crowd-subtab-policy.sys.mjs"
);

const GLOBAL_KEY = "__zenCrowdSubtabGrouping";
const STYLE_ID = "zen-crowd-subtab-grouping";
const DEPTH_ATTR = "zen-crowd-depth";
const TAB_UUID_KEY = "zenCrowdTabUuid";
const PARENT_UUID_KEY = "zenCrowdParentTabUuid";
const OLD_PARENT_ID_KEY = "zenCrowdParentTabId";
const SNAPSHOT_PREF = "zen.crowd.subtab.restoreSnapshot";
const MENU_SEPARATOR_ID = "zen-crowd-subtab-menu-separator";
const MENU_CONVERT_ID = "zen-crowd-convert-tab-to-folder";
const MENU_SUBTABS_ID = "zen-crowd-create-folder-for-subtabs";
const MENU_CLOSE_TREE_ID = "zen-crowd-close-tab-and-subtabs";
const MENU_FOLDER_TO_TABS_ID = "zen-crowd-convert-folder-to-tabs";

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
      menu: null,
      folderMenu: null,
      originalAddTab: null,
      originalAddTrustedTab: null,
      drag: null,
      contextFolder: null,
    };
    state.windows.set(win, s);
  }
  return s;
}

function recordLink(s, childUuid, parentUuid) {
  policy.recordLink(s.parentOf, s.childrenOf, childUuid, parentUuid);
}

function dropLink(s, childUuid) {
  policy.dropLink(s.parentOf, s.childrenOf, childUuid);
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
  return policy.snapshotMatchesTabs(snapshotWindow, [...win.gBrowser.tabs], {
    isPinned: tab => Boolean(tab.pinned),
    getWorkspace: tabWorkspace,
    getUrl: tabUrl,
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
  return policy.depthOf(s.parentOf, tabUuid);
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

function sortTabsByPosition(tabs) {
  return policy.sortByPosition(tabs, tab => tab._tPos);
}

function descendantTabs(win, s, tab) {
  const rootUuid = getCustomTabValue(win, tab, TAB_UUID_KEY);
  if (!rootUuid) return [];
  return policy.folderTargetItems(
    "subtabs-only",
    [...win.gBrowser.tabs],
    s.childrenOf,
    tab,
    {
      getId: candidate => getCustomTabValue(win, candidate, TAB_UUID_KEY),
      getPosition: candidate => candidate._tPos,
    }
  );
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

function applyDragHierarchyPolicy(win, s) {
  const movedUuids = s.drag?.movedUuids;
  s.drag = null;
  if (!movedUuids?.size) {
    updateSnapshot();
    return;
  }

  const orderedUuids = [...win.gBrowser.tabs].map(tab => ensureTabUuid(win, tab));
  const parentUpdates = policy.dragParentUpdates(s.parentOf, orderedUuids, movedUuids);
  for (const { id: rootUuid, parentId } of parentUpdates) {
    const rootTab = findTabByUuid(win, rootUuid);
    if (!rootTab) continue;
    if (parentId) {
      recordLink(s, rootUuid, parentId);
      setStoredParentUuid(win, rootTab, parentId);
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

// ─── Tab context menu actions ───────────────────────────────────────────────

function contextTab(win) {
  return win.TabContextMenu?.contextTab || null;
}

function tabLabel(tab) {
  return tab.getAttribute("label") ||
    tab.label ||
    tab.linkedBrowser?.currentURI?.displaySpec ||
    "Subtabs";
}

function canUseZenFolders(win) {
  return typeof win.gZenFolders?.createFolder === "function";
}

function isEssentialTab(tab) {
  return tab?.hasAttribute?.("zen-essential");
}

function normalTabs(tabs) {
  return tabs.filter(tab => tab?.isConnected && !isEssentialTab(tab));
}

function createZenFolder(win, tabs, label) {
  const folderTabs = sortTabsByPosition(normalTabs(tabs));
  if (!folderTabs.length || !canUseZenFolders(win)) return null;
  try {
    return win.gZenFolders.createFolder(folderTabs, {
      label,
      renameFolder: false,
    });
  } catch (e) {
    console.warn(`[${STYLE_ID}] folder creation failed`, e);
    return null;
  }
}

function createNestedZenFolder(win, tabs, label, insertAfter = null) {
  const folderTabs = sortTabsByPosition(normalTabs(tabs));
  if (!folderTabs.length || !canUseZenFolders(win)) return null;
  const options = { label, renameFolder: false };
  if (insertAfter) options.insertAfter = insertAfter;
  try {
    return win.gZenFolders.createFolder(folderTabs, options);
  } catch (e) {
    console.warn(`[${STYLE_ID}] nested folder creation failed`, e);
    return null;
  }
}

function tabCopyPlan(win, tabs) {
  return policy.copyPlanForTargets(normalTabs(tabs), {
    getId: tab => getCustomTabValue(win, tab, TAB_UUID_KEY) || tab.id || "",
    getUrl: tabUrl,
    getTitle: tabLabel,
    getPosition: tab => tab._tPos,
  }).filter(copy => copy.url && copy.url !== "about:blank");
}

function createFlatTabCopies(win, tabs, insertAfter = null, { beforeAnchor = false } = {}) {
  const copies = [];
  const principal = Services.scriptSecurityManager.getSystemPrincipal();
  const copyPlan = beforeAnchor ? tabCopyPlan(win, tabs).reverse() : tabCopyPlan(win, tabs);
  let index = Number.isInteger(insertAfter?._tPos)
    ? insertAfter._tPos + (beforeAnchor ? 0 : 1)
    : undefined;

  for (const copy of copyPlan) {
    const options = {
      triggeringPrincipal: principal,
      relatedToCurrent: false,
      skipAnimation: true,
    };
    if (Number.isInteger(index)) {
      options.index = index;
      if (!beforeAnchor) index++;
    }
    const duplicate = win.gBrowser.addTab(copy.url, options);
    if (beforeAnchor) copies.unshift(duplicate);
    else copies.push(duplicate);
  }
  return copies;
}

function copyOneTab(win, tab, insertAfter = null) {
  return createFlatTabCopies(win, [tab], insertAfter)[0] || null;
}

function copyTabsBeforeAnchor(win, tabs, anchor) {
  return createFlatTabCopies(win, tabs, anchor, { beforeAnchor: true });
}

function directChildTabs(win, s, tab) {
  const rootUuid = getCustomTabValue(win, tab, TAB_UUID_KEY);
  if (!rootUuid) return [];
  return policy.directChildItems([...win.gBrowser.tabs], s.childrenOf, rootUuid, {
    getId: candidate => getCustomTabValue(win, candidate, TAB_UUID_KEY),
    getPosition: candidate => candidate._tPos,
  });
}

function createNestedSubfolderForChildren(win, s, originalParent, copiedParent) {
  const children = directChildTabs(win, s, originalParent);
  if (!children.length || !copiedParent) return null;

  const copiedChildren = [];
  const childPairs = [];
  const copiedDirectChildren = copyTabsBeforeAnchor(win, children, copiedParent);
  for (let i = 0; i < children.length; i++) {
    const copiedChild = copiedDirectChildren[i];
    if (!copiedChild) continue;
    copiedChildren.push(copiedChild);
    childPairs.push({ original: children[i], copy: copiedChild });
  }

  const folder = createNestedZenFolder(
    win,
    copiedChildren,
    tabLabel(originalParent),
    copiedParent
  );
  for (const pair of childPairs) {
    createNestedSubfolderForChildren(win, s, pair.original, pair.copy);
  }
  return folder;
}

function createHierarchicalFolderFromRoot(win, s, rootTab, includeRoot) {
  if (includeRoot) {
    const rootCopy = copyOneTab(win, rootTab, rootTab);
    const rootFolder = createZenFolder(win, [rootCopy], tabLabel(rootTab));
    createNestedSubfolderForChildren(win, s, rootTab, rootCopy);
    return rootFolder;
  }

  const children = directChildTabs(win, s, rootTab);
  const childCopies = [];
  const childPairs = [];
  const copiedDirectChildren = copyTabsBeforeAnchor(win, children, rootTab);
  for (let i = 0; i < children.length; i++) {
    const copiedChild = copiedDirectChildren[i];
    if (!copiedChild) continue;
    childCopies.push(copiedChild);
    childPairs.push({ original: children[i], copy: copiedChild });
  }
  const rootFolder = createZenFolder(win, childCopies, tabLabel(rootTab));
  for (const pair of childPairs) {
    createNestedSubfolderForChildren(win, s, pair.original, pair.copy);
  }
  return rootFolder;
}

function convertTabToFolder(win, s, tab) {
  createHierarchicalFolderFromRoot(win, s, tab, true);
  updateSnapshot();
}

function createFolderForSubtabs(win, s, tab) {
  createHierarchicalFolderFromRoot(win, s, tab, false);
  updateSnapshot();
}

function removeTabs(win, tabs) {
  const removableTabs = sortTabsByPosition(normalTabs(tabs));
  if (!removableTabs.length) return;
  if (typeof win.gBrowser.removeTabs === "function") {
    win.gBrowser.removeTabs(removableTabs);
    return;
  }
  for (const tab of removableTabs.reverse()) {
    win.gBrowser.removeTab(tab);
  }
}

function closeTabAndSubtabs(win, s, tab) {
  const tabs = policy.folderTargetItems(
    "root-and-subtabs",
    [...win.gBrowser.tabs],
    s.childrenOf,
    tab,
    {
      getId: candidate => getCustomTabValue(win, candidate, TAB_UUID_KEY),
      getPosition: candidate => candidate._tPos,
    }
  );
  removeTabs(win, tabs);
}

function tabsInFolder(folder) {
  const directTabs = [
    ...(folder?.querySelectorAll?.(":scope > .tab-group-container > tab") || []),
  ];
  if (directTabs.length) return directTabs;
  const tabs = folder?.tabs ? [...folder.tabs] : [];
  if (tabs.length) return tabs;
  return [];
}

function childFoldersInFolder(folder) {
  return [...(folder?.querySelectorAll?.(":scope > .tab-group-container > zen-folder") || [])];
}

function folderChildrenInOrder(folder) {
  const container = folder?.querySelector?.(":scope > .tab-group-container");
  if (!container) return tabsInFolder(folder);
  return [...container.children].filter(child => {
    const tag = child.tagName?.toLowerCase?.();
    return tag === "tab" || tag === "zen-folder";
  });
}

function copyFolderHierarchyToTabs(win, s, folder, parentCopy = null) {
  const entries = [];
  let folderParent = parentCopy;

  for (const child of folderChildrenInOrder(folder)) {
    const tag = child.tagName?.toLowerCase?.();
    if (tag === "tab") {
      const entry = { tab: child, parentEntry: parentCopy ? folderParent : null };
      entries.push(entry);
      folderParent = entry;
    } else if (tag === "zen-folder") {
      entries.push(...folderCopyEntries(child, folderParent || parentCopy));
    }
  }

  if (!entries.length && parentCopy) {
    for (const childFolder of childFoldersInFolder(folder)) {
      entries.push(...folderCopyEntries(childFolder, parentCopy));
    }
  }

  return createFolderEntryCopies(win, s, entries, parentCopy);
}

function folderCopyEntries(folder, parentEntry = null) {
  const entries = [];
  let folderParent = parentEntry;
  for (const child of folderChildrenInOrder(folder)) {
    const tag = child.tagName?.toLowerCase?.();
    if (tag === "tab") {
      const entry = { tab: child, parentEntry };
      entries.push(entry);
      folderParent = entry;
    } else if (tag === "zen-folder") {
      entries.push(...folderCopyEntries(child, folderParent || parentEntry));
    }
  }
  if (!entries.length && parentEntry) {
    for (const childFolder of childFoldersInFolder(folder)) {
      entries.push(...folderCopyEntries(childFolder, parentEntry));
    }
  }
  return entries;
}

function createFolderEntryCopies(win, s, entries, anchor = null) {
  const copiedByEntry = new Map();
  const copiedTabs = [];
  let insertAfter = anchor;
  for (const entry of [...entries].reverse()) {
    const copiedTab = copyOneTab(win, entry.tab, insertAfter);
    if (!copiedTab) continue;
    copiedByEntry.set(entry, copiedTab);
    copiedTabs.unshift(copiedTab);
    insertAfter = copiedTab;
  }

  for (const entry of entries) {
    const copiedTab = copiedByEntry.get(entry);
    const copiedParent = copiedByEntry.get(entry.parentEntry) ||
      (entry.parentEntry?.isConnected ? entry.parentEntry : null);
    if (!copiedTab || !copiedParent) continue;
    const childUuid = ensureTabUuid(win, copiedTab);
    const parentUuid = ensureTabUuid(win, copiedParent);
    recordLink(s, childUuid, parentUuid);
    setStoredParentUuid(win, copiedTab, parentUuid);
    applyDepthAttr(copiedTab, depthOf(s, childUuid));
  }

  return copiedTabs;
}

function convertFolderToTabs(win, s, folder) {
  copyFolderHierarchyToTabs(win, s, folder);
  retagAll(win, s);
  updateSnapshot();
}

function findTabContextMenu(win) {
  return win.document.getElementById("tabContextMenu") ||
    win.gBrowser?.tabContainer?.contextMenu ||
    null;
}

function closestFolderSurface(node) {
  if (!node?.closest) return null;
  if (node.closest("tab")) return null;
  return node.closest("zen-folder");
}

function eventFolder(win, event) {
  return closestFolderSurface(event?.target?.triggerNode) ||
    closestFolderSurface(event?.explicitOriginalTarget) ||
    closestFolderSurface(win.document.popupNode);
}

function onTabContainerContextMenu(win, s, event) {
  s.contextFolder = closestFolderSurface(event.target);
}

function setMenuItemState(win, s) {
  const tab = contextTab(win);
  const hasTab = Boolean(tab?.isConnected);
  const folder = s.contextFolder?.isConnected
    ? s.contextFolder
    : eventFolder(win, null);
  const canUseTab = !folder && hasTab && !isEssentialTab(tab);
  const subtabs = hasTab ? normalTabs(descendantTabs(win, s, tab)) : [];
  const canFolder = canUseTab && canUseZenFolders(win);
  const folderTabs = normalTabs(tabsInFolder(folder));

  s.menu.convert.hidden = Boolean(folder);
  s.menu.subtabs.hidden = Boolean(folder);
  s.menu.closeTree.hidden = Boolean(folder);
  s.menu.convert.disabled = !canFolder;
  s.menu.subtabs.disabled = !canFolder || !subtabs.length;
  s.menu.closeTree.disabled = !canUseTab;
  s.menu.folderToTabs.hidden = !folder;
  s.menu.folderToTabs.disabled = !folder || !folderTabs.length;
}

function menuItem(doc, id, label, handler) {
  const item = doc.createXULElement("menuitem");
  item.id = id;
  item.setAttribute("label", label);
  item.addEventListener("command", handler);
  return item;
}

function attachFolderContextMenu(win, s) {
  if (s.folderMenu) return;
  const doc = win.document;
  const itemId = `${MENU_FOLDER_TO_TABS_ID}-folder-menu`;
  const separatorId = `${MENU_FOLDER_TO_TABS_ID}-folder-menu-separator`;
  const removeInjected = () => {
    doc.getElementById(itemId)?.remove();
    doc.getElementById(separatorId)?.remove();
  };
  const onPopupShowing = (event) => {
    const popup = event.target;
    const folder = s.contextFolder?.isConnected ? s.contextFolder : null;
    if (!folder || popup.nodeName !== "menupopup") return;
    const folderTabs = normalTabs(tabsInFolder(folder));
    removeInjected();

    const separator = doc.createXULElement("menuseparator");
    separator.id = separatorId;
    const convert = menuItem(
      doc,
      itemId,
      "Convert folder to tabs",
      () => {
        if (folder.isConnected) convertFolderToTabs(win, s, folder);
      }
    );
    convert.disabled = !folderTabs.length;
    popup.insertBefore(separator, popup.firstElementChild);
    popup.insertBefore(convert, popup.firstElementChild);
  };
  doc.addEventListener("popupshowing", onPopupShowing, true);
  s.folderMenu = { onPopupShowing, removeInjected };
}

function detachFolderContextMenu(s) {
  if (!s.folderMenu) return;
  s.folderMenu.removeInjected();
  s.folderMenu = null;
}

function detachFolderContextMenuFromWindow(win, s) {
  if (!s.folderMenu) return;
  win.document.removeEventListener("popupshowing", s.folderMenu.onPopupShowing, true);
  detachFolderContextMenu(s);
  s.folderMenu = null;
}

function attachContextMenu(win, s) {
  if (s.menu) return;
  const menu = findTabContextMenu(win);
  if (!menu) return;

  const doc = win.document;
  doc.getElementById(MENU_SEPARATOR_ID)?.remove();
  doc.getElementById(MENU_CONVERT_ID)?.remove();
  doc.getElementById(MENU_SUBTABS_ID)?.remove();
  doc.getElementById(MENU_CLOSE_TREE_ID)?.remove();
  doc.getElementById(MENU_FOLDER_TO_TABS_ID)?.remove();

  const separator = doc.createXULElement("menuseparator");
  separator.id = MENU_SEPARATOR_ID;

  const handlers = {
    onPopupShowing: (event) => {
      s.contextFolder = eventFolder(win, event) || s.contextFolder;
      setMenuItemState(win, s);
    },
    onConvert: () => {
      const tab = contextTab(win);
      if (tab?.isConnected) convertTabToFolder(win, s, tab);
    },
    onSubtabs: () => {
      const tab = contextTab(win);
      if (tab?.isConnected) createFolderForSubtabs(win, s, tab);
    },
    onCloseTree: () => {
      const tab = contextTab(win);
      if (tab?.isConnected) closeTabAndSubtabs(win, s, tab);
    },
    onFolderToTabs: () => {
      const folder = s.contextFolder;
      if (folder?.isConnected) convertFolderToTabs(win, s, folder);
    },
  };

  const convert = menuItem(
    doc, MENU_CONVERT_ID, "Convert tab to folder", handlers.onConvert
  );
  const subtabs = menuItem(
    doc, MENU_SUBTABS_ID, "Create folder for subtabs", handlers.onSubtabs
  );
  const closeTree = menuItem(
    doc, MENU_CLOSE_TREE_ID, "Close tab and subtabs", handlers.onCloseTree
  );
  const folderToTabs = menuItem(
    doc, MENU_FOLDER_TO_TABS_ID, "Convert folder to tabs", handlers.onFolderToTabs
  );

  const anchor = doc.getElementById("context_zenMoveToFolder") ||
    doc.getElementById("context_closeTab") ||
    menu.firstElementChild;
  menu.insertBefore(separator, anchor);
  menu.insertBefore(convert, anchor);
  menu.insertBefore(subtabs, anchor);
  menu.insertBefore(closeTree, anchor);
  menu.insertBefore(folderToTabs, anchor);
  menu.addEventListener("popupshowing", handlers.onPopupShowing);

  s.menu = {
    menu,
    separator,
    convert,
    subtabs,
    closeTree,
    folderToTabs,
    handlers,
  };
}

function detachContextMenu(s) {
  if (!s.menu) return;
  s.menu.menu.removeEventListener("popupshowing", s.menu.handlers.onPopupShowing);
  s.menu.separator.remove();
  s.menu.convert.remove();
  s.menu.subtabs.remove();
  s.menu.closeTree.remove();
  s.menu.folderToTabs.remove();
  s.menu = null;
}

// ─── Window setup / teardown ────────────────────────────────────────────────

function wouldCreateCycle(s, childUuid, parentUuid) {
  return policy.wouldCreateCycle(s.parentOf, childUuid, parentUuid);
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
  attachContextMenu(win, s);
  attachFolderContextMenu(win, s);
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
    onContextMenu: (e) => onTabContainerContextMenu(win, s, e),
  };
  const tc = win.gBrowser.tabContainer;
  tc.addEventListener("TabOpen", handlers.onTabOpen);
  tc.addEventListener("TabClose", handlers.onTabClose);
  tc.addEventListener("TabMove", handlers.onTabMove);
  tc.addEventListener("dragstart", handlers.onDragStart);
  tc.addEventListener("drop", handlers.onDrop);
  tc.addEventListener("dragend", handlers.onDragEnd);
  tc.addEventListener("contextmenu", handlers.onContextMenu);
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
      tc.removeEventListener("contextmenu", s.listeners.onContextMenu);
    }
    unwrapTabCreation(win, s);
    detachContextMenu(s);
    detachFolderContextMenuFromWindow(win, s);
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
