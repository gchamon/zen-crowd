// Sine wrapper for the existing zen-crowd subtab grouping script.
{
  const previousModuleBaseURI = globalThis.__zenCrowdModuleBaseURI;
  globalThis.__zenCrowdModuleBaseURI = "chrome://sine/content/zen-crowd/src/lib/";
  Services.scriptloader.loadSubScriptWithOptions(
    "chrome://sine/content/zen-crowd/src/subtab-grouping.js",
    {
      target: globalThis,
      ignoreCache: true,
    }
  );
  if (previousModuleBaseURI === undefined) {
    delete globalThis.__zenCrowdModuleBaseURI;
  } else {
    globalThis.__zenCrowdModuleBaseURI = previousModuleBaseURI;
  }
}
