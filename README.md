# zen-crowd

A mod for [Zen Browser](https://zen-browser.app/) that improves the visual hierarchy and interaction of nested folders in the tab sidebar.

<img src="docs/assets/crows-in-early-winter.png" alt="Detail from Crows in Early Winter by Kishi Chikudo">
<sub>Detail after Kishi Chikudo (Japanese, 1826-1897), <em>Crows in Early Winter</em>, ca. 1895. Ink and color on gold-leaf ground; pair of six-panel folding screens. Santa Barbara Museum of Art, museum purchase with funds provided by Lord and Lady Ridley-Tree, Priscilla Giesen, and special funds, 2002.7.1-2. Source identification: Santa Barbara Museum of Art, <a href="https://www.sbma.net/exhibitions/pathsofgold"><em>Paths of Gold: Japanese Landscape and Narrative Paintings from the Collection.</em></a> The image was enhanced using Gemini. The original image can be found <a href="https://i.pinimg.com/736x/43/44/f9/4344f9321754eca845b19470682ffd58.jpg">here</a>.</sub>

## About the logo

These are crows. Crows are [zen birds](https://www.lionsroar.com/buddhas-birds/). This project also deals with *crow*ded folders, with many nested folders and items. I think the reference is nice :)

## What it does

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

## Project structure

```
├── src/
│   └── nested-folder-colorization.js   # Development source (Browser Console paste or fx-autoconfig)
├── dist/
│   └── nested-folder-colorization/     # Zen mod package (zen-themes/ + JS/)
│       ├── zen-mod.json                # Mod metadata
│       ├── preferences.json            # Settings UI manifest
│       └── chrome.css                  # Placeholder (all styling is JS-injected)
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

When installed as a Zen mod, settings are surfaced in **Settings → Zen Mods → Configure**:

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

Changes apply immediately across all open windows without restart.

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
4. Copy mod metadata → `chrome/zen-themes/zen-crowd-folder-colorization/`
5. Copy the script → `chrome/JS/nested-folder-colorization.uc.js`
6. Register the mod in `zen-themes.json`

**First install only:** clear the startup cache before restarting — open `about:support` → **Clear startup cache**, then restart Zen.

### Verify

Open the Browser Console (Ctrl+Shift+J) and look for:
```
[zen-crowd-folder-colorization] loaded — colorSource: palette, hoverExpand: true
```

### Update

Re-run `bash deploy.sh` and restart Zen.

### Uninstall

1. Delete `chrome/JS/nested-folder-colorization.uc.js` from your profile
2. Delete `chrome/zen-themes/zen-crowd-folder-colorization/` from your profile
3. Remove the `zen-crowd-folder-colorization` entry from `zen-themes.json`
4. Restart Zen

**Profile paths:**
- Linux: `~/.zen/<profile-dir>/`
- macOS: `~/Library/Application Support/zen/<profile-dir>/`

## Development

### Prerequisites for Browser Console paste
- `devtools.chrome.enabled` → `true`
- `devtools.debugger.remote-enabled` → `true`

### Ephemeral loading

Paste `src/nested-folder-colorization.js` into the Browser Console (Ctrl+Shift+J) and press Enter. Re-pasting replaces the previous injection cleanly — no restart needed.

## Roadmap

- [x] Nested folder colorization by depth
- [x] Hover-expand / hover-collapse behavior
- [x] Zen native mod settings UI integration
- [ ] Subtabs open in subfolders (when opening a tab from another tab, place it in a subfolder; clicking the folder header opens the original tab)

## License

See individual subdirectories. The mod source (`src/` and `dist/`) is released under the same license as the project root. The README artwork is included for attribution and presentation only; no artwork license is granted by this repository.
