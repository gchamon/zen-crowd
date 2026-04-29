// Nested Folder Colorization — Reset
//
// Removes any <style> elements injected by the spike POCs, restoring
// Zen's default folder colors. Safe to paste even if no POC is active.
//
// Paste into Zen's Browser Console (Ctrl+Shift+J) and press Enter.

(() => {
  const ids = [
    "zen-crowd-folder-depth-poc",       // background variant
    "zen-crowd-folder-depth-poc-icon",  // icon-only variant
  ];
  let removed = 0;
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) {
      el.remove();
      removed++;
    }
  }
  console.log(`[zen-crowd-folder-depth-poc] reset: removed ${removed} style element(s)`);
})();
