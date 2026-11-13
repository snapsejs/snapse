import type { State } from '@/state/types/types.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { flush, peek, state, subscribe } from '@/index.js'

describe('subscribe', () => {
  let updates = <unknown[]>[]
  const up = (v: unknown) => updates.push(v)
  beforeEach(() => {
    updates = []
  })

  it('should not update the subscribe callback until state changes', () => {
    const s = state({
      a: 'lax',
    })
    const unsubscribeR = subscribe(s.a, up)
    flush()
    s.a.set('pax')
    flush()
    expect(updates).toStrictEqual(['pax'])
    unsubscribeR()
  })

  it('should work with multiple connections', () => {
    const changesS: string[] = []
    const changesT: string[] = []
    const s = state({
      a: 'lax',
    })
    const unsubscribeR = subscribe(s.a, up)
    flush()
    expect(peek(s.a)).toBe('lax')
    s.a.set('box')
    expect(peek(s.a)).toBe('box')
    const unsubscribeS = subscribe(s.a, v => changesS.push(peek(v)))
    flush()
    s.a.set('fox')
    flush()
    unsubscribeR()
    s.a.set('pax')
    flush()
    unsubscribeS()
    const unsubscribeT = subscribe(s.a, v => changesT.push(peek(v)))
    flush()
    s.a.set('max')
    flush()
    expect(updates).toStrictEqual(['box', 'fox'])
    expect(changesS).toStrictEqual(['fox', 'pax'])
    expect(changesT).toStrictEqual(['max'])
    unsubscribeT()
  })
})

describe('subscribe deep', () => {
  it('should fire a deep subscribe callback when a nested leaf changes, unlike a plain subscribe', () => {
    const s = state({ mid: { leaf: 1 } })
    let deepCount = 0
    let shallowCount = 0
    const unsubDeep = subscribe(s, () => {
      deepCount++
    }, { deep: true })
    const unsubShallow = subscribe(s, () => {
      shallowCount++
    })
    flush()
    s.mid.leaf.set(2)
    flush()
    expect(deepCount).toBe(1)
    expect(shallowCount).toBe(0)
    expect(peek(s.mid.leaf)).toBe(2)
    unsubDeep()
    unsubShallow()
  })

  it('should fire a deep subscribe callback on nested array element mutation and push', () => {
    const s = state({ list: [{ v: 1 }, { v: 2 }] })
    let count = 0
    const unsub = subscribe(s, () => {
      count++
    }, { deep: true })
    flush()
    s.list[0]!.v.set(9)
    flush()
    expect(count).toBe(1)
    s.list.push({ v: 3 })
    flush()
    expect(count).toBe(2)
    expect(peek(s.list[0]!.v)).toBe(9)
    expect(peek(s.list).length).toBe(3)
    unsub()
  })

  it('should rescan children on structural reassignment and observe newly introduced keys', () => {
    type Obj = State<Record<string, number>>
    const s = state({ mid: { a: 1 } as Record<string, number> })
    let count = 0
    const unsub = subscribe(s, () => {
      count++
    }, { deep: true })
    flush()
    s.mid = { a: 1, b: 2 } as unknown as Obj
    flush()
    expect(count).toBe(1)
    count = 0
    s.mid.b!.set(3)
    flush()
    expect(count).toBe(1)
    expect(peek(s.mid.b!)).toBe(3)
    unsub()
  })

  it('should treat STATE_OBJECT children as atomic leaves', () => {
    const inner = new Map([['x', 1]])
    const s = state({ obj: inner })
    let count = 0
    const unsub = subscribe(s, () => {
      count++
    }, { deep: true })
    flush()
    inner.set('x', 2)
    flush()
    expect(count).toBe(0)
    s.obj = new Map([['x', 3]]) as unknown as State<Map<string, number>>
    flush()
    expect(count).toBe(1)
    unsub()
  })

  it('should share intermediate SubscribeTransforms between overlapping deep subscriptions', () => {
    const s = state({ mid: { leaf: 1 } })
    let count1 = 0
    let count2 = 0
    const unsub1 = subscribe(s, () => {
      count1++
    }, { deep: true })
    const unsub2 = subscribe(s.mid, () => {
      count2++
    }, { deep: true })
    flush()
    s.mid.leaf.set(2)
    flush()
    expect(count1).toBe(1)
    expect(count2).toBe(1)
    unsub1()
    s.mid.leaf.set(3)
    flush()
    expect(count1).toBe(1)
    expect(count2).toBe(2)
    unsub2()
  })

  it('should not crash or hang on a cyclic self-reference, and should still track sibling fields', () => {
    const raw = { sibling: 1 } as { sibling: number, self?: unknown }
    raw.self = raw
    const s = state(raw)
    let count = 0
    const unsub = subscribe(s, () => {
      count++
    }, { deep: true })
    flush()
    expect(count).toBe(0)
    s.sibling.set(2)
    flush()
    expect(count).toBe(1)
    expect(peek(s.sibling)).toBe(2)
    unsub()
  })

  it('should behave like a non-deep subscribe when the root is a primitive', () => {
    const s = state(1)
    const updates: number[] = []
    const unsub = subscribe(s, v => updates.push(v), { deep: true })
    flush()
    s.set(2)
    flush()
    expect(updates).toStrictEqual([2])
    unsub()
  })

  it('should skip a key that reports itself enumerable but is absent on lookup', () => {
    // A container whose own-keys trap disagrees with its has-trap: the key is listed by
    // Object.keys() but "in" reports it missing, exercising the deep-subscribe scan's guard
    // against such an inconsistent container.
    const inconsistent = new Proxy({}, {
      ownKeys: () => ['ghost'],
      has: () => false,
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true, value: undefined }),
      get: () => undefined,
    }) as Record<string, number>
    const s = state({ mid: inconsistent })
    let count = 0
    const unsub = subscribe(s, () => {
      count++
    }, { deep: true })
    flush()
    expect(count).toBe(0)
    unsub()
  })
})

describe('subscribe to aliased and reordered members', () => {
  it('should preserve element identity through a reorder, not copy values between slots', () => {
    const s = state({ list: [{ v: 1 }, { v: 2 }, { v: 3 }] })
    const survivor = s.list[1]
    flush()
    s.list.shift()
    flush()
    expect(s.list[0]).toBe(survivor)
    expect(peek(survivor!.v)).toBe(2)
  })

  // Unlike a state computed from another, `derived.raw = raw` preserves `raw`'s own live identity
  //   (upsertProperty's undestated store), so `peek(derived.raw)` always reflects `raw`'s current
  //   value -- but `derived` itself is an ordinary primary state, never produced by a Transform, so
  //   it has no `.tf` to discover or relay a dependency on `raw`. Subscribing to `derived` never
  //   reaches `raw`, in either assignment order: aliasing a state as a plain property is not the
  //   same as computing from it.
  it('does not fire a subscription when a state aliased as a plain property changes', () => {
    const raw = state(1)
    const derived = state({} as { raw?: State<number> })
    derived.raw = raw
    const records: unknown[] = []
    const unsub = subscribe(derived, v => records.push(v))
    flush()

    raw.set(2)
    flush()

    expect(records).toStrictEqual([])
    expect(peek(derived.raw!)).toBe(2)
    unsub()
  })

  it('does not fire a subscription when a state is aliased as a plain property after subscribing', () => {
    const raw = state(1)
    const derived = state({} as { raw?: State<number> })
    const records: unknown[] = []
    const unsub = subscribe(derived, v => records.push(v))
    flush()

    derived.raw = raw
    flush()
    records.length = 0

    raw.set(2)
    flush()

    expect(records).toStrictEqual([])
    expect(peek(derived.raw!)).toBe(2)
    unsub()
  })

  // A `{ deep: true }` subscription doesn't rely on AncestorTransform at all -- SubscribeTransform
  //   walks the container's own keys directly (getSubState) and adds whatever LightState it finds
  //   there, aliased or promoted, as one of its own sources. So aliasing an existing state as a
  //   plain property DOES become a live dependency under deep subscribe, in either assignment order
  //   (SubscribeTransform re-walks its keys, via `pendingSelf`, whenever the container itself changes).
  it('fires a deep subscription when a state aliased as a plain property changes', () => {
    const raw = state(1)
    const derived = state({} as { raw?: State<number> })
    derived.raw = raw
    const records: unknown[] = []
    const unsub = subscribe(derived, v => records.push(v), { deep: true })
    flush()

    raw.set(2)
    flush()

    expect(records.length).toBeGreaterThan(0)
    expect(peek(derived.raw!)).toBe(2)
    unsub()
  })

  it('fires a deep subscription when a state is aliased as a plain property after subscribing', () => {
    const raw = state(1)
    const derived = state({} as { raw?: State<number> })
    const records: unknown[] = []
    const unsub = subscribe(derived, v => records.push(v), { deep: true })
    flush()

    derived.raw = raw
    flush()
    records.length = 0

    raw.set(2)
    flush()

    expect(records.length).toBeGreaterThan(0)
    expect(peek(derived.raw!)).toBe(2)
    unsub()
  })
})
