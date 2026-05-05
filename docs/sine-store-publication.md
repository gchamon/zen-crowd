# Sine Store Publication

## Target

Publish `zen-crowd` through the official Sine marketplace so users can
install it without enabling `sine.allow-unsafe-js`.

## Store PR Checklist

1. Build a `mod.zip` for `sineorg/store` containing the installable
   package with `theme.json` and the referenced files at the package
   root.
2. Add the zip to `sineorg/store` at:

   ```text
   mods/zen-crowd/mod.zip
   ```

3. Add `zen-crowd` to `marketplace.json` with metadata matching this
   repository's `theme.json`:

   ```json
   {
     "zen-crowd": {
       "id": "zen-crowd",
       "name": "zen-crowd",
       "version": "1.0.1",
       "description": "Adds nested folder colorization, hover-expand folders, and subtab grouping for Zen Browser.",
       "author": "Gabriel Chamon",
       "homepage": "https://github.com/gchamon/zen-crowd",
       "readme": "https://raw.githubusercontent.com/gchamon/zen-crowd/main/README.md",
       "image": "https://raw.githubusercontent.com/gchamon/zen-crowd/main/docs/assets/screenshot.png",
       "createdAt": "2026-05-02",
       "tags": ["chrome", "tabs", "folders", "sidebar"],
       "fork": ["zen"],
       "style": {
         "chrome": "sine/chrome.css"
       },
       "preferences": "sine/preferences.json",
       "supportsUnload": true,
       "scripts": {
         "sine/nested-folder-colorization.uc.js": {
           "include": ["chrome://browser/content/browser.xhtml"],
           "loadOrder": 10
         },
         "sine/subtab-grouping.uc.js": {
           "include": ["chrome://browser/content/browser.xhtml"],
           "loadOrder": 20
         }
       }
     }
   }
   ```

4. Test the store PR branch through Sine's external marketplace setting,
   using the raw `marketplace.json` URL from the fork/branch.
5. Confirm install works with `sine.allow-unsafe-js` disabled.
6. Confirm the Browser Console logs both:

   ```text
   [zen-crowd-folder-colorization] loaded
   [zen-crowd-subtab-grouping] loaded
   ```

## Notes

Sine 2.3.1 loads JavaScript for official marketplace installs because
they are stored with `origin: "store"`. Unpublished repository installs
still require `sine.allow-unsafe-js`.
