# zen-crowd

Internet browsing requires [great peace of mind](https://zenceomaintenance.wordpress.com/2018/03/13/assembly-of-japanese-bicycle-take-great-peace-of-mind/).

A mod for [Zen Browser](https://zen-browser.app/) that improves the visual hierarchy and interaction of nested folders and tabs in the tab sidebar.

<img src="docs/assets/crows-in-early-winter.png" alt="Detail from Crows in Early Winter by Kishi Chikudo">

<sub>Detail after Kishi Chikudo (Japanese, 1826-1897), <em>Crows in Early Winter</em>, ca. 1895. Ink and color on gold-leaf ground; pair of six-panel folding screens. Santa Barbara Museum of Art, museum purchase with funds provided by Lord and Lady Ridley-Tree, Priscilla Giesen, and special funds, 2002.7.1-2. Source identification: Santa Barbara Museum of Art, <a href="https://www.sbma.net/exhibitions/pathsofgold"><em>Paths of Gold: Japanese Landscape and Narrative Paintings from the Collection.</em></a> The image was enhanced using Gemini. The original image can be found <a href="https://i.pinimg.com/736x/43/44/f9/4344f9321754eca845b19470682ffd58.jpg">here</a>.</sub>


## About the logo

These are crows. Crows are [zen birds](https://www.lionsroar.com/buddhas-birds/). This project also deals with *crow*ded folders, with many nested folders and items. I think the reference is nice :)

## What it does

A screenshot sometimes is worth a thousand feature descriptions:

<img src="docs/assets/screenshot.png" alt="Zen Browser sidebar showing zen-crowd folder and subtab coloring">

### Nested Folder Colorization
Applies color to `zen-folder` elements based on their nesting depth, making it easy to visually trace the folder hierarchy at a glance.

- **Depth-aware** — background colors cycle through a six-step palette; left-side lines stop after depth 7
- **Theme-aware** — colors adapt to both light and dark themes via `light-dark()`
- **Configurable treatment** — use a translucent background fill or a left-side line
- **Optional root styling** — leave top-level folders uncolored and start colors at subfolders
- **Two color sources**:
  - **Theme accent** (default) — derives the palette from Zen's current accent color (`--zen-primary-color`) with hue rotation
  - **Fixed palette** — warm, distinct hues per depth level

### Hover-Expand
Hovering a collapsed folder automatically expands it; moving the mouse away collapses it after a short delay.

- Folders containing the active tab stay open
- Folders manually expanded by the user before hovering stay open
- Moving the cursor from a parent into a child folder does not flicker the parent shut

### Subtab Grouping
Tints each tab by its depth in the opener tree, so the parent/child relationship is visible at a glance.

- A tab opened from a parent (middle-click, `target=_blank`, "Open Link in New Tab", `window.open`) gets `parent.depth + 1`
- Survives session restore via per-tab UUIDs, with a tab-order snapshot fallback
- Dragging a tab makes it inherit the hierarchy level of the tab immediately below it
- Closing a parent promotes its children to roots; their subtree retags at the new shallower depths
- Visual prefs default to inheriting from the folder colorization mod's settings, so the two mods look consistent out of the box

## Project structure

```
├── src/
│   ├── lib/
│   │   └── zen-crowd-shared.sys.mjs    # Shared helpers (palette, prefs, windows)
│   ├── nested-folder-colorization.js   # Folder colorization mod source
│   └── subtab-grouping.js              # Subtab grouping mod source
├── dist/
│   ├── nested-folder-colorization/     # Zen mod package
│   │   ├── zen-mod.json                # Mod metadata
│   │   ├── preferences.json            # Settings UI manifest
│   │   └── chrome.css                  # Placeholder (all styling is JS-injected)
│   └── subtab-grouping/                # Zen mod package (same shape)
├── spikes/                             # Feasibility proof-of-concepts from early exploration
├── docs/
│   ├── work-items/                     # Executable planning units
│   ├── epics/                          # Larger feature streams
│   └── architecture/                   # Decisions and methodology
├── zen-browser-desktop/                # Reference checkout (excluded from distribution)
├── zen-sidebery-mod/                   # Reference checkout (excluded from distribution)
└── deploy.sh                           # Install/deploy helper
```

## Configuration

When installed as a Zen mod, settings are surfaced in **Settings → Zen Mods → Configure**.

### Nested Folder Colorization

| Setting | Type | Default |
|---|---|---|
| Color source | dropdown | Theme accent |
| Color top-level folders | checkbox | true |
| Color treatment | dropdown | Background fill |
| Hover-expand folders | checkbox | true |
| Hover collapse delay | string (ms) | 500 |
| Tint opacity — light theme | string (0–100) | 18 |
| Tint opacity — dark theme | string (0–100) | 22 |
| Folder border radius | string (px) | 6 |

### Subtab Grouping

All visual prefs default to **blank**, meaning "inherit from the folder colorization mod's setting." Override any of them to break the link.

| Setting | Type | Default |
|---|---|---|
| Enable subtab grouping | checkbox | true |
| Color source | dropdown | (inherit) |
| Custom base color | string | (inherit) |
| Custom colors | string | (inherit) |
| Color treatment | dropdown | (inherit) |
| Tint opacity — light theme | string (0–100) | (inherit) |
| Tint opacity — dark theme | string (0–100) | (inherit) |
| Border radius | string (px) | (inherit) |

Changes to either mod apply immediately across all open windows without restart.

## Installation

### Prerequisites

1. **fx-autoconfig** — required for the mod JS to execute. `deploy.sh` installs both the application-level files (with `sudo`) and the profile-side boot files automatically on first run.

2. **yq** and **jq** — required by `deploy.sh`:
   ```bash
   sudo pacman -S yq jq     # Arch
   brew install yq jq       # macOS
   ```

### Install

```bash
bash deploy.sh
```

The script will:
1. Check for and optionally install fx-autoconfig application-level files (requires `sudo`)
2. List profiles from `~/.zen/profiles.ini` (Linux) or `~/Library/Application Support/zen/profiles.ini` (macOS)
3. Verify the selected profile has fx-autoconfig profile-side files
4. Copy the shared library → `chrome/utils/zen-crowd-shared.sys.mjs`
5. Copy mod metadata for both mods → `chrome/zen-themes/zen-crowd-folder-colorization/` and `chrome/zen-themes/zen-crowd-subtab-grouping/`
6. Copy both scripts → `chrome/JS/nested-folder-colorization.uc.js` and `chrome/JS/subtab-grouping.uc.js`
7. Register both mods in `zen-themes.json`

**First install only:** clear the startup cache before restarting — open `about:support` → **Clear startup cache**, then restart Zen.

### Verify

Open the Browser Console (Ctrl+Shift+J) and look for:
```
[zen-crowd-folder-colorization] loaded — colorSource: palette, hoverExpand: true
[zen-crowd-subtab-grouping] loaded
```

### Update

Re-run `bash deploy.sh` and restart Zen.

### Uninstall

```bash
bash remove.sh
```

The script removes both zen-crowd mods from the selected profile, deletes their copied scripts and shared library, and removes their entries from `zen-themes.json`. It leaves fx-autoconfig in place because other userChrome scripts may use it.

**Profile paths:**
- Linux: `~/.zen/<profile-dir>/`
- macOS: `~/Library/Application Support/zen/<profile-dir>/`

## Development

### Prerequisites for Browser Console paste
- `devtools.chrome.enabled` → `true`
- `devtools.debugger.remote-enabled` → `true`

### Ephemeral loading

Paste `src/nested-folder-colorization.js` or `src/subtab-grouping.js` into the Browser Console (Ctrl+Shift+J) and press Enter. Re-pasting replaces the previous injection cleanly — no restart needed.

Note: both source files import `chrome://userchromejs/content/zen-crowd-shared.sys.mjs`, so paste-loading requires the shared module to already be installed in `chrome/utils/` (i.e. you've already run `deploy.sh` once on the profile).

## Roadmap

- [x] Nested folder colorization by depth
- [x] Hover-expand / hover-collapse behavior
- [x] Zen native mod settings UI integration
- [x] Subtab grouping by opener depth

## License

See individual subdirectories. The mod source (`src/` and `dist/`) is released under the same license as the project root. The README artwork is included for attribution and presentation only; no artwork license is granted by this repository.
