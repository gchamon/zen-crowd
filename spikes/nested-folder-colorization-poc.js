// Nested Folder Colorization — Feasibility Spike POC (background variant)
//
// Paints the whole folder region (label row + the container holding
// child tabs and nested folders) per nesting depth. The folder icon is
// left at Zen's default colors so it stays recognizable against the
// tinted background; if you want the icon recolored too, see
// `nested-folder-colorization-poc-icon.js`.
//
// Paste into Zen's Browser Console (Ctrl+Shift+J) and press Enter.
// Re-pasting is safe; the prior <style> is replaced.
//
// Prerequisites in about:config:
//   devtools.chrome.enabled = true
//   devtools.debugger.remote-enabled = true
//
// Implementation notes:
//   - `<zen-folder>` itself wraps both the label row
//     (.tab-group-label-container) and the children container
//     (.tab-group-container), so a background on `zen-folder` covers
//     "the folder and everything in it."
//   - We tint with a translucent overlay (color-mix with transparent)
//     so Zen's own selected/hover states still read through.
//   - Selectors are anchored to #tabbrowser-tabs to keep blast radius
//     small.

(() => {
  const STYLE_ID = "zen-crowd-folder-depth-poc";
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

  // Translucent so hover/selected states from Zen still show through.
  const TINT_LIGHT = "18%";
  const TINT_DARK = "22%";

  const ruleFor = (depth, { light, dark }) => {
    const selector =
      "#tabbrowser-tabs " + Array(depth).fill("zen-folder").join(" ");
    const bg = `light-dark(
      color-mix(in srgb, ${light} ${TINT_LIGHT}, transparent),
      color-mix(in srgb, ${dark} ${TINT_DARK}, transparent)
    )`;
    return `${selector} {
  background-color: ${bg};
  border-radius: 6px;
}`;
  };

  const css = palette.map((c, i) => ruleFor(i + 1, c)).join("\n\n");

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.documentElement.appendChild(style);

  console.log(`[${STYLE_ID}] injected ${palette.length} depth rules`);
})();
