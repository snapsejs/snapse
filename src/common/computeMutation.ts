// Compute the mutation between two arrays, defined as a set of insertions and removals to get from
//   _before_ to _after_.
// The purpose is to efficiently apply DOM Element .removeChild, .insertBefore and .moveBefore
// It is assumed that elements are unique, as they must be in the DOM.
// It is also assumed that inserting an element at some position will remove it from its previous
//   position, as DOM node functions do.
// It is also used for computing array changes for the undo functionality, accepting the same restrictions.

// _afterIndex_ defines the index of each element in _after_, if it exists.
const afterIndex = new Map()
// _beforeSet_ contains elements in _before_ that might be in _after_.
const beforeSet = new Set()

// Append a run of consecutive ascending indices lo..hi to _out_, run-length encoded: a range becomes
// [lo, -1 - hi], an isolated index [lo].
const flushRun = (out: number[], lo: number, hi: number) => {
  if (lo < 0) return
  out.push(lo)
  if (hi > lo) out.push(-1 - hi)
}

export type Mutation = {
  removed?: number[]
  moved?: number[]
  added?: number[]
  // Only read by undo: run-length encoded when computed cheaply for a single move or swap, plain otherwise
  kept?: number[]
  pre?: number
  suf?: number
}

// What a caller already found by comparing _before_ and _after_ position by position. The suffix and the
//   count of changed positions are only known when the lengths are equal.
export type KnownDifferences = { pre: number, suf?: number, changedCount?: number }

export const computeMutation = <T = unknown>(before: T[], after: T[], known?: KnownDifferences): Mutation => {
  // _prefixL_ is the number of identical items at the start of both arrays
  let prefixL = 0
  if (known) prefixL = known.pre
  else while (prefixL < after.length && before[prefixL] === after[prefixL]!) prefixL++
  // Are arrays identical?
  if (prefixL === after.length && prefixL === before.length) {
    return {}
  }
  // _suffixL_ is the number of identical items at the end of both arrays
  let suffixL = 0
  if (known?.suf !== undefined) {
    suffixL = known.suf
  } else {
    while (before[before.length - 1 - suffixL] === after[after.length - 1 - suffixL]!) suffixL++
  }
  const commonLength = prefixL + suffixL
  // Is the only change deletion(s) from the start or end?
  if (commonLength === after.length) {
    return before.length - commonLength === 1
      ? { removed: [prefixL], pre: prefixL, suf: suffixL }
      : { removed: [prefixL, -1 - (before.length - suffixL - 1)], pre: prefixL, suf: suffixL }
  }
  // Is the only change insertion(s) at the start or end?
  if (commonLength === before.length) {
    return after.length - commonLength === 1
      ? { added: [prefixL], pre: prefixL, suf: suffixL }
      : { added: [prefixL, -1 - (after.length - suffixL - 1)], pre: prefixL, suf: suffixL }
  }
  const singleMoveOrSwap = before.length === after.length
    && mutateSingleMoveOrSwap(before, after, prefixL, suffixL, known?.changedCount)
  return singleMoveOrSwap || diffChangedMiddle(before, after, prefixL, suffixL)
}

// Recognises a middle that differs only by one or both edge items
const mutateSingleMoveOrSwap = <T>(
  before: T[], after: T[], prefixL: number, suffixL: number, changedCount?: number,
): Mutation | undefined => {
  const first = prefixL
  const last = after.length - suffixL - 1
  const movedForward = after[last] === before[first]
  const movedBack = after[first] === before[last]
  if (!movedForward && !movedBack) return undefined
  // With both edges exchanged, two neighbours are just one moved forward
  const swapped = movedForward && movedBack && last > first + 1
  if (changedCount === 2) {
    // Only the edges changed, which is a single move or swap only if they were exchanged
    if (!movedForward || !movedBack) return undefined
  } else {
    const offset = Number(movedBack) - Number(movedForward)
    for (let i = first + Number(movedForward); i <= last - Number(movedBack); i++) {
      if (before[i] !== after[i + offset]) return undefined
    }
  }
  let common: number[]
  let move: number[]
  if (swapped) {
    common = [last]
    flushRun(common, first + 1, last - 1)
    common.push(first)
    move = [first, last]
  } else if (movedForward) {
    common = [last]
    flushRun(common, first, last - 1)
    move = [last]
  } else {
    common = [first + 1, -1 - last, first]
    move = [first]
  }
  return {
    removed: [], moved: move, added: [], kept: common, pre: prefixL, suf: suffixL,
  }
}

// The mutation of the middle of _before_ and _after_, between their common prefix and suffix
export const diffChangedMiddle = <T>(
  before: T[], after: T[], prefixL: number, suffixL: number,
): Mutation => {
  // _remove_/_move_/_add_ are ascending run-length encodings: a maximal run of consecutive indices lo..hi is
  //   [lo, -1 - hi], an isolated index [lo]. They must be applied backward, to not disturb incidies.
  const remove: number[] = []
  // _add_ defines indicies in _after_ (ascending run-length encoded) that are new and should be inserted.
  const add: number[] = []
  // _move_ defines ranks in the kept-after sequence (kept elements in _after_ order, descending) of
  //   elements that are out of order and must be relocated before their next kept neighbour.
  const move: number[] = []
  // _common_ contains indicies in _after_ for elements that are common with _before_ and should be kept,
  //   but not necessarily in the same order.
  const common: number[] = []
  afterIndex.clear()
  beforeSet.clear()
  // _prefixL_ and _suffixL_ define the longest common prefix and suffix of _before_ and _after_,
  //   which can be kept without mutation.

  for (let i = prefixL; i < after.length - suffixL; i++) {
    afterIndex.set(after[i]!, i)
  }

  // calculate _remove_, _common_ and _beforeSet_ in a single ascending pass
  // remove accumulates a run of consecutive removed indices (runLo..runHi) and flushes it when the run
  //   ends (a kept element, a gap, or the loop end).
  let runLo = -1
  let runHi = -1
  for (let beforeI = prefixL; beforeI <= before.length - 1 - suffixL; beforeI++) {
    const v = before[beforeI]!
    const afterI = afterIndex.get(v)
    if (afterI !== undefined) {
      common.push(afterI)
      beforeSet.add(v)
    } else if (runLo >= 0 && beforeI === runHi + 1) {
      runHi = beforeI
    } else {
      flushRun(remove, runLo, runHi)
      runLo = runHi = beforeI
    }
  }
  flushRun(remove, runLo, runHi)

  // The longest subsequence of kept elements already in relative order needs no move; the rest are
  //   relocated. _stableRuns_ holds the after-indices of those stable elements, run-length encoded and
  //   descending.

  const stableRuns = extractLongestIncreasingSubsequence(common)
  let sr = stableRuns.length - 1
  let stable = Infinity
  let stableHi = Infinity
  if (stableRuns.length) {
    stable = stableRuns[sr--]!
    stableHi = stableRuns[sr]! < 0 ? -1 - stableRuns[sr--]! : stable
  }

  // One pass over the changed middle classifies each element and assigns kept-after ranks.
  //   _keptRank_ starts at _prefixL_: the common prefix (all kept, all stable) fills the first
  //   prefixL ranks of the kept-after sequence. New elements are run-length encoded into _add_; kept
  //   elements that are not in the stable subsequence into _move_ (by kept-after rank). Both are built as
  //   [lo, -1 - hi] runs directly (moveLo/moveHi and addLo/addHi are the open runs).
  let keptRank = prefixL
  let moveLo = -1
  let moveHi = -1
  let addLo = -1
  let addHi = -1
  for (let i = prefixL; i < after.length - suffixL; i++) {
    if (beforeSet.has(after[i]!)) {
      if (i === stable) {
        if (stable < stableHi) {
          stable++
        } else if (sr >= 0) {
          stable = stableRuns[sr--]!
          stableHi = stableRuns[sr]! < 0 ? -1 - stableRuns[sr--]! : stable
        } else {
          stable = Infinity
        }
      } else if (moveLo >= 0 && keptRank === moveHi + 1) {
        moveHi = keptRank
      } else {
        flushRun(move, moveLo, moveHi)
        moveLo = moveHi = keptRank
      }
      keptRank++
    } else if (addLo >= 0 && i === addHi + 1) {
      addHi = i
    } else {
      flushRun(add, addLo, addHi)
      addLo = addHi = i
    }
  }
  flushRun(move, moveLo, moveHi)
  flushRun(add, addLo, addHi)
  return {
    removed: remove, moved: move, added: add, kept: common, pre: prefixL, suf: suffixL,
  }
}

// Extract the longest increasing subsequence (LIS) of _X_, run-length encoded: the ascending values are
//   returned as [lo, -1 - hi] ranges for maximal runs of consecutive values, single values as [lo].
// A run lo..hi therefore costs two entries, an isolated value one. See
//   https://en.wikipedia.org/wiki/Longest_increasing_subsequence#Efficient_algorithms
export const extractLongestIncreasingSubsequence = (X: number[]): number[] => {
  const N = X.length
  if (N < 2) return [...X]
  // the LIS ending at X[i] is preceded by X[predecessor[i]]
  const predecessor = new Int32Array(N)
  // X[lowestEnd[i]] is the lowest final number of the LIS of length i
  // Note that lowestEnd must be strictly increasing with i, otherwise lowestEnd[i] with the last number
  //   removed would have a smaller final number than lowestEnd[i-1].
  const lowestEnd = new Int32Array(N + 1)
  // LIS of length 1 trivially ends at index 0 (lowestEnd is zero-initialised); lowestEnd[0] is never
  //   dereferenced (the reconstruction stops at the first LIS element without reading its predecessor)
  let longestLIS = 1
  let lo, hi, mid

  for (let i = 1; i < N; i++) {
    // Find the longest LIS, if any, where X[i] is smaller than the final number
    lo = 1
    hi = longestLIS + 1
    while (lo < hi) {
      mid = lo + hi >> 1
      if (X[lowestEnd[mid]!]! >= X[i]!) hi = mid
      else lo = mid + 1
    }
    predecessor[i] = lowestEnd[lo - 1]!
    // if lo is larger than longestLIS, we found a longer LIS,
    // otherwise we found a smaller final number for an existing LIS
    lowestEnd[lo] = i
    if (lo > longestLIS) longestLIS = lo
  }
  // Reconstruct the LIS straight into a run-length-encoded buffer built in reverse: each run lo..hi
  //   is pushed as [-1 - hi, lo] (or just [lo] when hi === lo).
  const runs: number[] = []
  let k = lowestEnd[longestLIS]!
  let runHi = X[k]!
  let runLo = runHi
  for (let n = longestLIS - 1; n > 0; n--) {
    k = predecessor[k]!
    const v = X[k]!
    if (v === runLo - 1) {
      runLo = v
    } else {
      if (runHi > runLo) runs.push(-1 - runHi)
      runs.push(runLo)
      runHi = runLo = v
    }
  }
  if (runHi > runLo) runs.push(-1 - runHi)
  runs.push(runLo)
  return runs
}
