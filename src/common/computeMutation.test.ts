import { describe, expect, it } from 'vitest'

import { computeMutation, diffChangedMiddle, extractLongestIncreasingSubsequence } from './computeMutation.js'
import { decodeAscendingRLE } from './undoUtils.js'

// util functions for mutation testing

const sfc32 = (a: number, b: number, c: number, d: number) => {
  return () => {
    a |= 0
    b |= 0
    c |= 0
    d |= 0
    const t = (a + b | 0) + d | 0
    d = d + 1 | 0
    a = b ^ b >>> 9
    b = c + (c << 3) | 0
    c = (c << 21 | c >>> 11)
    c = c + t | 0
    return (t >>> 0) / 4294967296
  }
}

type Rand = (n: number) => number

const getIntegerRand = (a: number, b: number, c: number, d: number) => {
  const rand = sfc32(a, b, c, d)
  return (n: number) => Math.floor(rand() * n)
}

const scrambleArray = (rand: Rand, arr: unknown[]) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1)
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}
const deleteRandomElementsFromArray = (rand: Rand, arr: unknown[], maxCount: number) => {
  const count = rand(maxCount + 1)
  for (let i = 0; i < count; i++) {
    arr.splice(rand(arr.length), 1)
  }
}
const insertRandomElementsIntoArray = (
  rand: Rand, arr: unknown[], firstElement: number, maxCount: number,
) => {
  const count = rand(maxCount + 1)
  for (let i = 0; i < count; i++) {
    arr.splice(rand(arr.length + 1), 0, firstElement++)
  }
}

const remove = (arr: unknown[], element: unknown) => {
  const index = arr.indexOf(element)
  if (index !== -1) {
    arr.splice(index, 1)
  }
}

const insertBefore = (arr: unknown[], element: unknown, beforeElement: unknown) => {
  remove(arr, element)
  const index = arr.indexOf(beforeElement)
  if (index !== -1) {
    arr.splice(index, 0, element)
  } else {
    arr.push(element)
  }
}

const mutationCount = (mutation: ReturnType<typeof computeMutation>) =>
  (mutation.removed?.length ?? 0) + (mutation.moved?.length ?? 0) + (mutation.added?.length ?? 0)

const decodeIndices = (range?: number[]): number[] => {
  const out: number[] = []
  if (!range) return out
  let hi = -1
  for (let k = range.length - 1; k >= 0; k--) {
    const e = range[k]!
    if (e < 0) {
      hi = -1 - e
    } else {
      for (let j = hi < 0 ? e : hi; j >= e; j--) out.push(j)
      hi = -1
    }
  }
  return out
}

const applyMutation = (before: unknown[], after: unknown[], mutation: ReturnType<typeof computeMutation>) => {
  const reconstructed = before.slice()
  decodeIndices(mutation.removed).forEach(i => remove(reconstructed, before[i]!))
  const addSet = new Set(decodeIndices(mutation.added))
  const keptAfter = after.filter((_, i) => !addSet.has(i))
  decodeIndices(mutation.moved).forEach(r => insertBefore(reconstructed, keptAfter[r]!, keptAfter[r + 1]!))
  decodeIndices(mutation.added).forEach(i => insertBefore(reconstructed, after[i]!, after[i + 1]!))
  return reconstructed
}

describe('extractLongestIncreasingSubsequence', () => {
  it('should return the run-length-encoded longest increasing subsequence', () => {
    expect(extractLongestIncreasingSubsequence([10, 20, 10, 30, 20, 50])).toStrictEqual([50, 30, 20, 10])
    expect(extractLongestIncreasingSubsequence([3, 10, 2, 1, 20])).toStrictEqual([20, 10, 3])
    expect(extractLongestIncreasingSubsequence([3, 2])).toStrictEqual([2])
    expect(extractLongestIncreasingSubsequence([50, 3, 10, 7, 40, 80])).toStrictEqual([80, 40, 7, 3])
    expect(extractLongestIncreasingSubsequence([1, 2, 3])).toStrictEqual([-4, 1])
    expect(extractLongestIncreasingSubsequence([3, 2, 1])).toStrictEqual([1])
    expect(extractLongestIncreasingSubsequence([
      8, 3, 19, 7, 14, 2, 12, 5, 13, 16, 6, 11, 0, 1, 4, 17, 9, 18, 15, 10],
    )).toStrictEqual([-19, 16, -14, 12, 7, 3])
    expect(extractLongestIncreasingSubsequence([56])).toStrictEqual([56])
    expect(extractLongestIncreasingSubsequence([])).toStrictEqual([])
  })
})

describe('computeMutation', () => {
  it('should return an empty object for structurally identical arrays', () => {
    expect(computeMutation([1, 2, 3], [1, 2, 3])).toStrictEqual({})
    expect(computeMutation([], [])).toStrictEqual({})
  })

  it('should omit common from add/remove-only mutations but keep prefixL', () => {
    // A plain push() onto a non-empty array: pre reflects the untouched prefix (not 0), while
    // kept (no reordered middle) is omitted rather than an always-empty array.
    expect(computeMutation(['a', 'b', 'c'], ['a', 'b', 'c', 'x']))
      .toStrictEqual({ added: [3], pre: 3, suf: 0 })
    expect(computeMutation(['a', 'b', 'c', 'x'], ['a', 'b', 'c']))
      .toStrictEqual({ removed: [3], pre: 3, suf: 0 })
  })

  it('should compute the mutation between two random arrays', () => {
    const rand = getIntegerRand(23423, 4563, 3453, 26425)
    for (let i = 0; i < 100; i++) {
      const before = Array.from({ length: 911 }, (_, i) => i)
      const after = [...before]
      scrambleArray(rand, after)
      deleteRandomElementsFromArray(rand, after, 31)
      insertRandomElementsIntoArray(rand, after, 1000, 32)
      const mutation = computeMutation(before, after)
      const reconstructed = applyMutation(before, after, mutation)
      expect(reconstructed).toStrictEqual(after)
    }
  })

  it('matches the general diff for one moved item and for two swapped items', () => {
    const rand = getIntegerRand(9871, 2213, 771, 40981)
    for (let round = 0; round < 400; round++) {
      const before = Array.from({ length: 30 }, (_, i) => i)
      const after = [...before]
      const from = rand(after.length)
      let to = rand(after.length - 1)
      if (to >= from) to++
      const isSwap = round % 2 === 1
      if (isSwap) [after[from], after[to]] = [after[to]!, after[from]!]
      else after.splice(to, 0, after.splice(from, 1)[0]!)
      const mutation = computeMutation(before, after)
      const general = diffChangedMiddle(before, after, mutation.pre!, mutation.suf!)
      expect(applyMutation(before, after, mutation)).toStrictEqual(after)
      expect(mutation.removed).toStrictEqual(general.removed)
      expect(mutation.added).toStrictEqual(general.added)
      expect([...decodeAscendingRLE(mutation.kept)]).toStrictEqual(general.kept)
      expect(decodeIndices(mutation.moved).length).toBe(decodeIndices(general.moved).length)
      expect(decodeIndices(mutation.moved).length).toBe(isSwap && Math.abs(from - to) > 1 ? 2 : 1)
      // Only the move/swap recognition encodes kept, which then has a run beyond the shortest distances
      expect(mutation.kept!.some(v => v < 0)).toBe(Math.abs(from - to) >= (isSwap ? 3 : 2))
    }
  })

  it('should compute efficient mutation for simple removal', () => {
    const before = 'abcdefghij'.split('')
    const after = 'abdefghij'.split('')
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(1)
  })

  it('should compute efficient mutation for simple addition', () => {
    const before = 'abcdefghij'.split('')
    const after = 'abcdkefghij'.split('')
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(1)
  })

  it('should compute efficient mutation for simple change', () => {
    const before = 'abcdefghij'.split('')
    const after = 'abcdekghij'.split('')
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
  })

  it('should compute efficient mutation for reversal', () => {
    const before = 'abcdefghij'.split('')
    const after = 'jihgfedcba'.split('')
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
  })

  it('should compute efficient mutation for block replacement', () => {
    const before = 'abcdefghij'.split('')
    const after = 'abcdklmhij'.split('')
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(4)
  })

  it('should compute efficient mutation for block replacement at end', () => {
    const before = 'abcdefghij'.split('')
    const after = 'abcdefgklm'.split('')
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(4)
  })

  it('should compute efficient mutation for block replacement at start', () => {
    const before = 'abcdefghij'.split('')
    const after = 'klmdefghij'.split('')
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(4)
  })

  it('should compute efficient mutation for simple deletion of object', () => {
    const before = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const after = [...before]
    after.splice(1, 1)
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(1)
  })

  it('should compute efficient mutation for double deletion of object', () => {
    const before = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const after = [before[1]]
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
  })

  it('should compute efficient mutation for simple change of object', () => {
    const before = [{ id: 1 }, { id: 2 }]
    const after = [...before]
    after.splice(1, 1, { id: 3 })
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
  })

  it('should compute efficient mutation for moved item', () => {
    const before = [1, 2, 3, 4, 5, 6, 7]
    const after = [1, 2, 3, 7, 4, 5, 6]
    const mutation = computeMutation(before, after)
    const reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(1)
  })

  it('should compute efficient mutation for consecutive removals', () => {
    const before = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    let after = [1, 2, 3, 4]
    let mutation = computeMutation(before, after)
    let reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
    after = [4, 5, 6, 7, 8, 9]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
    after = [1, 2, 3, 4, 8, 9]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
    after = [1, 2, 3, 4, 5, 6, 7, 8]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(1)
    after = [2, 3, 4, 5, 6, 7, 8, 9]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(1)
    after = [1, 2, 4, 5, 6, 7, 8, 9]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(1)
  })

  it('should compute efficient mutation for consecutive inserts', () => {
    const before = [4, 5, 6]
    let after = [1, 2, 3, 4, 5, 6]
    let mutation = computeMutation(before, after)
    let reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
    after = [4, 5, 6, 7, 8, 9]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
    after = [4, 5, 0, 1, 2, 6]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
    after = [1, 2, 3, 4, 5, 6]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(2)
    after = [4, 5, 0, 6]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(1)
    after = [3, 4, 5, 6]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(1)
    after = [4, 5, 6, 7]
    mutation = computeMutation(before, after)
    reconstructed = applyMutation(before, after, mutation)
    expect(reconstructed).toStrictEqual(after)
    expect(mutationCount(mutation)).toBe(1)
  })

  it('should split relocations into move and new elements into add', () => {
    expect(computeMutation('abcdefghij'.split(''), 'jihgfedcba'.split('')))
      .toStrictEqual({
        removed: [],
        moved: [1, -10],
        added: [],
        kept: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
        pre: 0,
        suf: 0,
      })
    expect(computeMutation([0, 1, 2, 3, 4], [0, 3, 2, 1, 4]))
      .toStrictEqual({
        removed: [], moved: [1, 3], added: [], kept: [3, 2, 1], pre: 1, suf: 1,
      })
    expect(computeMutation('abcdefghij'.split(''), 'abcdklmhij'.split('')))
      .toStrictEqual({
        removed: [4, -7], moved: [], added: [4, -7], kept: [], pre: 4, suf: 3,
      })
    expect(computeMutation(['a', 'b', 'c'], ['c', 'X', 'a', 'b']))
      .toStrictEqual({
        removed: [], moved: [0], added: [1], kept: [2, 3, 0], pre: 0, suf: 0,
      })
    expect(computeMutation([], [1, 2, 3, 4, 5]))
      .toStrictEqual({ added: [0, -5], pre: 0, suf: 0 })
    expect(computeMutation(['k'], ['a', 'b', 'k', 'c', 'd']))
      .toStrictEqual({
        removed: [], moved: [], added: [0, -2, 3, -5], kept: [2], pre: 0, suf: 0,
      })
  })

  it('should walk multiple stable runs and multiple move runs across a full reorder', () => {
    // A pure reorder (no adds/removes) of 20 elements whose LIS (the "stable", no-move-needed
    // subsequence) consists of several separate runs, interleaved with several separate runs of
    // elements that DO need `move`. Exercises: re-syncing to the next stable run mid-scan, falling
    // off the end of the stable runs entirely (remaining kept elements all become `move`), and
    // starting a second (non-adjacent) `move` run after the first one closes.
    const before = Array.from({ length: 20 }, (_, i) => 100 + i)
    const afterPositions = [8, 3, 19, 7, 14, 2, 12, 5, 13, 16, 6, 11, 0, 1, 4, 17, 9, 18, 15, 10]
    const after: number[] = new Array(20)
    afterPositions.forEach((pos, i) => {
      after[pos] = before[i]!
    })
    expect(computeMutation(before, after)).toStrictEqual({
      removed: [],
      moved: [0, -3, 4, -7, 8, -12, 14, -16, 19],
      added: [],
      kept: afterPositions,
      pre: 0,
      suf: 0,
    })
  })
})
