# Subtabs in Subfolders — Feasibility Spike

## Status

cancelled — superseded by the `subtab-grouping` epic.

The folder-tab framing this spike pursued was abandoned: forming a
folder via `gZenFolders.createFolder` pins all involved tabs and
relocates them to the pinned region, which is the wrong UX. The
replacement direction (opener-aware placement + per-depth tinting on
plain `<tab>` elements, no `zen-folder` involvement) lives under
`docs/epics/subtab-grouping.md`. The recorded findings below remain
useful as background — particularly the source-level reason
composition was rejected — but the construction strategy itself is no
longer in scope for any work item.

## Outcome

We finish this spike with a written, reproducible answer to one
question: can a single sidebar element in Zen Browser carry both
`zen-tab` and `zen-folder` semantics — clickable as a tab (activates an
associated page) and expandable as a folder (contains child tabs) —
without fighting Zen's internal state machine, and if so, what is the
cheapest construction that does it?

### Recorded Outcome (provisional, pending profile verification)

**Composition rejected; hybrid-by-association adopted.** Reading
`zen-browser-desktop/src/zen/folders/ZenFolder.mjs:14–26` shows the
folder header is hardcoded `static markup` — a fixed `<hbox>` of
`{folder-icon, label, reset-button}` — with no slot for an external
`<tab>`. `connectedCallback` (lines 69–92) builds it once. Folders
are also force-pinned (`pinned` getter/setter at lines 207–218).
A `<tab>` placed in `.tab-group-label-container` would be reparented
or visually broken on the next render or session cycle.

We therefore use **hybrid-by-association**: the parent stays a normal
`<tab>` where `gBrowser` expects it; an adjacent `<zen-folder>` is
created via `gZenFolders.createFolder([opener], { label, insertAfter:
opener })` (`ZenFolders.mjs:623`); the two are bound by the folder's
id, persisted on the parent tab via
`SessionStore.setCustomTabValue(tab, "zenCrowdFolderTabId", folderId)`.
The mapping is rebuilt on script load by walking
`gBrowser.tabs` and reading the stored value.

**Click contract.** Untouched on both sides:

- Parent-tab row click → tab activation (Zen's normal handler).
- Folder header click → expand/collapse (Zen's normal handler at
  `ZenFolder.mjs:275–287` delegating to `MozTabbrowserTabGroup`).

Because the parent tab and the folder header are spatially distinct
sidebar rows, the two interactions cannot race or double-fire.

**Tab-open event used.** `TabOpen` on `gBrowser.tabContainer`
(matches Zen's own usage at `ZenFolders.mjs:227`, handler at line
398). `event.target` is the new tab; opener is read via the standard
Firefox `tab.openerTab` getter, which covers middle-click,
`target=_blank`, context-menu "Open Link in New Tab", and
`window.open` uniformly. We defer routing one tick (`setTimeout(_,
0)`) so Zen's own `TabOpen` handlers (workspace assignment, etc.)
settle before we move the tab into the folder.

**Programmatic placement of children.** `folder.addTabs([childTab])`
(`ZenFolder.mjs:289`, inherited from `MozTabbrowserTabGroup`).

**Parent-close lifecycle.** Children are promoted out of the folder
via `gBrowser.ungroupTab(child)`, then the now-empty folder is
removed. Hooked off the `TabClose` event on the parent.

**Persistence.** Folder identity is already persisted by Zen via
`storeDataForSessionStore` / `restoreDataFromSessionStore`
(`ZenFolders.mjs:1141–1209`). We persist only the
parent→folder *binding* with `SessionStore.setCustomTabValue` per
opener tab. On restore, the folder is reconstructed by Zen and our
mapping is rebuilt from the stored values.

**Pasteable artifact:** `spikes/subtabs-in-subfolders-poc.js`.
Idempotent on re-paste; tears down listeners, marker class, and the
injected `<style>` before re-init.

### Known constraint surfaced by the spike

`gZenFolders.createFolder` pins all tabs it groups
(`ZenFolders.mjs:627` calls `gBrowser.pinTab(tab)`), and folders live
in the pinned region. Forming a folder-tab therefore pins the parent
and its children. `-02` decides whether to surface this to the user,
work around it, or pivot to a different grouping primitive.

### Open items for on-profile verification

The PoC has not yet been run on a real Zen profile. The following
must be confirmed before flipping `## Status` to `done`:

- All four open mechanisms route to the folder (middle-click,
  `target=_blank`, context-menu, `window.open`).
- Click on the parent-tab row activates without toggling the folder;
  click on the folder header toggles without activating any tab.
- Session restore rebuilds folder membership without manual action.
- Closing the parent leaves children intact and reachable.
- No flicker, double-activation, or state-desync. Any artifacts
  observed are recorded here even if not fixed in the spike.

The deliverable is a short snippet that, pasted into Zen's Browser
Console on a real profile, produces a working **folder-tab**: a
sidebar row whose header click activates a parent tab and whose
disclosure affordance toggles expand/collapse over a set of child
tabs. The spike also records the chosen construction strategy and the
lifecycle rules that implementation must honor.

The two construction strategies to evaluate, cheapest-first:

1. **Composition** — keep the parent as a normal `zen-tab` and wrap it
   plus its children in a synthetic `zen-folder`-like container, with
   the parent rendered as the folder header. The folder is a presentation
   shell; the tab underneath is what Zen actually tracks.
2. **Hybrid element** — make the parent element simultaneously a
   `zen-tab` and a `zen-folder`, either by mutating Zen's own element
   or by introducing a custom element that implements both contracts.

Prefer (1) if it works. Fall back to (2) only if Zen's sidebar
machinery rejects a tab living inside a folder header.

## Decision Changes

- **Construction strategy: hybrid-by-association** (not composition,
  not a custom hybrid element). Reasoning: Zen's `nsZenFolder.markup`
  is static and folders are force-pinned, so a `<tab>` cannot live in
  the folder header. Keeping the tab as a sibling and binding it to
  an adjacent `<zen-folder>` by id is the cheapest construction that
  preserves both Zen's tab-activation path and its folder
  expand/collapse path untouched.
- **Tab-open event: `TabOpen`** on `gBrowser.tabContainer`, opener
  resolved via the standard `tab.openerTab` getter. Single event
  covers all four open mechanisms.
- **Click contract: spatially separated.** Parent-tab row → activate
  (Zen default). Folder header → expand/collapse (Zen default). No
  custom click routing required.
- **Parent-close child lifecycle: non-destructive promotion.**
  Children are moved out of the folder with `gBrowser.ungroupTab` and
  the empty folder is removed. Children persist as regular tabs.
- **Parent↔folder mapping persistence: `SessionStore.setCustomTabValue`**
  on the opener tab under key `zenCrowdFolderTabId`. Folder identity
  itself is already persisted by Zen's own session-restore code; we
  only store the binding.
- **Acknowledged constraint:** `gZenFolders.createFolder` pins all
  tabs it groups. Forming a folder-tab pins the parent and its
  children. Decision on whether/how to surface this is deferred to
  `-02`.

Open questions the spike must close before `-02` can begin:

- Can a `zen-tab` be a direct child of (or visually presented as) a
  `zen-folder` header without Zen reparenting, hiding, or duplicating
  it on the next sidebar refresh?
- Does Zen expose an API or attribute for "this folder is associated
  with tab X" that we can ride, or must we maintain the parent↔folder
  mapping ourselves?
- What event fires on header click in the chosen construction, and
  can we route it to tab activation while still letting a separate
  affordance toggle expand/collapse?
- How does session restore serialize folder membership, and can our
  parent↔folder mapping piggyback on existing session storage or must
  we persist it ourselves (e.g. via a tab attribute or
  `SessionStore.setTabValue`)?
- What happens to children when the parent tab is closed — does Zen
  collapse the folder, orphan the children, or destroy them? What
  rule do we want, and how do we enforce it?

## Main Quests

- Stand up the spike in a real Zen profile using the manual Browser
  Console paste flow established by the colorization spike. Persistent
  loading is out of scope here.
- Identify the relevant Zen source surfaces. Authoritative references:
  `zen-browser-desktop/src/zen/folders/ZenFolder.mjs`,
  `zen-browser-desktop/src/zen/folders/zen-folders.css`, and whatever
  module owns `zen-tab` element creation and tab-open events
  (`tabbrowser`/`gZenWorkspaces`/`gZenViewSplitter` are reasonable
  starting points). Record exact file paths and line ranges in the
  written conclusion.
- Hook the right tab-open event to capture parent → child relationships
  for: middle-click, `target=_blank`, context-menu "open in new tab",
  and `window.open`. Confirm the opener is reachable from the event
  payload (e.g. via `openerTab`, `relatedTarget`, or
  `gBrowser.selectedTab` at the moment of the open).
- Prototype **strategy 1 (composition)** first: when a child tab is
  opened from a parent, programmatically place the parent and child
  inside a `zen-folder`, with the parent positioned as the folder's
  header row. Confirm or refute that Zen tolerates this layout across
  expand, collapse, drag, session restore, and tab close.
- If composition is rejected by Zen's machinery, prototype **strategy 2
  (hybrid element)**: either extend Zen's existing folder element to
  carry an associated tab id, or introduce a custom element that
  implements both contracts. Record the minimum surface area required.
- For the chosen strategy, validate the click contract: header-click →
  activate parent tab; disclosure affordance (chevron, gutter, or a
  defined modifier-click) → toggle expand/collapse. The two
  interactions must not conflict.
- Capture before/after screenshots and a short screen recording of:
  opening 3 children from one parent, clicking the folder-tab header,
  expanding/collapsing, closing the parent, and a session restore.

## Acceptance Criteria

- A reproducible snippet under `/spikes/` (matching the naming pattern
  established by the colorization spike) produces a working folder-tab
  on a freshly opened Zen window when pasted into the Browser Console.
- The written conclusion records, at minimum: the chosen construction
  strategy (composition vs. hybrid) with reasoning, the tab-open event
  used to capture parent/child relationships, the click contract for
  header vs. disclosure, the rule for child lifecycle when the parent
  closes, and the persistence mechanism for parent↔folder mapping
  across session restore.
- Any flicker, double-activation, or state-desync artifacts observed
  during expand/collapse, drag, or session restore are documented —
  even if not yet fixed — so `-02` inherits the full picture.
- Implementation work item `-02` can begin without further
  investigation into whether the approach is viable.

## Metadata

### id

subtabs-in-subfolders-01

### type

Issue
