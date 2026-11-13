import type { ChangeRecord } from '@/state/types/types.js'
import { describe, expect, it } from 'vitest'
import { compute, flush, state } from '@/index.js'
import { subscribeChanges } from '@/state/subscribeChanges.js'

// subscribeChanges is internal (only TrackHistory uses it), so these tests import it from source, which
//   is a different module instance than the compiled bundle that CC_BUILD aliases @/index.js to
describe.skipIf(process.env.CC_BUILD === 'true')('subscribe to changes', () => {
  it('should report path, value and oldValue per changed leaf, with done true only on the last', () => {
    const s = state({ a: 1, b: { c: 2 } })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    s.a.set(9)
    s.b.c.set(8)
    flush()
    expect(records).toStrictEqual([
      { path: ['a'], value: 9, oldValue: 1 },
      { path: ['b', 'c'], value: 8, oldValue: 2, done: true },
    ])
    unsub()
  })

  it('should not throw subscribing to changes on a container whose array field starts empty', () => {
    const s = state({ list: [] as number[] })
    const records: ChangeRecord[] = []
    expect(() => {
      subscribeChanges(s, (_v, c) => c && records.push(c))
    }).not.toThrow()
  })

  it('isolates a throw on one change record without losing already-drained sibling records', () => {
    const s = state({ a: 1, b: 2 })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => {
      if (!c) return
      if (c.path?.[0] === 'a') throw new Error('boom')
      records.push(c)
    })
    flush()
    s.a.set(9)
    s.b.set(8)

    const microtasks: (() => void)[] = []
    const originalQueueMicrotask = globalThis.queueMicrotask
    globalThis.queueMicrotask = (fn: () => void) => {
      microtasks.push(fn)
    }
    try {
      expect(() => flush()).not.toThrow()
    } finally {
      globalThis.queueMicrotask = originalQueueMicrotask
    }
    expect(records).toStrictEqual([{ path: ['b'], value: 8, oldValue: 2, done: true }])
    expect(microtasks).toHaveLength(1)
    expect(() => microtasks[0]!()).toThrow('boom')
    unsub()
  })

  it('should not report a spurious initial batch when first subscribed', () => {
    const s = state({ a: 1 })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    expect(records).toStrictEqual([])
    unsub()
  })

  it('should report push/pop as a single reorder record, not per-index copies', () => {
    const s = state({ list: [1, 2, 3] })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    s.list.push(4)
    flush()
    expect(records).toStrictEqual([{
      path: ['list'],
      reorder: true,
      done: true,
      add: [3],
      prefixL: 3,
      suffixL: 0,
      addedValues: [4],
      removedValues: [],
    }])
    records.length = 0
    s.list.pop()
    flush()
    expect(records).toStrictEqual([{
      path: ['list'],
      reorder: true,
      done: true,
      remove: [3],
      prefixL: 3,
      suffixL: 0,
      addedValues: [],
      removedValues: [4],
    }])
    unsub()
  })

  it('should report a whole-object snapshot when popping an object element, not per-field', () => {
    const s = state({ list: [{ v: 1 }, { v: 2 }] })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    s.list.pop()
    flush()
    expect(records).toStrictEqual([{
      path: ['list'],
      reorder: true,
      done: true,
      remove: [1],
      prefixL: 1,
      suffixL: 0,
      addedValues: [],
      removedValues: [{ v: 2 }],
    }])
    unsub()
  })

  it('should report an added object element as one whole-value snapshot, not per-field', () => {
    const s = state({ list: [{ v: 1 }] })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    s.list.push({ v: 2 })
    flush()
    expect(records).toStrictEqual([{
      path: ['list'],
      reorder: true,
      done: true,
      add: [1],
      prefixL: 1,
      suffixL: 0,
      addedValues: [{ v: 2 }],
      removedValues: [],
    }])
    unsub()
  })

  it('should report shift as a single reorder record covering the whole array, not per-index copies', () => {
    const s = state({ list: [10, 20, 30, 40] })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    s.list.shift()
    flush()
    expect(records).toStrictEqual([{
      path: ['list'],
      reorder: true,
      done: true,
      remove: [0],
      prefixL: 0,
      suffixL: 3,
      addedValues: [],
      removedValues: [10],
    }])
    unsub()
  })

  it('should report unshift, mid-splice, sort and reverse each as a single reorder record', () => {
    const s = state({ list: [1, 2, 3] })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    s.list.unshift(0)
    flush()
    expect(records.length).toBe(1)
    expect(records[0]!.reorder).toBe(true)
    records.length = 0

    s.list.splice(1, 1, 99)
    flush()
    expect(records.length).toBe(1)
    expect(records[0]!.reorder).toBe(true)
    records.length = 0

    s.list.sort()
    flush()
    expect(records.length).toBe(1)
    expect(records[0]!.reorder).toBe(true)
    records.length = 0

    s.list.reverse()
    flush()
    expect(records.length).toBe(1)
    expect(records[0]!.reorder).toBe(true)
    unsub()
  })

  it('should produce exactly one reorder record for a shift on a large array', () => {
    const s = state({ list: Array.from({ length: 1000 }, (_, i) => i) })
    let count = 0
    const unsub = subscribeChanges(s, (_v, c) => c && count++)
    flush()
    s.list.shift()
    flush()
    expect(count).toBe(1)
    unsub()
  })

  it('should report paths relative to the subscribed node, not the root', () => {
    const s = state({ a: 1, b: { c: 2 } })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s.b, (_v, c) => c && records.push(c))
    flush()
    s.b.c.set(9)
    flush()
    expect(records).toStrictEqual([{ path: ['c'], value: 9, oldValue: 2, done: true }])
    unsub()
  })

  // `derived.nested` must be read through its own compute() rather than accessed directly: a
  //   promoted member of a computed pojo has no producer of its own, so a plain property read
  //   would never discover `raw` as a dependency and would never fire on raw.set(). Wrapping the
  //   read in compute() makes `nestedProxy` its own reactive producer, tracking `derived` (and
  //   transitively `raw`) as real sources.
  it('reports changes for a compute() wrapping a promoted member of a computed pojo', () => {
    const raw = state(1)
    const derived = compute(() => ({ nested: { a: Number(raw) } }))
    const nestedProxy = compute(() => derived.nested)
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(nestedProxy, (_v, c) => c && records.push(c))
    flush()

    raw.set(2)
    flush()

    expect(records).toStrictEqual([{ path: ['a'], value: 2, oldValue: 1, done: true }])
    unsub()
  })

  it('should stop firing after unsubscribe', () => {
    const s = state({ a: 1 })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    s.a.set(2)
    flush()
    unsub()
    s.a.set(3)
    flush()
    expect(records.length).toBe(1)
  })

  it('should not interfere between two independent subscriptions on overlapping state', () => {
    const s = state({ list: [{ v: 1 }, { v: 2 }] })
    const recordsA: ChangeRecord[] = []
    const recordsB: ChangeRecord[] = []
    const unsubA = subscribeChanges(s, (_v, c) => c && recordsA.push(c))
    const unsubB = subscribeChanges(s, (_v, c) => c && recordsB.push(c))
    flush()
    s.list[0]!.v.set(42)
    flush()
    expect(recordsA).toStrictEqual(recordsB)
    unsubA()
    recordsB.length = 0
    s.list[1]!.v.set(43)
    flush()
    expect(recordsB.length).toBe(1)
    unsubB()
  })

  it('should keep the surviving subscription working after an aliased sibling unsubscribes', () => {
    const s = state({ list: [{ v: 1 }, { v: 2 }, { v: 3 }] })
    const recordsB: ChangeRecord[] = []
    const unsubA = subscribeChanges(s, () => {})
    const unsubB = subscribeChanges(s, (_v, c) => c && recordsB.push(c))
    flush()
    unsubA()
    s.list.shift()
    flush()
    expect(recordsB.length).toBe(1)
    expect(recordsB[0]!.reorder).toBe(true)
    unsubB()
  })

  it('should report a nested added array as one deep-destated snapshot', () => {
    const s = state({ list: [[1, 2], [3, 4]] })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    s.list.push([5, 6])
    flush()
    expect(records).toStrictEqual([{
      path: ['list'],
      reorder: true,
      done: true,
      add: [2],
      prefixL: 2,
      suffixL: 0,
      addedValues: [[5, 6]],
      removedValues: [],
    }])
    unsub()
  })

  it('should not invoke the callback when a batched set reverts a leaf to its prior value', () => {
    const s = state({ a: 1 })
    const calls: unknown[] = []
    const unsub = subscribeChanges(s, (_v, c) => calls.push(c))
    flush()
    s.a.set(2)
    s.a.set(1)
    flush()
    expect(calls).toStrictEqual([])
    unsub()
  })

  it('should report a reorder-and-remove of nested objects correctly, cleaning up removed identities', () => {
    const s = state({ list: [{ v: 1 }, { v: 2 }, { v: 3 }] })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    const [i0, i2] = [s.list[0]!, s.list[2]!]
    // reorder (swap first/last) and drop the middle element in one update
    s.list.splice(0, 3, i2, i0)
    flush()
    expect(records).toStrictEqual([{
      path: ['list'],
      reorder: true,
      done: true,
      remove: [1],
      add: [],
      common: [1, 0],
      prefixL: 0,
      suffixL: 0,
      addedValues: [],
      removedValues: [{ v: 2 }],
    }])
    records.length = 0
    // re-add a brand-new object at the removed identity's old slot; must be reported as a fresh
    // addition (its own whole-value snapshot), not confused with the removed one's stale entry
    s.list.push({ v: 99 })
    flush()
    expect(records).toStrictEqual([{
      path: ['list'],
      reorder: true,
      done: true,
      add: [2],
      prefixL: 2,
      suffixL: 0,
      addedValues: [{ v: 99 }],
      removedValues: [],
    }])
    unsub()
  })

  it('should report a brand-new array field assigned after initial subscription as a full add', () => {
    const s = state({ label: 'x', arr: undefined as number[] | undefined })
    const records: ChangeRecord[] = []
    const unsub = subscribeChanges(s, (_v, c) => c && records.push(c))
    flush()
    s.arr.set([10, 20, 30])
    flush()
    expect(records).toStrictEqual([{
      path: ['arr'],
      reorder: true,
      done: true,
      add: [0, -3],
      prefixL: 0,
      suffixL: 0,
      addedValues: [10, 20, 30],
      removedValues: [],
    }])
    unsub()
  })
})
