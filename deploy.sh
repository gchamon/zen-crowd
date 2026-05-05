#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
VERSION="$(<"$SCRIPT_DIR/version.txt")"

# ─── Usage ────────────────────────────────────────────────────────────────────

usage() {
    cat >&2 <<EOF
Usage: $(basename "$0") [OPTIONS] [PROFILE...]

Deploy the zen-crowd mods (folder colorization + subtab grouping) to one or more Zen Browser profiles.

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

parse_profile_args usage "$@"

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

check_profile_prereqs

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

load_profile_lines
select_profiles

# ─── Deploy to each selected profile ─────────────────────────────────────────

is_sine_profile() {
    local chrome_dir="$1"
    [ -f "$chrome_dir/JS/sine.sys.mjs" ] || [ -f "$chrome_dir/sine-mods/mods.json" ]
}

remove_native_zen_entries() {
    local profile_path="$1"
    local chrome_dir="$2"
    local themes_dir="$chrome_dir/zen-themes"
    local zen_themes_json="$profile_path/zen-themes.json"

    rm -rf \
        "$themes_dir/zen-crowd" \
        "$themes_dir/zen-crowd-folder-colorization" \
        "$themes_dir/zen-crowd-subtab-grouping"

    if [ -f "$zen_themes_json" ]; then
        jq 'del(
              ."zen-crowd",
              ."zen-crowd-folder-colorization",
              ."zen-crowd-subtab-grouping"
            )' \
            "$zen_themes_json" > "$zen_themes_json.tmp" && mv "$zen_themes_json.tmp" "$zen_themes_json"
    fi
}

copy_sine_package() {
    local target_dir="$1"
    rm -rf "$target_dir"
    mkdir -p "$target_dir"
    cp "$SCRIPT_DIR/theme.json" "$target_dir/"
    cp "$SCRIPT_DIR/package.json" "$target_dir/"
    cp -R "$SCRIPT_DIR/sine" "$target_dir/"
    cp -R "$SCRIPT_DIR/src" "$target_dir/"
}

deploy_sine_mod() {
    local profile_path="$1"
    local chrome_dir="$2"
    local sine_mods_dir="$chrome_dir/sine-mods"
    local target_dir="$sine_mods_dir/zen-crowd"
    local mods_json="$sine_mods_dir/mods.json"

    mkdir -p "$sine_mods_dir"
    if [ ! -f "$mods_json" ]; then
        echo '{}' > "$mods_json"
    fi

    remove_native_zen_entries "$profile_path" "$chrome_dir"
    copy_sine_package "$target_dir"

    jq --slurpfile mod "$target_dir/theme.json" \
        '. + { "zen-crowd": ($mod[0] + { enabled: true, "no-updates": false }) }' \
        "$mods_json" > "$mods_json.tmp" && mv "$mods_json.tmp" "$mods_json"

    echo "  Sine package    -> $target_dir"
    echo "  Sine mods.json  -> $mods_json"
    echo "  Note            -> unpublished Sine JS requires sine.allow-unsafe-js = true"
}

deploy_native_zen_mod() {
    local profile_path="$1"
    local chrome_dir="$2"
    local themes_dir="$chrome_dir/zen-themes"
    local mod_dir="$themes_dir/zen-crowd"
    local legacy_folder_mod_dir="$themes_dir/zen-crowd-folder-colorization"
    local legacy_subtab_mod_dir="$themes_dir/zen-crowd-subtab-grouping"
    local zen_themes_json="$profile_path/zen-themes.json"

    mkdir -p "$mod_dir"
    rm -rf "$legacy_folder_mod_dir" "$legacy_subtab_mod_dir"

    cp "$SCRIPT_DIR/dist/zen-crowd/zen-mod.json" "$mod_dir/"
    cp "$SCRIPT_DIR/dist/zen-crowd/preferences.json" "$mod_dir/"
    cp "$SCRIPT_DIR/dist/zen-crowd/chrome.css" "$mod_dir/"

    if [ ! -f "$zen_themes_json" ]; then
        echo '{}' > "$zen_themes_json"
    fi
    jq --arg version "$VERSION" 'del(
            ."zen-crowd-folder-colorization",
            ."zen-crowd-subtab-grouping"
        ) + {
            "zen-crowd": {
                "id": "zen-crowd",
                "name": "zen-crowd",
                "enabled": true,
                "version": $version,
                "description": "Adds nested folder colorization, hover-expand folders, and subtab grouping for Zen Browser.",
                "preferences": true
            }
        }' \
        "$zen_themes_json" > "$zen_themes_json.tmp" && mv "$zen_themes_json.tmp" "$zen_themes_json"

    echo "  Zen mod         -> $mod_dir"
    echo "  zen-themes.json -> $zen_themes_json"
}

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
    local JS_DIR="$CHROME_DIR/JS"
    local UTILS_DIR="$CHROME_DIR/utils"

    mkdir -p "$THEMES_DIR" "$JS_DIR" "$UTILS_DIR"

    # Shared library — both runtime scripts import it via
    # chrome://userchromejs/content/zen-crowd-shared.sys.mjs
    cp "$SCRIPT_DIR/src/lib/zen-crowd-shared.sys.mjs" "$UTILS_DIR/zen-crowd-shared.sys.mjs"
    cp "$SCRIPT_DIR/src/lib/zen-crowd-subtab-policy.sys.mjs" "$UTILS_DIR/zen-crowd-subtab-policy.sys.mjs"

    # Runtime scripts remain separate because fx-autoconfig loads each .uc.js file.
    cp "$SCRIPT_DIR/src/nested-folder-colorization.js" "$JS_DIR/nested-folder-colorization.uc.js"
    rm -f "$JS_DIR/nested-folder-colorization.js"
    cp "$SCRIPT_DIR/src/subtab-grouping.js" "$JS_DIR/subtab-grouping.uc.js"

    if is_sine_profile "$CHROME_DIR"; then
        deploy_sine_mod "$PROFILE_PATH" "$CHROME_DIR"
    else
        deploy_native_zen_mod "$PROFILE_PATH" "$CHROME_DIR"
    fi

    echo "  Shared libs     -> $UTILS_DIR/zen-crowd-shared.sys.mjs, $UTILS_DIR/zen-crowd-subtab-policy.sys.mjs"
    echo "  Runtime scripts -> $JS_DIR/nested-folder-colorization.uc.js, $JS_DIR/subtab-grouping.uc.js"
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
