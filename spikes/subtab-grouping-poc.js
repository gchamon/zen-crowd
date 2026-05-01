// Subtab Grouping — Feasibility Spike POC
//
// Validates an opener-relationship visualization that does NOT use
// zen-folder. Tabs stay in the regular tabs region; we add two
// behaviors:
//
//   1. Placement. When a tab is opened from a parent, insert it
//      immediately after the parent's existing subtree (DFS rightmost
//      descendant), not at the default Firefox spot. This survives
//      the user navigating away and back — Firefox's default resets
//      placement when the user activates a different tab between
//      opens; we don't.
//
//   2. Depth tinting. Tag each tab with a `zen-crowd-depth` attribute
//      reflecting its position in the opener tree, and paint a
//      depth-cycled translucent background via CSS. Same palette and
//      treatment as the folder colorization mod, applied to <tab>
//      instead of <zen-folder>.
//
// Why not zen-folder? Per the source review (ZenFolder.mjs:14-26,
// :207-218), zen-folder has a fixed header markup and force-pins
// every tab it groups (ZenFolders.mjs:627). Forming a "folder-tab"
// out of it would yank the parent and its children into the pinned
// region, which is unwanted UX. Re-deriving the depth coloring
// directly on tabs is the cheaper path.
//
// USAGE
//   Paste into Zen's Browser Console (Ctrl+Shift+J) and press Enter.
//   Re-pasting is safe; prior listeners and the marker <style> are
//   torn down before re-init.
//
// PREREQUISITES in about:config
//   devtools.chrome.enabled          = true
//   devtools.debugger.remote-enabled = true
//
// SCOPE
//   - Captures opener via `tab.openerTab` at TabOpen. Covers middle-
//     click, target=_blank, context-menu "Open Link in New Tab",
//     and window.open uniformly.
//   - Persists per-tab parent reference with
//     SessionStore.setCustomTabValue under key `zenCrowdParentTabId`,
//     storing the parent's stable tab.id.
//   - On script load, walks gBrowser.tabs, rebuilds the parent map,
//     recomputes depths, and applies the depth attribute.
//   - On TabClose for a parent, children become roots; their subtree
//     depths are recomputed.
//
// OUT OF SCOPE (deferred to -02)
//   - Drag/drop reordering interaction with the placement rule.
//   - Multi-window tab tearing.
//   - Polishing tints against active/hover states beyond "good
//     enough to verify the contract."

(() => {
const GLOBAL_KEY = "__zenCrowdSubtabGrouping";
const STYLE_ID = "zen-crowd-subtab-grouping-poc";
const DEPTH_ATTR = "zen-crowd-depth";
const SESSION_KEY = "zenCrowdParentTabId";

globalThis[GLOBAL_KEY]?.destroy?.();

const state = {
  // Per-window structures so multi-window works without cross-talk.
  windows: new WeakMap(), // win → { parentOf, childrenOf, listeners }
  windowListener: null,
};

globalThis[GLOBAL_KEY] = state;

// ─── Palette (mirrors src/nested-folder-colorization.js defaults) ───────────

const PALETTE = [
  { light: "#e74c3c", dark: "#ff7a6b" },
  { light: "#e67e22", dark: "#ffa15c" },
  { light: "#27ae60", dark: "#5fd38c" },
  { light: "#2980b9", dark: "#6cb4ff" },
  { light: "#8e44ad", dark: "#c89cff" },
  { light: "#16a085", dark: "#5ed6c1" },
];
const TINT_LIGHT_PCT = "18%";
const TINT_DARK_PCT  = "22%";
const BACKGROUND_DEPTH_LIMIT = 24; // depth coverage cap for background tint
const LEFT_LINE_DEPTH_LIMIT = 7;   // depth coverage cap for left-line accent

function buildCSS() {
  const rules = [];
  // Full background tint at every depth, cycling through the palette.
  for (let depth = 1; depth <= BACKGROUND_DEPTH_LIMIT; depth++) {
    const { light, dark } = PALETTE[(depth - 1) % PALETTE.length];
    rules.push(`
      #tabbrowser-tabs tab[${DEPTH_ATTR}="${depth}"] {
        background-color: light-dark(
          color-mix(in srgb, ${light} ${TINT_LIGHT_PCT}, transparent),
          color-mix(in srgb, ${dark}  ${TINT_DARK_PCT},  transparent)
        );
        border-radius: 6px;
      }
    `);
  }
  // Left-line accent up to depth 7. Clears beyond that to avoid
  // visual clutter at deep nesting.
  for (let depth = 1; depth <= LEFT_LINE_DEPTH_LIMIT; depth++) {
    const { light, dark } = PALETTE[(depth - 1) % PALETTE.length];
    rules.push(`
      #tabbrowser-tabs tab[${DEPTH_ATTR}="${depth}"] {
        box-shadow: inset 3px 0 0 0 light-dark(${light}, ${dark});
      }
    `);
  }
  return rules.join("\n");
}

function injectStyle(win) {
  const doc = win.document;
  doc.getElementById(STYLE_ID)?.remove();
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildCSS();
  doc.documentElement.appendChild(style);
}

// ─── Per-window state ───────────────────────────────────────────────────────

function getWinState(win) {
  let s = state.windows.get(win);
  if (!s) {
    s = {
      parentOf: new Map(),    // tabId → parentTabId
      childrenOf: new Map(),  // parentTabId → ordered array of childTabIds
      listeners: null,
    };
    state.windows.set(win, s);
  }
  return s;
}

function recordLink(s, child, parent) {
  const cid = child.id;
  const pid = parent.id;
  if (!cid || !pid) return;
  s.parentOf.set(cid, pid);
  let kids = s.childrenOf.get(pid);
  if (!kids) {
    kids = [];
    s.childrenOf.set(pid, kids);
  }
  if (!kids.includes(cid)) kids.push(cid);
}

function dropLink(s, child) {
  const cid = child.id;
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

function getStoredParentId(win, tab) {
  try {
    return win.SessionStore.getCustomTabValue(tab, SESSION_KEY) || null;
  } catch (_) { return null; }
}

function setStoredParentId(win, tab, parentId) {
  try {
    win.SessionStore.setCustomTabValue(tab, SESSION_KEY, parentId);
  } catch (e) {
    console.warn("[zen-crowd-subtab-grouping] setCustomTabValue failed", e);
  }
}

function clearStoredParentId(win, tab) {
  try { win.SessionStore.deleteCustomTabValue(tab, SESSION_KEY); } catch (_) {}
}

// ─── Depth + DOM tagging ────────────────────────────────────────────────────

function findTabById(win, tabId) {
  if (!tabId) return null;
  for (const tab of win.gBrowser.tabs) {
    if (tab.id === tabId) return tab;
  }
  return null;
}

function depthOf(s, tabId) {
  let depth = 0;
  let cursor = tabId;
  const seen = new Set();
  while (cursor && s.parentOf.has(cursor)) {
    if (seen.has(cursor)) break; // defensive against accidental cycles
    seen.add(cursor);
    cursor = s.parentOf.get(cursor);
    depth++;
  }
  return depth;
}

function applyDepthAttr(tab, depth) {
  if (depth <= 0) {
    tab.removeAttribute(DEPTH_ATTR);
  } else {
    tab.setAttribute(DEPTH_ATTR, String(depth));
  }
}

function retagSubtree(win, s, rootId) {
  const root = findTabById(win, rootId);
  if (!root) return;
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    const tab = findTabById(win, id);
    if (!tab) continue;
    applyDepthAttr(tab, depthOf(s, id));
    const kids = s.childrenOf.get(id);
    if (kids) stack.push(...kids);
  }
}

function retagAll(win, s) {
  for (const tab of win.gBrowser.tabs) {
    applyDepthAttr(tab, depthOf(s, tab.id));
  }
}

// ─── Placement ──────────────────────────────────────────────────────────────

// Returns the rightmost (DFS-last) descendant tab id of `rootId` —
// "insert new child after this." If `rootId` has no descendants,
// returns rootId.
function rightmostDescendantId(s, rootId) {
  let cursor = rootId;
  while (true) {
    const kids = s.childrenOf.get(cursor);
    if (!kids || !kids.length) return cursor;
    cursor = kids[kids.length - 1];
  }
}

function placeAfter(win, child, anchorTab) {
  try {
    win.gBrowser.moveTabTo(child, { tabIndex: anchorTab._tPos + 1 });
  } catch (e) {
    console.warn("[zen-crowd-subtab-grouping] moveTabTo failed", e);
  }
}

// ─── Event handlers ─────────────────────────────────────────────────────────

function onTabOpen(win, s, event) {
  const tab = event.target;
  // Defer one tick so Zen's own TabOpen handlers (workspace
  // assignment, opener wiring) settle before we move/tag the tab.
  win.setTimeout(() => {
    if (!tab.isConnected) return;
    const opener = tab.openerTab;
    if (!opener || !opener.isConnected || opener === tab) return;
    if (!tab.id || !opener.id) return;

    recordLink(s, tab, opener);
    setStoredParentId(win, tab, opener.id);

    const anchorId = rightmostDescendantId(s, opener.id);
    if (anchorId !== tab.id) {
      const anchorTab = findTabById(win, anchorId);
      if (anchorTab) placeAfter(win, tab, anchorTab);
    }

    applyDepthAttr(tab, depthOf(s, tab.id));
  }, 0);
}

function onTabClose(win, s, event) {
  const tab = event.target;
  if (!tab.id) return;

  const orphans = s.childrenOf.get(tab.id);
  if (orphans) {
    const orphanIds = [...orphans];
    for (const oid of orphanIds) {
      const orphanTab = findTabById(win, oid);
      if (!orphanTab) continue;
      dropLink(s, orphanTab);
      clearStoredParentId(win, orphanTab);
    }
    for (const oid of orphanIds) {
      retagSubtree(win, s, oid);
    }
  }

  dropLink(s, tab);
  clearStoredParentId(win, tab);
}

// ─── Window setup ───────────────────────────────────────────────────────────

function rebuildFromSession(win, s) {
  // First pass: read each tab's stored parent id into the maps.
  for (const tab of win.gBrowser.tabs) {
    const parentId = getStoredParentId(win, tab);
    if (!parentId || !tab.id) continue;
    s.parentOf.set(tab.id, parentId);
    let kids = s.childrenOf.get(parentId);
    if (!kids) {
      kids = [];
      s.childrenOf.set(parentId, kids);
    }
    kids.push(tab.id);
  }
  // Second pass: drop links whose parent tab is gone.
  for (const [cid, pid] of [...s.parentOf]) {
    if (!findTabById(win, pid)) {
      const childTab = findTabById(win, cid);
      if (childTab) {
        s.parentOf.delete(cid);
        clearStoredParentId(win, childTab);
      }
      const kids = s.childrenOf.get(pid);
      if (kids) {
        const i = kids.indexOf(cid);
        if (i !== -1) kids.splice(i, 1);
        if (!kids.length) s.childrenOf.delete(pid);
      }
    }
  }
  retagAll(win, s);
}

function attachToWindow(win) {
  injectStyle(win);
  const s = getWinState(win);
  rebuildFromSession(win, s);

  const handlers = {
    onTabOpen: (event) => onTabOpen(win, s, event),
    onTabClose: (event) => onTabClose(win, s, event),
  };
  const tabContainer = win.gBrowser.tabContainer;
  tabContainer.addEventListener("TabOpen", handlers.onTabOpen);
  tabContainer.addEventListener("TabClose", handlers.onTabClose);
  s.listeners = handlers;

  console.log(`[${STYLE_ID}] attached to window — ${s.parentOf.size} link(s) restored`);
}

function detachFromWindow(win) {
  const doc = win.document;
  doc.getElementById(STYLE_ID)?.remove();
  const s = state.windows.get(win);
  if (s) {
    const tc = win.gBrowser?.tabContainer;
    if (s.listeners && tc) {
      tc.removeEventListener("TabOpen", s.listeners.onTabOpen);
      tc.removeEventListener("TabClose", s.listeners.onTabClose);
    }
    for (const tab of win.gBrowser?.tabs ?? []) {
      tab.removeAttribute(DEPTH_ATTR);
    }
  }
  state.windows.delete(win);
}

// ─── Top-level lifecycle ────────────────────────────────────────────────────

function setup() {
  const enumerator = Services.wm.getEnumerator("navigator:browser");
  while (enumerator.hasMoreElements()) {
    const win = enumerator.getNext();
    if (win.gBrowser) attachToWindow(win);
  }

  state.windowListener = {
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
          attachToWindow(win);
        }
      });
    },
    onCloseWindow() {},
    onWindowTitleChange() {},
  };
  Services.wm.addListener(state.windowListener);

  console.log(`[${STYLE_ID}] loaded`);
}

state.destroy = () => {
  if (state.windowListener) {
    Services.wm.removeListener(state.windowListener);
    state.windowListener = null;
  }
  const enumerator = Services.wm.getEnumerator("navigator:browser");
  while (enumerator.hasMoreElements()) {
    const win = enumerator.getNext();
    detachFromWindow(win);
  }
  console.log(`[${STYLE_ID}] destroyed`);
};

setup();
})();
