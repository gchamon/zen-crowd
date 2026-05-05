#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ─── Usage ────────────────────────────────────────────────────────────────────

usage() {
    cat >&2 <<EOF
Usage: $(basename "$0") [OPTIONS] [PROFILE...]

Remove the zen-crowd mods from one or more Zen Browser profiles.

With no PROFILE arguments, an interactive picker is shown.

Arguments:
  PROFILE    Profile name(s) to remove from. Use the exact name shown in the
             picker (case-sensitive). Multiple names are separated by spaces.

Options:
  -h, --help   Show this help message and exit.

Examples:
  $(basename "$0")                     # interactive picker
  $(basename "$0") default             # remove from profile named "default"
  $(basename "$0") default work        # remove from both "default" and "work"
EOF
    exit 1
}

parse_profile_args usage "$@"

# ─── Prerequisites ────────────────────────────────────────────────────────────

check_profile_prereqs

# ─── Profile selection ────────────────────────────────────────────────────────

load_profile_lines
select_profiles

# ─── Remove from each selected profile ────────────────────────────────────────

remove_sine_mod() {
    local chrome_dir="$1"
    local sine_mods_dir="$chrome_dir/sine-mods"
    local mods_json="$sine_mods_dir/mods.json"
    local mod_dir="$sine_mods_dir/zen-crowd"

    rm -rf "$mod_dir"
    if [ -f "$mods_json" ]; then
        jq 'del(."zen-crowd")' \
            "$mods_json" > "$mods_json.tmp" && mv "$mods_json.tmp" "$mods_json"
        echo "  Updated         -> $mods_json"
    fi
    echo "  Removed Sine mod dir        -> $mod_dir"
}

remove_from_profile() {
    local name="$1"
    local PROFILE_PATH
    PROFILE_PATH="$(resolve_profile_path "$name")"

    echo ""
    echo "Removing from profile: $name ($PROFILE_PATH)"

    local CHROME_DIR="$PROFILE_PATH/chrome"
    local THEMES_DIR="$CHROME_DIR/zen-themes"
    local JS_DIR="$CHROME_DIR/JS"
    local UTILS_DIR="$CHROME_DIR/utils"
    local MOD_DIR="$THEMES_DIR/zen-crowd"
    local LEGACY_FOLDER_MOD_DIR="$THEMES_DIR/zen-crowd-folder-colorization"
    local LEGACY_SUBTAB_MOD_DIR="$THEMES_DIR/zen-crowd-subtab-grouping"
    local ZEN_THEMES_JSON="$PROFILE_PATH/zen-themes.json"

    remove_sine_mod "$CHROME_DIR"

    rm -rf "$MOD_DIR" "$LEGACY_FOLDER_MOD_DIR" "$LEGACY_SUBTAB_MOD_DIR"
    rm -f "$JS_DIR/nested-folder-colorization.uc.js"
    rm -f "$JS_DIR/nested-folder-colorization.js"
    rm -f "$JS_DIR/subtab-grouping.uc.js"
    rm -f "$UTILS_DIR/zen-crowd-shared.sys.mjs"
    rm -f "$UTILS_DIR/zen-crowd-subtab-policy.sys.mjs"

    if [ -f "$ZEN_THEMES_JSON" ]; then
        jq 'del(
              ."zen-crowd",
              ."zen-crowd-folder-colorization",
              ."zen-crowd-subtab-grouping"
            )' \
            "$ZEN_THEMES_JSON" > "$ZEN_THEMES_JSON.tmp" && mv "$ZEN_THEMES_JSON.tmp" "$ZEN_THEMES_JSON"
        echo "  Updated         -> $ZEN_THEMES_JSON"
    fi

    echo "  Removed mod theme dir        -> $MOD_DIR"
    echo "  Removed legacy theme dirs    -> $LEGACY_FOLDER_MOD_DIR, $LEGACY_SUBTAB_MOD_DIR"
    echo "  Removed scripts              -> $JS_DIR/nested-folder-colorization.uc.js, $JS_DIR/subtab-grouping.uc.js"
    echo "  Removed shared libs          -> $UTILS_DIR/zen-crowd-shared.sys.mjs, $UTILS_DIR/zen-crowd-subtab-policy.sys.mjs"
}

for profile_name in "${SELECTED_PROFILES[@]}"; do
    remove_from_profile "$profile_name"
done

echo ""
echo "Removed zen-crowd from ${#SELECTED_PROFILES[@]} profile(s)."
echo ""
echo "  Restart Zen Browser to apply changes."
echo "  fx-autoconfig files were left in place because other scripts may use them."
