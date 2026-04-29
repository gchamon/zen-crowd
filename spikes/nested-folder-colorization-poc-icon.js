// Nested Folder Colorization — Feasibility Spike POC (icon-only variant)
//
// Recolors only the folder ICON per depth, by overriding Zen's three
// folder CSS custom properties. Kept as a reference; the primary POC
// is `nested-folder-colorization-poc.js`, which paints the whole
// folder region instead.
//
// Paste this whole file into Zen's Browser Console (Ctrl+Shift+J) and
// press Enter. Re-pasting is safe; the prior <style> is replaced.
//
// Prerequisites in about:config:
//   devtools.chrome.enabled = true
//   devtools.debugger.remote-enabled = true
//
// What it does: injects a <style> into the chrome document that
// overrides Zen's folder color custom properties per nesting depth, by
// using descendant selectors anchored to #tabbrowser-tabs. Inline
// style="fill: var(--zen-folder-...)" on the SVG paths inherits these
// overrides automatically — no DOM tagging needed.

(() => {
  const STYLE_ID = "zen-crowd-folder-depth-poc-icon";
  const prior = document.getElementById(STYLE_ID);
  if (prior) prior.remove();

  const palette = [
    { light: "#e74c3c", dark: "#ff7a6b" },
    { light: "#e67e22", dark: "#ffa15c" },
    { light: "#27ae60", dark: "#5fd38c" },
    { light: "#2980b9", dark: "#6cb4ff" },
    { light: "#8e44ad", dark: "#c89cff" },
    { light: "#16a085", dark: "#5ed6c1" },
  ];

  const ruleFor = (depth, { light, dark }) => {
    const selector =
      "#tabbrowser-tabs " + Array(depth).fill("zen-folder").join(" ");
    const ld = `light-dark(${light}, ${dark})`;
    return `${selector} {
  --zen-folder-behind-bgcolor: ${ld};
  --zen-folder-front-bgcolor: ${ld};
  --zen-folder-stroke: ${ld};
}`;
  };

  const css = palette.map((c, i) => ruleFor(i + 1, c)).join("\n\n");

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.documentElement.appendChild(style);

  console.log(`[${STYLE_ID}] injected ${palette.length} depth rules`);
})();
