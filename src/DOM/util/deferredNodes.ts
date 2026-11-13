// DOM nodes that a movable StateController has removed from its logical child list but not yet
//   physically detached -- the actual removal is deferred to StateController.flushPendingWork so
//   the node stays connected for a state-preserving moveBefore adoption. While a node sits here it
//   is still in the document but must be treated as absent by any physical-index lookup, otherwise
//   a sibling that reconciles in the same flush computes its insertion point past the stale node.

// The set currently accepting entries: nodes removed during reconciliation, awaiting the reap.
let deferred = new Set<Node>()
// The batch handed to an in-progress flushPendingWork.
let draining = new Set<Node>()

export const deferNode = (n: Node): void => void deferred.add(n)

export const adoptDeferredNode = (n: Node): void => {
  deferred.delete(n)
  draining.delete(n)
}

export const hasDeferredNodes = (): boolean => deferred.size > 0 || draining.size > 0

const isDeferred = (n: Node): boolean => deferred.has(n) || draining.has(n)

export const swapDeferredNodes = (): void => {
  const t = deferred
  deferred = draining
  draining = t
}

export const clearDrainedDeferredNodes = (): void => draining.clear()

// The child at _atIndex_ of _parent_ counting only non-deferred ("live") nodes. `startNode` (the live
//   node at logical _startIndex_) resumes a forward walk so a caller iterating ascending indices
//   stays linear overall; omit it to start from the first child. Returns null past the end, which
//   callers treat as "append".
export const liveChildNodeAt = (
  parent: Node,
  atIndex: number,
  startNode?: Node | null,
  startNodeIndex = 0,
): Node | null => {
  if (!hasDeferredNodes()) return parent.childNodes[atIndex] ?? null
  let n: Node | null | undefined = startNode === undefined ? parent.firstChild : startNode
  let liveNodeIndex = startNode === undefined ? 0 : startNodeIndex
  while (n) {
    if (!isDeferred(n)) {
      if (liveNodeIndex === atIndex) return n
      liveNodeIndex++
    }
    n = n.nextSibling
  }
  return null
}

export const liveChildNodeCount = (parent: Node): number => {
  if (!hasDeferredNodes()) return parent.childNodes.length
  let count = 0
  for (let n = parent.firstChild; n; n = n.nextSibling) if (!isDeferred(n)) count++
  return count
}
