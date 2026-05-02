// Sine wrapper for the existing zen-crowd folder colorization script.
{
  const previousModuleBaseURI = globalThis.__zenCrowdModuleBaseURI;
  globalThis.__zenCrowdModuleBaseURI = "chrome://sine/content/zen-crowd/src/lib/";
  Services.scriptloader.loadSubScriptWithOptions(
    "chrome://sine/content/zen-crowd/src/nested-folder-colorization.js",
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
