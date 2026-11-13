import { describe, expect, it } from 'vitest'
import { compute, flush, peek, state, subscribe } from '@/index.js'
import { getLightState } from '@/state/state.js'
import { MAX_ARRAY_SIZE } from '@/state/common/stateProperty.js'
import { acquireSet, releaseSet } from '@/state/transforms/Transform.js'

describe.skipIf(process.env.CC_BUILD === 'true')('Transform internals', () => {
  it('reuses and clears sets from the pool on release', () => {
    const s1 = acquireSet()
    s1.add(state(0) as never)
    releaseSet(s1)
    const s2 = acquireSet()
    expect(s2).toBe(s1)
    expect(s2.size).toBe(0)
  })

  it('returns the raw value from a compute with no state dependencies', () => {
    const u = compute(() => 42)
    expect(u).toBe(42)
  })

  it('pull-refreshes across many (array-form, 2..MAX_ARRAY_SIZE) source dependencies', () => {
    const sources = Array.from({ length: 5 }, (_, i) => state(i))
    let runs = 0
    const u = compute(() => {
      runs++
      return sources.reduce((sum, s) => sum + s, 0)
    })
    expect(peek(u)).toBe(0 + 1 + 2 + 3 + 4)
    expect(runs).toBe(1)

    flush(u)
    expect(runs).toBe(1) // nothing changed: must not recompute

    sources[3]!.set(100)
    flush(u)
    expect(peek(u)).toBe(0 + 1 + 2 + 100 + 4)
    expect(runs).toBe(2)
  })

  it('pull-refreshes across many (set-form, > MAX_ARRAY_SIZE) source dependencies', () => {
    const n = MAX_ARRAY_SIZE + 3
    const sources = Array.from({ length: n }, (_, i) => state(i))
    let runs = 0
    const u = compute(() => {
      runs++
      return sources.reduce((sum, s) => sum + s, 0)
    })
    const initial = (n * (n - 1)) / 2
    expect(peek(u)).toBe(initial)
    expect(runs).toBe(1)

    flush(u)
    expect(runs).toBe(1) // nothing changed: must not recompute

    sources[n - 1]!.set(1000)
    flush(u)
    expect(peek(u)).toBe(initial - (n - 1) + 1000)
    expect(runs).toBe(2)
  })

  it('drops stale subscriptions when a dependency set shrinks across the array/set boundary', () => {
    const n = MAX_ARRAY_SIZE + 3
    const sources = Array.from({ length: n }, (_, i) => state(i))
    const count = state(n)
    let runs = 0
    const u = compute(() => {
      runs++
      let sum = 0
      for (let i = 0; i < +count; i++) sum += sources[i]!
      return sum
    })
    const unsub = subscribe(u, () => {})
    flush()
    expect(peek(u)).toBe((n * (n - 1)) / 2)
    expect(runs).toBe(1)

    // shrink from a Set-form source list down to an array-form one
    count.set(3)
    flush()
    expect(peek(u)).toBe(0 + 1 + 2)
    expect(runs).toBe(2)

    // a dropped source changing must no longer trigger a recompute
    sources[n - 1]!.set(9999)
    flush()
    expect(runs).toBe(2)

    // grow back beyond MAX_ARRAY_SIZE and confirm the newly (re)included source is live
    count.set(n)
    flush()
    expect(runs).toBe(3)
    sources[n - 1]!.set(1234)
    flush()
    expect(peek(u)).toBe((n * (n - 1)) / 2 - (n - 1) + 1234)
    expect(runs).toBe(4)
    unsub()
  })

  it('drops stale subscriptions when a dependency set shrinks within the array-form range', () => {
    const sources = Array.from({ length: 5 }, (_, i) => state(i))
    const count = state(5)
    let runs = 0
    const u = compute(() => {
      runs++
      let sum = 0
      for (let i = 0; i < +count; i++) sum += sources[i]!
      return sum
    })
    const unsub = subscribe(u, () => {})
    flush()
    expect(peek(u)).toBe(0 + 1 + 2 + 3 + 4)
    expect(runs).toBe(1)

    count.set(2)
    flush()
    expect(peek(u)).toBe(0 + 1)
    expect(runs).toBe(2)

    // a dropped (array-form) source changing must no longer trigger a recompute
    sources[4]!.set(9999)
    flush()
    expect(runs).toBe(2)

    unsub()
  })

  it('releases all array-form source subscriptions once fully unsubscribed', () => {
    const sources = Array.from({ length: 5 }, (_, i) => state(i))
    const u = compute(() => sources.reduce((sum, s) => sum + s, 0))
    const off = subscribe(u, () => {})
    flush()
    sources.forEach(s => expect(getLightState(s)!.subs).toBeDefined())

    off()
    sources.forEach(s => expect(getLightState(s)!.subs).toBeUndefined())
  })

  it('clears the run queue after a flush so unrelated transforms are not rerun', () => {
    const a = state(0)
    const b = state(0)
    let runsA = 0
    let runsB = 0
    const ua = compute(() => {
      runsA++
      return +a
    })
    const ub = compute(() => {
      runsB++
      return +b
    })
    const unsubA = subscribe(ua, () => {})
    const unsubB = subscribe(ub, () => {})
    flush()
    expect(runsA).toBe(1)
    expect(runsB).toBe(1)

    a.set(1)
    flush()
    expect(runsA).toBe(2)
    expect(runsB).toBe(1) // ub must not be rerun by a's flush

    unsubA()
    unsubB()
  })

  it('schedules an automatic flush when a transform is queued without an explicit flush() call', async () => {
    const a = state(0)
    let runs = 0
    const u = compute(() => {
      runs++
      return +a
    })
    const unsub = subscribe(u, () => {})
    a.set(1)
    await new Promise(resolve => {
      setTimeout(resolve, 10)
    })
    expect(runs).toBe(2)
    unsub()
  })

  it('keeps one proxy state for a computed state across reruns', () => {
    const s = state(1)
    const doubled = compute(() => s * 2)
    const unsubscribe = subscribe(doubled)
    s.set(2)
    flush()
    expect(peek(doubled)).toBe(4)
    expect(getLightState(doubled)!.prx).toBe(doubled)
    unsubscribe()
  })
})
