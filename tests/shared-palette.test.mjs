import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PALETTE,
  isPrivateWindow,
  selectPalette,
} from "../src/lib/zen-crowd-shared.sys.mjs";

function rgbFromHex(hex) {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function fakeWindow({ privateWindow = false, accent = "#2980b9" } = {}) {
  return {
    privateWindow,
    document: {
      documentElement: {},
      createElement() {
        return {
          getContext() {
            return {
              fillStyle: "#000000",
              fillRect() {},
              getImageData() {
                return { data: rgbFromHex(this.fillStyle) };
              },
            };
          },
        };
      },
    },
    getComputedStyle() {
      return {
        getPropertyValue(property) {
          return property === "--zen-primary-color" ? accent : "";
        },
      };
    },
  };
}

function paletteFor(win, options = {}) {
  return selectPalette(win, {
    colorSource: "",
    customBaseColor: "#2980b9",
    customColors: "",
    count: 6,
    hueStep: 40,
    ...options,
  });
}

test("detects private browser windows through PrivateBrowsingUtils", () => {
  const previous = globalThis.PrivateBrowsingUtils;
  globalThis.PrivateBrowsingUtils = {
    isWindowPrivate(win) {
      return win.privateWindow;
    },
  };

  try {
    assert.equal(isPrivateWindow(fakeWindow()), false);
    assert.equal(isPrivateWindow(fakeWindow({ privateWindow: true })), true);
  } finally {
    globalThis.PrivateBrowsingUtils = previous;
  }
});

test("normal windows keep using the theme accent for blank color source", () => {
  const previous = globalThis.PrivateBrowsingUtils;
  globalThis.PrivateBrowsingUtils = {
    isWindowPrivate() {
      return false;
    },
  };

  try {
    assert.notDeepEqual(paletteFor(fakeWindow()), DEFAULT_PALETTE);
  } finally {
    globalThis.PrivateBrowsingUtils = previous;
  }
});

test("private windows use the fixed palette for blank color source", () => {
  const previous = globalThis.PrivateBrowsingUtils;
  globalThis.PrivateBrowsingUtils = {
    isWindowPrivate() {
      return true;
    },
  };

  try {
    assert.deepEqual(paletteFor(fakeWindow({ privateWindow: true })), DEFAULT_PALETTE);
  } finally {
    globalThis.PrivateBrowsingUtils = previous;
  }
});

test("private windows still honor explicit custom colors", () => {
  const previous = globalThis.PrivateBrowsingUtils;
  globalThis.PrivateBrowsingUtils = {
    isWindowPrivate() {
      return true;
    },
  };

  try {
    assert.notDeepEqual(
      paletteFor(fakeWindow({ privateWindow: true }), {
        colorSource: "custom-list",
        customColors: "#112233,#445566",
      }),
      DEFAULT_PALETTE
    );
  } finally {
    globalThis.PrivateBrowsingUtils = previous;
  }
});

test("private windows use the fixed palette for empty custom color lists", () => {
  const previous = globalThis.PrivateBrowsingUtils;
  globalThis.PrivateBrowsingUtils = {
    isWindowPrivate() {
      return true;
    },
  };

  try {
    assert.deepEqual(
      paletteFor(fakeWindow({ privateWindow: true }), {
        colorSource: "custom-list",
        customColors: "",
      }),
      DEFAULT_PALETTE
    );
  } finally {
    globalThis.PrivateBrowsingUtils = previous;
  }
});
