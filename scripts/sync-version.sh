#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="$(<"$REPO_DIR/version.txt")"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid version in version.txt: $VERSION" >&2
    exit 1
fi

echo "sync-version: using version $VERSION from version.txt"

update_json_version() {
    local path="$1"
    local tmp
    echo "sync-version: updating $path"
    tmp="$(mktemp)"
    jq --arg version "$VERSION" '.version = $version' "$REPO_DIR/$path" > "$tmp"
    mv "$tmp" "$REPO_DIR/$path"
}

update_json_version package.json
update_json_version theme.json
update_json_version dist/nested-folder-colorization/zen-mod.json
update_json_version dist/subtab-grouping/zen-mod.json

echo "sync-version: updating docs/sine-store-publication.md"
sed -i -E \
    's/"version": "([^"]+)"/"version": "'"$VERSION"'"/' \
    "$REPO_DIR/docs/sine-store-publication.md"

echo "sync-version: done"
