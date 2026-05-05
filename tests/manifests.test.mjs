import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import test from "node:test";

const manifests = [
  "dist/nested-folder-colorization/zen-mod.json",
  "dist/nested-folder-colorization/preferences.json",
  "dist/subtab-grouping/zen-mod.json",
  "dist/subtab-grouping/preferences.json",
  "sine/preferences.json",
];

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}

async function assertFileExists(path) {
  await access(new URL(`../${path}`, import.meta.url));
}

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
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
      if (pref.type !== "separator" && pref.type !== "text") {
        assert.equal(typeof pref.property, "string", `${path}: preference property`);
      }
      assert.equal(typeof pref.type, "string", `${path}: preference type`);
    }
  }
});

test("Sine theme manifest is valid and references existing files", async () => {
  const manifest = await readJson("theme.json");

  assert.equal(manifest.id, "zen-crowd");
  assert.equal(manifest.homepage, "https://github.com/gchamon/zen-crowd");
  assert.equal(typeof manifest.name, "string");
  assert.equal(typeof manifest.version, "string");
  assert.equal(typeof manifest.updatedAt, "string");
  assert.match(manifest.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(typeof manifest.description, "string");
  assert.equal(typeof manifest.scripts, "object");
  assert.equal(manifest.supportsUnload, true);
  assert.equal(Object.hasOwn(manifest, "js"), false, "use scripts, not legacy js");

  await assertFileExists(manifest.preferences);
  await assertFileExists(manifest.style.chrome);

  for (const [scriptPath, options] of Object.entries(manifest.scripts)) {
    assert.match(scriptPath, /\.(uc\.js|uc\.mjs|sys\.mjs)$/);
    assert.equal(Array.isArray(options.include), true, `${scriptPath}: include`);
    assert.equal(typeof options.loadOrder, "number", `${scriptPath}: loadOrder`);
    await assertFileExists(scriptPath);
  }
});

test("versioned manifests match version.txt", async () => {
  const version = (await readText("version.txt")).trim();
  assert.match(version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);

  for (const path of [
    "package.json",
    "theme.json",
    "dist/nested-folder-colorization/zen-mod.json",
    "dist/subtab-grouping/zen-mod.json",
  ]) {
    const manifest = await readJson(path);
    assert.equal(manifest.version, version, path);
  }

  const sineManifest = await readJson("theme.json");
  assert.match(sineManifest.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});
