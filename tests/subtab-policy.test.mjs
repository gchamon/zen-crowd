import assert from "node:assert/strict";
import test from "node:test";

import {
  belowReferenceId,
  copyPlanForTargets,
  depthOf,
  descendantIds,
  directChildItems,
  dragParentUpdates,
  folderTargetItems,
  movedRootIds,
  recordLink,
  snapshotMatchesTabs,
  wouldCreateCycle,
} from "../src/lib/zen-crowd-subtab-policy.sys.mjs";

function graph(pairs) {
  const parentOf = new Map();
  const childrenOf = new Map();
  for (const [child, parent] of pairs) {
    recordLink(parentOf, childrenOf, child, parent);
  }
  return { parentOf, childrenOf };
}

test("calculates depth for roots and nested subtabs", () => {
  const { parentOf } = graph([
    ["b", "a"],
    ["c", "b"],
    ["d", "c"],
  ]);

  assert.equal(depthOf(parentOf, "a"), 0);
  assert.equal(depthOf(parentOf, "b"), 1);
  assert.equal(depthOf(parentOf, "c"), 2);
  assert.equal(depthOf(parentOf, "d"), 3);
});

test("detects cycles and keeps depth traversal finite", () => {
  const parentOf = new Map([
    ["a", "c"],
    ["b", "a"],
    ["c", "b"],
  ]);

  assert.equal(wouldCreateCycle(new Map([["b", "a"]]), "a", "b"), true);
  assert.equal(depthOf(parentOf, "a"), 3);
});

test("returns all descendants without including the root", () => {
  const { childrenOf } = graph([
    ["b", "a"],
    ["c", "a"],
    ["d", "b"],
    ["e", "d"],
  ]);

  assert.deepEqual(descendantIds(childrenOf, "a"), ["b", "c", "d", "e"]);
});

test("identifies moved roots in a multi-selected block", () => {
  const { parentOf } = graph([
    ["b", "a"],
    ["c", "b"],
    ["d", "a"],
  ]);

  assert.deepEqual(movedRootIds(parentOf, new Set(["b", "c", "d"])), ["b", "d"]);
});

test("dragged tab inherits the hierarchy level of the tab below it", () => {
  const { parentOf } = graph([
    ["b", "a"],
    ["c", "a"],
    ["d", "b"],
  ]);
  const updates = dragParentUpdates(parentOf, ["d", "c", "b", "a"], new Set(["d"]));

  assert.deepEqual(updates, [{ id: "d", parentId: "a" }]);
});

test("dragged tab becomes top-level below a top-level tab", () => {
  const { parentOf } = graph([
    ["b", "a"],
    ["c", "a"],
  ]);
  const updates = dragParentUpdates(parentOf, ["c", "a", "b"], new Set(["c"]));

  assert.deepEqual(updates, [{ id: "c", parentId: null }]);
});

test("below-reference selection skips moved descendants", () => {
  const { parentOf } = graph([
    ["b", "a"],
    ["c", "b"],
    ["d", "a"],
  ]);
  const reference = belowReferenceId(["b", "c", "d", "a"], parentOf, new Set(["b"]));

  assert.equal(reference, "d");
});

test("multi-selected drag preserves internal links and reparents moved roots", () => {
  const { parentOf } = graph([
    ["b", "a"],
    ["c", "b"],
    ["d", "a"],
    ["e", "d"],
  ]);
  const updates = dragParentUpdates(
    parentOf,
    ["b", "c", "e", "d", "a"],
    new Set(["b", "c"])
  );

  assert.deepEqual(updates, [{ id: "b", parentId: "d" }]);
});

test("folder target helpers distinguish conversion from subtabs-only", () => {
  const tabs = [
    { id: "a", position: 0 },
    { id: "b", position: 2 },
    { id: "c", position: 1 },
    { id: "d", position: 3 },
  ];
  const { childrenOf } = graph([
    ["b", "a"],
    ["c", "a"],
    ["d", "b"],
  ]);

  assert.deepEqual(
    folderTargetItems("root-and-subtabs", tabs, childrenOf, tabs[0]).map(tab => tab.id),
    ["a", "c", "b", "d"]
  );
  assert.deepEqual(
    folderTargetItems("subtabs-only", tabs, childrenOf, tabs[0]).map(tab => tab.id),
    ["c", "b", "d"]
  );
});

test("copy plans preserve order and reference original ids only as metadata", () => {
  const targets = [
    { id: "original-b", position: 2, url: "https://example.test/b", title: "B" },
    { id: "original-a", position: 1, url: "https://example.test/a", title: "A" },
  ];

  assert.deepEqual(copyPlanForTargets(targets), [
    { originalId: "original-a", url: "https://example.test/a", title: "A" },
    { originalId: "original-b", url: "https://example.test/b", title: "B" },
  ]);
});

test("direct child helpers return only immediate children in tab order", () => {
  const tabs = [
    { id: "a", position: 0 },
    { id: "b", position: 3 },
    { id: "c", position: 1 },
    { id: "d", position: 2 },
  ];
  const { childrenOf } = graph([
    ["b", "a"],
    ["c", "a"],
    ["d", "b"],
  ]);

  assert.deepEqual(
    directChildItems(tabs, childrenOf, "a").map(tab => tab.id),
    ["c", "b"]
  );
});

test("snapshot matching accepts unchanged restored tab order", () => {
  const snapshot = {
    tabs: [
      { url: "https://example.test/a", pinned: false, workspace: "w1" },
      { url: "https://example.test/b", pinned: true, workspace: "w1" },
    ],
  };
  const tabs = [
    { url: "https://example.test/a", pinned: false, workspace: "w1" },
    { url: "https://example.test/b", pinned: true, workspace: "w1" },
  ];

  assert.equal(snapshotMatchesTabs(snapshot, tabs), true);
});

test("snapshot matching rejects changed order hints", () => {
  const snapshot = {
    tabs: [
      { url: "https://example.test/a", pinned: false, workspace: "w1" },
      { url: "https://example.test/b", pinned: true, workspace: "w1" },
    ],
  };

  assert.equal(snapshotMatchesTabs(snapshot, [
    { url: "https://example.test/a", pinned: true, workspace: "w1" },
    { url: "https://example.test/b", pinned: true, workspace: "w1" },
  ]), false);
  assert.equal(snapshotMatchesTabs(snapshot, [
    { url: "https://example.test/a", pinned: false, workspace: "w2" },
    { url: "https://example.test/b", pinned: true, workspace: "w1" },
  ]), false);
  assert.equal(snapshotMatchesTabs(snapshot, [
    { url: "https://example.test/b", pinned: false, workspace: "w1" },
    { url: "https://example.test/a", pinned: true, workspace: "w1" },
  ]), false);
});
