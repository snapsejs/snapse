import { describe, expect, it } from 'vitest'
import { flush, state, subscribe } from '@/index.js'
import { getLightState } from '@/state/state.js'
import { MAX_ARRAY_SIZE } from '@/state/common/stateProperty.js'
import { Transform } from '@/state/transforms/Transform.js'

describe.skipIf(process.env.CC_BUILD === 'true')('subscription store promotion', () => {
  const subStore = (s: unknown) => getLightState(s)!.subs

  it('stores a single subscriber as a bare value (not an array or set)', () => {
    const s = state(0)
    subscribe(s)
    const store = subStore(s)
    expect(store).toBeInstanceOf(Transform)
    expect(Array.isArray(store)).toBe(false)
    expect(store).not.toBeInstanceOf(Set)
  })

  it('stores 2..MAX_ARRAY_SIZE subscribers as an array', () => {
    const s = state(0)
    for (let i = 0; i < MAX_ARRAY_SIZE; i++) subscribe(s)
    const store = subStore(s)
    expect(Array.isArray(store)).toBe(true)
    expect((store as Transform[]).length).toBe(MAX_ARRAY_SIZE)
  })

  it('promotes the array to a Set once it exceeds MAX_ARRAY_SIZE', () => {
    const s = state(0)
    for (let i = 0; i < MAX_ARRAY_SIZE + 1; i++) subscribe(s)
    const store = subStore(s)
    expect(store).toBeInstanceOf(Set)
    expect((store as Set<Transform>).size).toBe(MAX_ARRAY_SIZE + 1)
  })

  it('notifies every subscriber across the array→set boundary', () => {
    const s = state(0)
    const n = MAX_ARRAY_SIZE + 5
    let calls = 0
    for (let i = 0; i < n; i++) subscribe(s, () => calls++)
    s.set(1)
    flush()
    expect(calls).toBe(n)
  })

  it('reuses the same Set instance when adding subscribers beyond MAX_ARRAY_SIZE', () => {
    const s = state(0)
    const unsubs: (() => void)[] = []
    for (let i = 0; i < MAX_ARRAY_SIZE + 1; i++) unsubs.push(subscribe(s))
    const store1 = subStore(s)
    expect(store1).toBeInstanceOf(Set)
    unsubs.push(subscribe(s))
    const store2 = subStore(s)
    expect(store2).toBe(store1)
    unsubs.forEach(u => u())
  })

  it('unsubscribes correctly while the store is a Set', () => {
    const s = state(0)
    const n = MAX_ARRAY_SIZE + 5
    const unsubs = Array.from({ length: n }, () => {
      let hits = 0
      const off = subscribe(s, () => hits++)
      return { off, get: () => hits }
    })

    unsubs.slice(0, 3).forEach(u => u.off())
    expect((subStore(s) as Set<Transform>).size).toBe(n - 3)

    const before = unsubs.map(u => u.get())
    s.set(1)
    flush()

    unsubs.forEach((u, i) => {
      expect(u.get() - before[i]!).toBe(i < 3 ? 0 : 1)
    })
  })
})
