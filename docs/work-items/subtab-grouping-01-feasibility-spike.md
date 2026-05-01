# Subtab Grouping — Feasibility Spike

## Status

done

## Outcome

We finish this spike with a written, reproducible answer to one
question: can we group opener-related tabs in Zen Browser's sidebar
by combining (a) opener-aware placement and (b) per-depth tinting on
plain `<tab>` elements — without using `zen-folder` — and have the
grouping survive session restore? If yes, what is the smallest
construction that does it?

The deliverable is a short snippet that, pasted into Zen's Browser
Console on a real profile, produces visibly grouped subtabs: a tab
opened from a parent slots in immediately after the parent's existing
subtree and is tinted by its opener depth, with the tint and
placement reconstructing on session restore.

### Recorded Outcome

PoC at `spikes/subtab-grouping-poc.js` ran cleanly on a real Zen
profile. Opener resolution via `tab.openerTab` at `TabOpen` worked
across all four open mechanisms (middle-click, `target=_blank`,
context-menu "Open Link in New Tab", `window.open`). Depth tinting
applied immediately on each open and reconstructed correctly on
session restore via `SessionStore.getCustomTabValue`. Closing a
parent tab promoted children and retagged subtrees as expected.

**Placement feature dropped.** The PoC originally moved each new
child to `parent's rightmost descendant + 1` via
`gBrowser.moveTabTo`. On profile, Firefox / Zen's default placement
was already acceptable, so the custom placement rule offered no
visible UX gain while adding a class of bugs (drag races, multi-
window edge cases). The implementation will not include the
placement code. The mod becomes purely a depth-tinting layer driven
by opener relationships.

**Left-line accent cycles indefinitely.** The folder colorization
mod caps the left-line treatment at depth 7 because nested folder
visuals stack and the lines compete. Subtab depth tinting is on
flat tab rows, so the cap is unnecessary; the left-line accent will
cycle the palette at every depth.

**Stress-testing deferred to implementation.** The PoC was not
stress-tested (drag/drop interactions, rapid open/close cycles,
multi-window tab tearing). `-02` and follow-ups will surface any
such issues.

## Decision Changes

- **Tab-open event**: `TabOpen` on `gBrowser.tabContainer`. Opener
  resolved via the standard `tab.openerTab` getter. Routing deferred
  one tick (`setTimeout(_, 0)`) so Zen's own `TabOpen` handlers
  settle first.
- **Placement rule**: dropped. Firefox / Zen's default placement is
  acceptable; custom placement removed from the implementation.
- **Depth tagging**: `zen-crowd-depth` attribute on each `<tab>`,
  driven by an in-memory `parentOf` map. Depth recomputed on parent
  close so promoted subtrees retag.
- **Coloring**: full background tint at every depth (cycling 6-color
  palette, `light-dark()` translucent), plus a left-line accent
  cycling the palette indefinitely. Same palette as the
  colorization mod for visual consistency.
- **Persistence**: `SessionStore.setCustomTabValue(child,
  "zenCrowdParentTabId", parent.id)`. On script load, walk
  `gBrowser.tabs`, rebuild the maps, drop dangling links, retag.

Open questions the spike must close before `-02` can begin:

- Does `tab.openerTab` reliably resolve at `TabOpen` time for all
  four open mechanisms (middle-click, `target=_blank`, context-menu
  "Open Link in New Tab", `window.open`)? If not, what fallback?
- Does `gBrowser.moveTabTo` land the new tab at the intended index
  without flicker, or does Zen reposition it on a follow-up event?
- Does Zen's session-restore preserve `tab.id` such that our stored
  parent ids still resolve after restart, or do we need a
  longer-lived identifier?
- Are there contexts where the deferred `setTimeout(_, 0)` arrives
  after the user has activated the new tab, causing a visible jump?
  If so, can we move at a different point (synchronous, or in
  `gBrowser`'s own opener-handling path)?
- Does the depth tint render correctly under a tab's
  `[selected]`, `[multiselected]`, and `[pending]` states, and under
  the colorization mod when the tab sits inside a `zen-folder`?

## Main Quests

- Stand up the spike on a real Zen profile via the manual Browser
  Console paste flow established by the colorization spike.
  Persistent loading is `-02` territory.
- Identify the relevant Zen source surfaces. Authoritative
  references already read for the cancelled folder-tab spike (still
  applicable here): `tab.openerTab` resolution and the `TabOpen`
  event flow on `gBrowser.tabContainer`. Confirm `gBrowser.moveTabTo`
  is the right placement primitive (and not a Zen wrapper that adds
  side effects).
- Verify opener capture for: middle-click, `target=_blank`,
  context-menu "Open Link in New Tab", `window.open`. Record any
  mechanism where `tab.openerTab` is null at `TabOpen` time and
  document the workaround.
- Validate the placement rule against a representative tree: open
  tab B from A, switch to an unrelated tab, return to A, open tab
  C from A. C should land immediately after B (parent's rightmost
  descendant), not at the tab strip end.
- Validate depth tinting renders legibly across at least 4 depths
  in both light and dark themes, against `[selected]` and
  `[multiselected]` states, and on top of a `zen-folder`'s tint when
  the colorization mod is also active.
- Validate session restore: with several subtabs open, close and
  reopen the window. Placement order must already be correct
  (Zen handles tab order); depth tinting must reconstruct from the
  stored parent ids.
- Validate parent-close lifecycle: closing a parent promotes
  children to roots and retags their subtrees at the new shallower
  depths.
- Capture before/after screenshots and a short screen recording.

## Acceptance Criteria

- A reproducible snippet under `/spikes/` (matching the naming
  pattern from prior spikes) produces opener-aware placement and
  depth tinting on a freshly opened Zen window when pasted into the
  Browser Console.
- The written conclusion records, at minimum: the tab-open event
  used, the opener-resolution mechanism (and any fallback), the
  placement primitive used, the depth-tagging mechanism, the
  persistence key and shape, the parent-close lifecycle rule, and
  any conflicts observed when running alongside the colorization
  mod.
- Any flicker, double-placement, or state-desync artifacts observed
  during open, close, drag, or session restore are documented —
  even if not yet fixed — so `-02` inherits the full picture.
- Implementation work item `-02` can begin without further
  investigation into whether the approach is viable.

## Pasteable artifact

`spikes/subtab-grouping-poc.js`. Idempotent on re-paste; tears down
listeners and the injected `<style>`, strips the depth attribute
from all tabs, and rebuilds in-memory state from `SessionStore`
custom values on next load.

## Metadata

### id

subtab-grouping-01

### type

Issue
