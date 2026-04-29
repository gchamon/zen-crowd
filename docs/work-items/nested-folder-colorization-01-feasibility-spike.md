# Nested Folder Colorization — Feasibility Spike

## Status

done

## Outcome

We finish this spike with a written, reproducible answer to one question:
can we color Zen Browser's native nested folders by depth using a
userChrome.js-style mod, and if so, what is the smallest stylesheet that
does it cleanly across both light and dark themes?

The deliverable is a short snippet that, pasted into Zen's Browser
Console on a real profile, visibly colorizes a 3-deep folder tree, plus
a brief written record of what worked, what did not, and which palette
and selector strategy implementation should adopt.

### Recorded Outcome

**Approach validated.** A pure stylesheet override of `zen-folder`'s
CSS custom properties via descendant selectors anchored to
`#tabbrowser-tabs` is sufficient. No JS depth-tagging is required. No
shadow DOM or intermediate wrappers exist between parent and child
`zen-folder` elements, so selectors like `zen-folder zen-folder { ... }`
match cleanly. Zen's `light-dark()` declarations continue to resolve
correctly when those variables are overridden with new `light-dark(...)`
values.

**Variant chosen: background tint on `zen-folder` itself.** Rather than
overriding the three icon color variables (`--zen-folder-behind-bgcolor`,
`--zen-folder-front-bgcolor`, `--zen-folder-stroke`), the primary path
applies a `background-color` directly to `zen-folder`. This covers the
entire folder region — the label/icon row and the container holding all
child tabs and nested folders — making depth legible at a glance. The
icon-only approach is preserved as a reference variant.

**Translucency.** The tint uses `color-mix(in srgb, <color> 18–22%, transparent)`
so Zen's native hover and selected states remain visible through the
background.

**Palette.** Six steps cycling at depth 7+, each expressed as a
`light-dark(<lightHex>, <darkHex>)` pair:

| Depth | Light      | Dark       |
| ----- | ---------- | ---------- |
| 1     | `#e74c3c`  | `#ff7a6b`  |
| 2     | `#e67e22`  | `#ffa15c`  |
| 3     | `#27ae60`  | `#5fd38c`  |
| 4     | `#2980b9`  | `#6cb4ff`  |
| 5     | `#8e44ad`  | `#c89cff`  |
| 6     | `#16a085`  | `#5ed6c1`  |

**Pasteable artifacts** under `spikes/`:

- `nested-folder-colorization-poc.js` — primary, background tint per
  depth on `zen-folder`.
- `nested-folder-colorization-poc-icon.js` — icon-only reference,
  overrides the three folder custom properties instead.
- `nested-folder-colorization-reset.js` — removes either injected
  `<style>`, restoring Zen defaults.

## Decision Changes

The epic was originally framed around a "browser extension." Exploration
showed that standard WebExtensions cannot reach Zen's `zen-folder`
custom elements — those live in chrome with system privileges. This
spike commits to the userChrome.js-style approach used by
`zen-sidebery-mod` (privileged JS injected via the user's profile
`chrome/` directory). Sidebery itself is reference-only; we are
restyling Zen's native folder UI, not Sidebery's.

### Hover-Expand Decisions

The spike surfaced a closely related feature: auto-expand a folder on
hover, auto-collapse on leave. The following decisions were recorded
during the spike so they carry forward to work item `-02` without
re-deriving them:

1. **"Opened tab" semantics**: a folder is pinned open if **(a) it
   contains the currently active tab**, OR **(b) it was manually
   expanded by the user before the hover**. Either condition suppresses
   auto-collapse.
2. **Collapse delay**: ~200ms after `mouseleave`, so navigating from a
   parent into a child folder does not flicker the parent shut.
3. **Mechanism**: JS-driven. Toggle Zen's `collapsed` attribute on
   `<zen-folder>` (or call Zen's own collapse API). CSS-only `:hover`
   overrides are insufficient because they do not change Zen's internal
   state.
4. **Scope**: hover-expand is a distinct feature from colorization. It
   is not part of this spike's deliverable. It is folded into work
   item `-02` as an additional quest, with the option to split into
   its own work item if it pulls on its own UX thread during
   implementation.

## Main Quests

- Stand up a minimal userChrome.js entrypoint inside a real Zen profile
  using the manual Browser Console paste flow. Persistent loading via
  fx-autoconfig is deferred to work item `-03`.
- Prototype a single injected `<style>` element that uses nested
  structural selectors (e.g. `zen-folder zen-folder { ... }`) to drive
  per-depth color, and confirm Zen's existing CSS custom properties
  (`--zen-folder-behind-bgcolor`, `--zen-folder-front-bgcolor`,
  `--zen-folder-stroke`) are the right hooks to override. Authoritative
  reference: `zen-browser-desktop/src/zen/folders/zen-folders.css` and
  `zen-browser-desktop/src/zen/folders/ZenFolder.mjs`.
- Verify whether overriding those variables preserves Zen's `light-dark()`
  theme behavior, or whether we must produce two parallel palettes. If
  the latter, document the chosen mitigation.
- Define a depth-to-color palette of at most six steps (cycling beyond
  that), legible against both Zen themes, and explain why those colors
  were chosen.
- Capture before/after screenshots of a 3-deep folder tree for the epic
  record.

## Acceptance Criteria

- A reproducible code snippet lives in this repo (under `/spikes/` or
  inline in this work item) and, when pasted into the Zen Browser
  Console, visibly colorizes nested folders by depth on a freshly
  opened Zen window.
- A short written conclusion records: the chosen selector strategy
  (stylesheet-only is the working hypothesis; the spike confirms or
  refutes it), the chosen palette, and any flicker or theme-switch
  artifacts observed on collapse, expand, and dark/light toggle.
- Documented practical depth limit before colors stop being
  distinguishable.
- Implementation work item `-02` can begin without further investigation
  into whether the approach is viable.

## Metadata

### id

nested-folder-colorization-01

### type

Issue
