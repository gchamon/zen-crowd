// Pure hierarchy helpers for zen-crowd subtab grouping.
//
// This module intentionally contains no Zen/Firefox globals. Browser
// adapters pass in tab ids, maps, and small accessors; tests import the
// same module directly in Node.

export function recordLink(parentOf, childrenOf, childId, parentId) {
  if (!childId || !parentId) return;
  const oldParentId = parentOf.get(childId);
  if (oldParentId && oldParentId !== parentId) {
    const oldChildren = childrenOf.get(oldParentId);
    if (oldChildren) {
      const index = oldChildren.indexOf(childId);
      if (index !== -1) oldChildren.splice(index, 1);
      if (!oldChildren.length) childrenOf.delete(oldParentId);
    }
  }
  parentOf.set(childId, parentId);
  let children = childrenOf.get(parentId);
  if (!children) {
    children = [];
    childrenOf.set(parentId, children);
  }
  if (!children.includes(childId)) children.push(childId);
}

export function dropLink(parentOf, childrenOf, childId) {
  if (!childId) return;
  const parentId = parentOf.get(childId);
  parentOf.delete(childId);
  if (!parentId) return;
  const children = childrenOf.get(parentId);
  if (!children) return;
  const index = children.indexOf(childId);
  if (index !== -1) children.splice(index, 1);
  if (!children.length) childrenOf.delete(parentId);
}

export function depthOf(parentOf, tabId) {
  let depth = 0;
  let cursor = tabId;
  const seen = new Set();
  while (cursor && parentOf.has(cursor)) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    cursor = parentOf.get(cursor);
    depth++;
  }
  return depth;
}

export function wouldCreateCycle(parentOf, childId, parentId) {
  let cursor = parentId;
  const seen = new Set();
  while (cursor) {
    if (cursor === childId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = parentOf.get(cursor);
  }
  return false;
}

export function descendantIds(childrenOf, rootId) {
  const descendants = [];
  const queue = [...(childrenOf.get(rootId) || [])];
  const seen = new Set([rootId]);
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    descendants.push(id);
    queue.push(...(childrenOf.get(id) || []));
  }
  return descendants;
}

export function isDescendantOfAny(parentOf, childId, ancestorIds) {
  let cursor = childId;
  const seen = new Set();
  while (cursor && parentOf.has(cursor)) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = parentOf.get(cursor);
    if (ancestorIds.has(cursor)) return true;
  }
  return false;
}

export function movedRootIds(parentOf, movedIds) {
  return [...movedIds].filter(id => !movedIds.has(parentOf.get(id)));
}

export function sortByPosition(items, getPosition = item => item.position) {
  return [...items].sort((a, b) => getPosition(a) - getPosition(b));
}

export function belowReferenceId(orderedIds, parentOf, movedIds) {
  const movedIndexes = orderedIds
    .map((id, index) => movedIds.has(id) ? index : -1)
    .filter(index => index !== -1);
  if (!movedIndexes.length) return null;

  for (let i = Math.max(...movedIndexes) + 1; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (movedIds.has(id)) continue;
    if (isDescendantOfAny(parentOf, id, movedIds)) continue;
    return id;
  }
  return null;
}

export function dragParentUpdates(parentOf, orderedIds, movedIds) {
  const referenceId = belowReferenceId(orderedIds, parentOf, movedIds);
  const inheritedParentId = referenceId ? parentOf.get(referenceId) || null : null;
  return movedRootIds(parentOf, movedIds).map(rootId => ({
    id: rootId,
    parentId: (
      inheritedParentId &&
      inheritedParentId !== rootId &&
      !movedIds.has(inheritedParentId) &&
      !wouldCreateCycle(parentOf, rootId, inheritedParentId)
    ) ? inheritedParentId : null,
  }));
}

export function descendantItems(items, childrenOf, rootId, getId = item => item.id) {
  const byId = new Map(items.map(item => [getId(item), item]));
  return descendantIds(childrenOf, rootId)
    .map(id => byId.get(id))
    .filter(Boolean);
}

export function folderTargetItems(action, items, childrenOf, rootItem, {
  getId = item => item.id,
  getPosition = item => item.position,
} = {}) {
  const descendants = descendantItems(items, childrenOf, getId(rootItem), getId);
  const targets = action === "subtabs-only"
    ? descendants
    : [rootItem, ...descendants];
  return sortByPosition(targets, getPosition);
}

export function copyPlanForTargets(targets, {
  getId = item => item.id,
  getUrl = item => item.url,
  getTitle = item => item.title || "",
  getPosition = item => item.position,
} = {}) {
  return sortByPosition(targets, getPosition).map(item => ({
    originalId: getId(item),
    url: getUrl(item),
    title: getTitle(item),
  }));
}

export function directChildItems(items, childrenOf, rootId, {
  getId = item => item.id,
  getPosition = item => item.position,
} = {}) {
  const byId = new Map(items.map(item => [getId(item), item]));
  return sortByPosition(
    (childrenOf.get(rootId) || []).map(id => byId.get(id)).filter(Boolean),
    getPosition
  );
}

export function snapshotMatchesTabs(snapshotWindow, tabs, {
  isPinned = tab => Boolean(tab.pinned),
  getWorkspace = tab => tab.workspace || "",
  getUrl = tab => tab.url || "",
} = {}) {
  if (!snapshotWindow?.tabs) return false;
  if (snapshotWindow.tabs.length !== tabs.length) return false;
  return snapshotWindow.tabs.every((savedTab, index) => {
    const tab = tabs[index];
    if (Boolean(savedTab.pinned) !== Boolean(isPinned(tab))) return false;
    if (savedTab.workspace && savedTab.workspace !== getWorkspace(tab)) {
      return false;
    }
    return !savedTab.url || !getUrl(tab) || savedTab.url === getUrl(tab);
  });
}
