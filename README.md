# zen-crowd

A mod for [Zen Browser](https://zen-browser.app/) that improves the visual hierarchy and interaction of nested folders in the tab sidebar.

## What it does

### Nested Folder Colorization
Applies a translucent background tint to `zen-folder` elements based on their nesting depth, making it easy to visually trace the folder hierarchy at a glance.

- **Depth-aware** — each nesting level gets a distinct color from a six-step palette that cycles at depth 7+
- **Theme-aware** — colors adapt to both light and dark themes via `light-dark()`
- **Two color sources**:
  - **Fixed palette** (default) — warm, distinct hues per depth level
  - **Theme accent** — derives the palette from Zen's current accent color (`--zen-primary-color`) with hue rotation

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
└── deploy.sh                           # WIP development helper
```

## Configuration

When installed as a Zen mod, settings are surfaced in **Settings → Zen Mods → Configure**:

| Setting | Type | Default |
|---|---|---|
| Color source | dropdown | Fixed palette |
| Hover-expand folders | checkbox | true |
| Hover collapse delay | string (ms) | 200 |
| Tint opacity — light theme | string (0–100) | 18 |
| Tint opacity — dark theme | string (0–100) | 22 |
| Folder border radius | string (px) | 6 |

Changes apply immediately across all open windows without restart.

## Development

### Prerequisites for Browser Console paste
- `devtools.chrome.enabled` → `true`
- `devtools.debugger.remote-enabled` → `true`

### Loading the mod

**Ephemeral (development):**
Paste `src/nested-folder-colorization.js` into the Browser Console (Ctrl+Shift+J) and press Enter. Re-pasting replaces the previous injection cleanly.

**Persistent:**
Drop `src/nested-folder-colorization.js` into your profile's `chrome/JS/` directory (requires [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig)).

### Local deployment (WIP)

A helper script copies the mod into a selected Zen Browser profile. It requires [**yq**](https://github.com/mikefarah/yq) (the Go implementation by Mike Farah) to parse `profiles.ini`.

```bash
# Install yq first, e.g.:
#   sudo pacman -S yq        # Arch
#   brew install yq          # macOS
#   wget … / snap …          # Linux

./deploy.sh
```

The script will:
1. List profiles from `~/.zen/profiles.ini`
2. Copy `dist/nested-folder-colorization/*` → `chrome/zen-themes/zen-crowd-folder-colorization/`
3. Copy `src/nested-folder-colorization.js` → `chrome/JS/`
4. Register the mod in `chrome/zen-themes.json`

> ⚠️ `deploy.sh` is a work-in-progress convenience tool. Manual installation via the Zen mod system or fx-autoconfig is the supported path until packaging stabilizes.

## Roadmap

- [x] Nested folder colorization by depth
- [x] Hover-expand / hover-collapse behavior
- [x] Zen native mod settings UI integration
- [ ] Subtabs open in subfolders (when opening a tab from another tab, place it in a subfolder; clicking the folder header opens the original tab)

## License

See individual subdirectories. The mod source (`src/` and `dist/`) is released under the same license as the project root.
