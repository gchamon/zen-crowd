#!/usr/bin/env bash
set -euo pipefail

ZEN_DIR="$HOME/.zen"
INI="$ZEN_DIR/profiles.ini"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$INI" ]; then
    echo "Error: $INI not found." >&2
    exit 1
fi

if ! command -v yq &> /dev/null; then
    echo "Error: yq is required but not installed." >&2
    exit 1
fi

# Use yq to parse profiles.ini and present a numbered menu.
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

echo "Available Zen profiles:"
i=1
for line in "${PROFILE_LINES[@]}"; do
    IFS='|' read -r name path rel <<< "$line"
    echo "  $i. $name ($path)"
    i=$((i + 1))
done

echo ""
read -rp "Select profile number: " choice

# Validate choice
if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#PROFILE_LINES[@]}" ]; then
    echo "Invalid selection." >&2
    exit 1
fi

SELECTED="${PROFILE_LINES[$((choice - 1))]}"
IFS='|' read -r name path is_relative <<< "$SELECTED"

if [ "$is_relative" = "1" ]; then
    PROFILE_PATH="$ZEN_DIR/$path"
else
    PROFILE_PATH="$path"
fi

echo "Deploying to profile: $name ($PROFILE_PATH)"

CHROME_DIR="$PROFILE_PATH/chrome"
THEMES_DIR="$CHROME_DIR/zen-themes"
MOD_DIR="$THEMES_DIR/zen-crowd-folder-colorization"
JS_DIR="$CHROME_DIR/JS"

mkdir -p "$MOD_DIR"
mkdir -p "$JS_DIR"

cp "$SCRIPT_DIR/dist/nested-folder-colorization/zen-mod.json" "$MOD_DIR/"
cp "$SCRIPT_DIR/dist/nested-folder-colorization/preferences.json" "$MOD_DIR/"
cp "$SCRIPT_DIR/dist/nested-folder-colorization/chrome.css" "$MOD_DIR/"
cp "$SCRIPT_DIR/src/nested-folder-colorization.js" "$JS_DIR/"

ZEN_THEMES_JSON="$PROFILE_PATH/zen-themes.json"
python3 -c "
import json, os
path = '$ZEN_THEMES_JSON'
data = {}
if os.path.exists(path):
    with open(path, 'r') as f:
        data = json.load(f)
data['zen-crowd-folder-colorization'] = {
    'id': 'zen-crowd-folder-colorization',
    'name': 'Nested Folder Colorization',
    'enabled': True,
    'version': '1.0.0',
    'description': 'Colorizes nested folders by depth and adds hover-expand behavior.',
    'preferences': True
}
with open(path, 'w') as f:
    json.dump(data, f, indent=2)
"

echo ""
echo "Deployed successfully:"
echo "  Mod metadata  -> $MOD_DIR"
echo "  JS script     -> $JS_DIR/nested-folder-colorization.js"
echo "  zen-themes.json updated."
