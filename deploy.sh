#!/usr/bin/env bash
set -euo pipefail

ZEN_DIR="$HOME/.zen"
INI="$ZEN_DIR/profiles.ini"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Usage ────────────────────────────────────────────────────────────────────

usage() {
    cat >&2 <<EOF
Usage: $(basename "$0") [OPTIONS] [PROFILE...]

Deploy the zen-crowd-folder-colorization mod to one or more Zen Browser profiles.

With no PROFILE arguments, an interactive picker is shown.

Arguments:
  PROFILE    Profile name(s) to deploy to. Use the exact name shown in the
             picker (case-sensitive). Multiple names are separated by spaces.

Options:
  -h, --help   Show this help message and exit.

Examples:
  $(basename "$0")                     # interactive picker
  $(basename "$0") default             # deploy to profile named "default"
  $(basename "$0") default work        # deploy to both "default" and "work"
EOF
    exit 1
}

PROFILE_ARGS=()
for arg in "$@"; do
    case "$arg" in
        -h|--help) usage ;;
        -*) echo "Unknown option: $arg" >&2; usage ;;
        *) PROFILE_ARGS+=("$arg") ;;
    esac
done

# ─── Detect Zen app directory ─────────────────────────────────────────────────

detect_zen_app_dir() {
    local zen_bin
    zen_bin="$(readlink -f "$(command -v zen-browser 2>/dev/null || true)")"
    if [ -z "$zen_bin" ]; then
        return 1
    fi
    # zen-browser wrapper calls the actual binary; resolve the real app dir
    local app_dir
    app_dir="$(dirname "$zen_bin")"
    # Handle the case where zen-browser is a shell wrapper pointing to zen-bin
    if [ -f "$app_dir/zen-bin" ] || [ -f "$app_dir/zen-browser-bin" ]; then
        echo "$app_dir"
    elif grep -q 'zen-browser-bin' "$zen_bin" 2>/dev/null; then
        echo "/opt/zen-browser-bin"
    else
        echo "$app_dir"
    fi
}

# ─── fx-autoconfig app-level install ─────────────────────────────────────────

install_autoconfig_app_files() {
    local app_dir="$1"
    local config_js="$app_dir/config.js"
    local config_prefs="$app_dir/defaults/pref/config-prefs.js"

    echo ""
    echo "fx-autoconfig app-level files not found in $app_dir."
    echo "The following files will be written (requires sudo):"
    echo "  $config_js"
    echo "  $config_prefs"
    echo ""
    read -rp "Install fx-autoconfig app files now? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Skipped. The mod JS will not execute without these files." >&2
        return 1
    fi

    sudo cp "$SCRIPT_DIR/program/config.js" "$config_js"
    sudo cp "$SCRIPT_DIR/program/defaults/pref/config-prefs.js" "$config_prefs"

    echo "  fx-autoconfig app files installed."
}

# ─── Prerequisites ────────────────────────────────────────────────────────────

if [ ! -f "$INI" ]; then
    echo "Error: $INI not found." >&2
    exit 1
fi

if ! command -v yq &> /dev/null; then
    echo "Error: yq is required but not installed." >&2
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed." >&2
    exit 1
fi

# Check and optionally install fx-autoconfig app-level files
ZEN_APP_DIR="$(detect_zen_app_dir || true)"
if [ -z "$ZEN_APP_DIR" ]; then
    echo "Warning: could not detect Zen Browser app directory. Skipping fx-autoconfig app-level check." >&2
elif [ ! -f "$ZEN_APP_DIR/config.js" ]; then
    install_autoconfig_app_files "$ZEN_APP_DIR" || true
else
    echo "fx-autoconfig app files already present in $ZEN_APP_DIR."
fi

# ─── Profile selection ────────────────────────────────────────────────────────

mapfile -t PROFILE_LINES < <(yq --input-format ini '
  with_entries(select(.key | test("^Profile\\d+$"))) |
  to_entries |
  .[] |
  .value.Name + "|" + .value.Path + "|" + (.value.IsRelative // "1")
' "$INI")

if [ ${#PROFILE_LINES[@]} -eq 0 ]; then
    echo "No profiles found in $INI" >&2
    exit 1
fi

resolve_profile_path() {
    local name="$1" path is_relative
    for line in "${PROFILE_LINES[@]}"; do
        IFS='|' read -r pname path is_relative <<< "$line"
        if [ "$pname" = "$name" ]; then
            if [ "$is_relative" = "1" ]; then
                echo "$ZEN_DIR/$path"
            else
                echo "$path"
            fi
            return 0
        fi
    done
    echo "Profile not found: $name" >&2
    echo "Available profiles:" >&2
    for line in "${PROFILE_LINES[@]}"; do
        IFS='|' read -r pname path _ <<< "$line"
        echo "  $pname ($path)" >&2
    done
    return 1
}

if [ ${#PROFILE_ARGS[@]} -gt 0 ]; then
    SELECTED_PROFILES=("${PROFILE_ARGS[@]}")
else
    echo ""
    echo "Available Zen profiles:"
    i=1
    for line in "${PROFILE_LINES[@]}"; do
        IFS='|' read -r name path rel <<< "$line"
        echo "  $i. $name ($path)"
        i=$((i + 1))
    done
    echo ""
    read -rp "Select profile number: " choice

    if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#PROFILE_LINES[@]}" ]; then
        echo "Invalid selection." >&2
        exit 1
    fi

    IFS='|' read -r selected_name _ _ <<< "${PROFILE_LINES[$((choice - 1))]}"
    SELECTED_PROFILES=("$selected_name")
fi

# ─── Deploy to each selected profile ─────────────────────────────────────────

deploy_to_profile() {
    local name="$1"
    local PROFILE_PATH
    PROFILE_PATH="$(resolve_profile_path "$name")"

    echo ""
    echo "Deploying to profile: $name ($PROFILE_PATH)"

    # Install fx-autoconfig profile-side utils if missing
    local CHROME_DIR="$PROFILE_PATH/chrome"
    if [ ! -f "$CHROME_DIR/utils/chrome.manifest" ]; then
        echo ""
        echo "fx-autoconfig profile-side files not found."
        echo "Downloading from https://github.com/MrOtherGuy/fx-autoconfig ..."
        mkdir -p "$CHROME_DIR"
        curl -fsSL "https://github.com/MrOtherGuy/fx-autoconfig/archive/refs/heads/master.tar.gz" \
            | tar -xz --strip-components=3 -C "$CHROME_DIR" \
                "fx-autoconfig-master/profile/chrome"
        echo "  fx-autoconfig profile-side files installed."
    fi

    local THEMES_DIR="$CHROME_DIR/zen-themes"
    local MOD_DIR="$THEMES_DIR/zen-crowd-folder-colorization"
    local JS_DIR="$CHROME_DIR/JS"

    mkdir -p "$MOD_DIR"
    mkdir -p "$JS_DIR"

    cp "$SCRIPT_DIR/dist/nested-folder-colorization/zen-mod.json" "$MOD_DIR/"
    cp "$SCRIPT_DIR/dist/nested-folder-colorization/preferences.json" "$MOD_DIR/"
    cp "$SCRIPT_DIR/dist/nested-folder-colorization/chrome.css" "$MOD_DIR/"

    # Deploy JS as *.uc.js so fx-autoconfig picks it up; remove old .js if present
    cp "$SCRIPT_DIR/src/nested-folder-colorization.js" "$JS_DIR/nested-folder-colorization.uc.js"
    rm -f "$JS_DIR/nested-folder-colorization.js"

    local ZEN_THEMES_JSON="$PROFILE_PATH/zen-themes.json"
    if [ ! -f "$ZEN_THEMES_JSON" ]; then
        echo '{}' > "$ZEN_THEMES_JSON"
    fi
    jq '. + {"zen-crowd-folder-colorization": {"id": "zen-crowd-folder-colorization", "name": "Nested Folder Colorization", "enabled": true, "version": "1.0.0", "description": "Colorizes nested folders by depth and adds hover-expand behavior.", "preferences": true}}' \
        "$ZEN_THEMES_JSON" > "$ZEN_THEMES_JSON.tmp" && mv "$ZEN_THEMES_JSON.tmp" "$ZEN_THEMES_JSON"

    echo "  Mod metadata    -> $MOD_DIR"
    echo "  JS script       -> $JS_DIR/nested-folder-colorization.uc.js"
    echo "  zen-themes.json -> $ZEN_THEMES_JSON"
}

for profile_name in "${SELECTED_PROFILES[@]}"; do
    deploy_to_profile "$profile_name"
done

echo ""
echo "Deployed successfully to ${#SELECTED_PROFILES[@]} profile(s)."
echo ""
echo "  Restart Zen Browser to apply changes."
echo "  First time? Clear the startup cache first:"
echo "  Open about:support -> 'Clear startup cache', then restart."
