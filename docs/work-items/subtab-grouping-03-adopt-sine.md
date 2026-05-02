# Subtab Grouping — Adopt Sine

## Status

backlog

## Outcome

The zen-crowd mods can be installed and updated through
[Sine](https://github.com/CosmoCreeper/Sine), while preserving the
current fx-autoconfig deployment path for local development and users
who prefer direct profile installation.

Sine describes itself as a community-driven mod/theme manager for
Firefox-based browsers. It supports userChrome, userContent, the Zen
mod format, mod preferences, marketplace installation, unpublished
repository testing, and repository-driven updates. This work item
adopts Sine only after verifying how its bootloader and package format
interact with zen-crowd's chrome-scope scripts.

## Decision Changes

- **Adoption path: additive first.** Sine support is added alongside
  `deploy.sh` / `remove.sh`; the existing scripts are not removed in
  this work item.
- **Distribution target: both mods.** Nested Folder Colorization and
  Subtab Grouping should remain installable together because they
  share palette defaults and the shared helper modules.
- **Risk to resolve before implementation:** zen-crowd currently
  depends on `chrome://userchromejs/content/` imports and
  fx-autoconfig loading. Sine compatibility must be verified against
  that module-loading path before publishing metadata.

## Main Quests

- Read Sine's current documentation and package examples. Record the
  exact metadata files, directory layout, and preference format needed
  for a Zen-compatible mod package.
- Determine whether Sine can load zen-crowd's existing `.uc.js`
  chrome-scope scripts and `chrome/utils/*.sys.mjs` shared modules
  without fx-autoconfig, or whether the repository needs a Sine-specific
  bundle shape.
- Add the minimum Sine metadata/package files required for local
  repository installation through Sine's unpublished-mod flow.
- Keep `deploy.sh` and `remove.sh` working unchanged unless Sine
  adoption proves the shared package layout should be reused by both
  installers.
- Update the README with Sine installation instructions, current
  manual installation instructions, and a short note explaining when
  to use each path.
- Document any remaining marketplace publishing steps separately from
  local compatibility work.

## Acceptance Criteria

- A clean checkout has the metadata/layout Sine needs to recognize
  zen-crowd as a valid installable mod repository.
- Installing through Sine enables both zen-crowd mods and their
  preferences in Zen Browser.
- Subtab grouping still imports shared modules successfully when
  installed through Sine.
- `npm run ci` still passes.
- `bash deploy.sh` and `bash remove.sh` remain valid for manual
  fx-autoconfig profile deployment.
- README documents Sine and manual installation paths without implying
  the Sine marketplace listing is complete before it actually is.

## Metadata

### id

subtab-grouping-03

### type

Issue
