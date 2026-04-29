# Nested Folder Colorization — Packaging and Install

## Status

planned

## Outcome

An fx-autoconfig-compatible distribution of the colorization mod that an
end user with fx-autoconfig already installed can drop into their Zen
profile and use without ever opening the Browser Console. The work item
also lands the install, uninstall, and update story in the repo so the
mod can be released without one-off instructions.

This work item is blocked by `-02`: the source file produced there is
the input to packaging.

## Decision Changes

Distribution path is fixed to fx-autoconfig. Plain userChrome.js paste
remains supported as a development affordance from `-02`, but it is not
the shipping channel. Should fx-autoconfig prove incompatible with a
current Zen release, document the pivot here before changing course.

## Main Quests

- Confirm the fx-autoconfig file layout and naming conventions
  (`*.uc.js`, `chrome/JS/`, `chrome/CSS/`) against a clean Zen profile
  with the current fx-autoconfig release. Record the verified versions.
- Produce a release artifact (zip or tarball) containing the mod in the
  exact layout fx-autoconfig expects, and a short `install.sh` (or
  documented manual copy) that lays the artifact down in a profile's
  `chrome/` directory. Linux and macOS profile paths must both be
  covered.
- Add the build step to the repo as a single reproducible command — npm
  script, Makefile target, or shell script — that takes the source file
  from work item `-02` and emits the release artifact.
- Document install, uninstall, and update in the repo `README.md` (or a
  dedicated `docs/install.md` if length warrants). Update strategy
  should be explicit: manual re-download against a release tag is the
  expected baseline unless a stronger reason emerges.

## Acceptance Criteria

- A user with fx-autoconfig already installed can extract the release
  artifact into their profile `chrome/` directory, restart Zen, and see
  nested folders colorized — with no console interaction.
- Documented uninstall steps fully revert the styling on the next
  browser restart.
- The build command is reproducible from a clean checkout and produces
  a byte-stable artifact for a given source revision.
- Install and uninstall instructions cover Linux and macOS profile
  paths.

## Metadata

### id

nested-folder-colorization-03

### type

Issue
