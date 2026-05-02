import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifests = [
  "dist/nested-folder-colorization/zen-mod.json",
  "dist/nested-folder-colorization/preferences.json",
  "dist/subtab-grouping/zen-mod.json",
  "dist/subtab-grouping/preferences.json",
];

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}

test("Zen mod manifests are valid JSON with required fields", async () => {
  for (const path of manifests.filter(path => path.endsWith("zen-mod.json"))) {
    const manifest = await readJson(path);
    assert.equal(typeof manifest.id, "string", path);
    assert.equal(typeof manifest.name, "string", path);
    assert.equal(typeof manifest.version, "string", path);
  }
});

test("preference manifests are valid JSON arrays", async () => {
  for (const path of manifests.filter(path => path.endsWith("preferences.json"))) {
    const preferences = await readJson(path);
    assert.equal(Array.isArray(preferences), true, path);
    for (const pref of preferences) {
      assert.equal(typeof pref.property, "string", `${path}: preference property`);
      assert.equal(typeof pref.type, "string", `${path}: preference type`);
    }
  }
});
