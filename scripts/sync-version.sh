#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="$(<"$REPO_DIR/version.txt")"
UPDATED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid version in version.txt: $VERSION" >&2
    exit 1
fi

echo "sync-version: using version $VERSION from version.txt"
echo "sync-version: using updatedAt $UPDATED_AT from current UTC time"

update_json_release_metadata() {
    local path="$1"
    local tmp
    echo "sync-version: updating $path"
    tmp="$(mktemp)"
    jq --arg version "$VERSION" '.version = $version' "$REPO_DIR/$path" > "$tmp"
    mv "$tmp" "$REPO_DIR/$path"
}

update_sine_release_metadata() {
    local path="$1"
    local tmp
    echo "sync-version: updating $path"
    tmp="$(mktemp)"
    jq \
        --arg version "$VERSION" \
        --arg updated_at "$UPDATED_AT" \
        '.version = $version | .updatedAt = $updated_at' \
        "$REPO_DIR/$path" > "$tmp"
    mv "$tmp" "$REPO_DIR/$path"
}

update_json_release_metadata package.json
update_sine_release_metadata theme.json
update_json_release_metadata dist/zen-crowd/zen-mod.json

echo "sync-version: updating docs/sine-store-publication.md"
sed -i -E \
    -e 's/"version": "([^"]+)"/"version": "'"$VERSION"'"/' \
    -e 's/"updatedAt": "([^"]+)"/"updatedAt": "'"$UPDATED_AT"'"/' \
    "$REPO_DIR/docs/sine-store-publication.md"

echo "sync-version: done"
