import { beforeEach, describe, expect, it } from 'vitest'
import type { State } from '@/state/types/types.js'
import { compute, flush, peek, state, subscribe } from '@/index.js'
import { sleep } from '@/common/test/testUtil.js'

describe('computed state', () => {
  let updates: unknown[] = []
  let computeCount = 0
  const up = (v: unknown) => updates.push(v)
  beforeEach(() => {
    computeCount = 0
    updates = []
  })

  it('should compute state and update it', () => {
    const s = state({
      a: 2,
      b: 3,
      c: {
        x: 5,
        y: 7,
      },
    })
    const u = compute(() => {
      computeCount++
      return s.a + s.b * s.c.x + s.c.y
    })
    expect(peek(u)).toBe(24)
    const unsubscribeU = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(24);
    (s.c.x as number) = 11
    flush()
    expect(peek(u)).toBe(42)
    expect(updates).toStrictEqual([42])
    unsubscribeU()
    expect(computeCount).toBe(2)
  })

  it('should pass through a state unaffected by computation', () => {
    const s = state({
      a: 2,
      b: 3,
      c: {
        x: 5,
        y: 7,
      },
    })
    const ret = s.a
    const u = compute(() => {
      computeCount++
      return ret
    })
    expect(u === s.a).toBe(true)
    expect(peek(u)).toBe(2)
    const unsubscribeU = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(2)
    s.a = 11 as State<number>
    flush(u)
    expect(peek(u)).toBe(11)
    flush()
    expect(updates).toStrictEqual([11])
    unsubscribeU()
    expect(computeCount).toBe(1)
  })

  it('should handle conditionally accessed sources', () => {
    const s = state({
      a: 2,
      b: 3,
      c: {
        x: 5,
        y: 7,
      },
    })
    const u = compute(() => {
      computeCount++
      return s.a > 3 ? s.b * s.c.x : s.c.y
    })
    expect(peek(u)).toBe(7)
    const unsubscribeU = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(7)
    s.c.y.set(23)
    flush()
    expect(peek(u)).toBe(23)
    s.b.set(17)
    flush()
    expect(peek(u)).toBe(23)
    s.a.set(11)
    flush(u)
    expect(peek(u)).toBe(85)
    flush()
    s.b.set(13)
    flush()
    expect(peek(u)).toBe(65)
    expect(updates).toStrictEqual([23, 85, 65])
    unsubscribeU()
    expect(computeCount).toBe(4)
  })

  it('should handle nested computed states', () => {
    const s = state({
      a: 2,
      b: 3,
      c: {
        x: 5,
        y: 7,
      },
    })
    const u1 = compute(() => {
      computeCount++
      return s.a + s.b
    })
    const u2 = compute(() => {
      computeCount++
      return u1 * s.c.x
    })
    expect(peek(u2)).toBe(25)
    const unsubscribeU2 = subscribe(u2, up)
    flush()
    expect(peek(u2)).toBe(25)
    s.a.set(11)
    flush()
    expect(peek(u2)).toBe(70)
    s.c.x.set(7)
    flush()
    expect(peek(u2)).toBe(98)
    s.b.set(13)
    flush()
    expect(peek(u2)).toBe(168)
    expect(updates).toStrictEqual([70, 98, 168])
    unsubscribeU2()
    expect(computeCount).toBe(7)
  })

  it('should handle conditionally accessed nested computed states', () => {
    const s = state({
      a: 2,
      b: 3,
      c: {
        x: 5,
        y: 7,
      },
    })
    const u1 = compute(() => {
      computeCount++
      return s.a > 3 ? s.b : s.c.y
    })
    const u2 = compute(() => {
      computeCount++
      return u1 * s.c.x
    })
    expect(peek(u2)).toBe(35)
    const unsubscribeU2 = subscribe(u2, up)
    flush()
    expect(peek(u2)).toBe(35)
    s.c.y.set(23)
    flush()
    expect(peek(u2)).toBe(115)
    s.b.set(17)
    flush()
    expect(peek(u2)).toBe(115)
    s.a.set(11)
    flush()
    expect(peek(u2)).toBe(85)
    s.b.set(13)
    flush()
    expect(peek(u2)).toBe(65)
    s.c.x.set(7)
    flush()
    expect(peek(u2)).toBe(91)
    expect(updates).toStrictEqual([115, 85, 65, 91])
    unsubscribeU2()
    expect(computeCount).toBe(9)
  })

  it('should handle a combination of opt and compute', () => {
    const s = state({
      flag: false,
      a: 2,
      b: 3,
      arr: [5, 7, 11, 13, 1],
    })
    const u = compute(() => {
      computeCount++
      return +s.flag ? s.a : s.b
    })
    const v = s.a.opt(s.arr, 17)
    const w = compute(() => {
      computeCount++
      return u * 5 > 15
        ? s.arr[s.a]!
        : s.arr[s.b]!
    })
    const x = compute(() => {
      computeCount++
      return v * w
    })
    const unsubscribeX = subscribe(x, up)
    flush()
    expect(peek(x)).toBe(11 * 13)
    s.b.set(4)
    flush()
    expect(peek(u)).toBe(4)
    expect(peek(v)).toBe(11)
    expect(peek(w)).toBe(11)
    expect(peek(x)).toBe(11 * 11)
    expect(updates).toStrictEqual([121])
    unsubscribeX()
    expect(computeCount).toBe(6)
  })

  it('should compute state and update it with multiple connections', () => {
    const updatesV: unknown[] = []
    const updatesW: unknown[] = []
    const s = state({
      a: 2,
      b: 3,
      c: {
        x: 5,
        y: 7,
      },
    })
    const u = compute(() => {
      computeCount++
      return s.a + s.b * s.c.x + s.c.y
    })
    expect(peek(u)).toBe(24)
    const unsubscribeU = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(24)
    s.c.x.set(11)
    flush()
    expect(peek(u)).toBe(42)
    const unsubscribeV = subscribe(u, v => updatesV.push(v))
    flush()
    s.c.x.set(13)
    flush()
    unsubscribeU()
    s.c.x.set(17)
    flush()
    unsubscribeV()
    expect(updates).toStrictEqual([42, 48])
    expect(updatesV).toStrictEqual([48, 60])
    const unsubscribeW = subscribe(u, v => updatesW.push(v))
    flush()
    s.c.x.set(19)
    flush()
    unsubscribeW()
    expect(updatesW).toStrictEqual([66])
    expect(computeCount).toBe(5)
  })

  it('should compute initial undefined value and return it', () => {
    const updatesV: unknown[] = []
    const s = state({
      a: undefined,
      b: 3,
      c: {
        x: 5,
        y: 7,
      },
    })

    const u = compute(() => {
      computeCount++
      return s.b > s.c.x ? s.c.y : s.a
    })
    expect(peek(u)).toBe(undefined)
    const unsubscribeU = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(undefined)
    s.b.set(11)
    flush()
    expect(+u).toBe(7)
    expect(updates).toStrictEqual([7])
    unsubscribeU()
    const unsubscribeV = subscribe(u, v => updatesV.push(v))
    flush()
    s.c.y.set(13)
    flush()
    unsubscribeV()
    expect(updatesV).toStrictEqual([13])
    expect(computeCount).toBe(3)
  })

  it('should compute correctly when referencing a stale state', () => {
    const s = state({
      a: undefined,
      b: 3,
      c: {
        x: 5,
        y: 7,
      },
    })
    const u = compute(() => {
      computeCount++
      return s.c.x * s.c.y
    })
    expect(peek(u)).toBe(35)
    s.c.y.set(11)
    expect(peek(u)).toBe(35)
    const v = compute(() => {
      computeCount++
      return u
    })
    const unsubscribe = subscribe(v)
    expect(peek(u)).toBe(55)
    expect(peek(v)).toBe(55)
    expect(computeCount).toBe(3)
    unsubscribe()
  })

  it('should not unnecessarily recompute a stale state', () => {
    let updateCount = 0
    const s = state({
      a: undefined,
      b: 3,
      c: {
        x: 5,
        y: 7,
      },
    })
    const u = compute(() => {
      updateCount++
      return s.c.x * s.c.y
    })
    expect(peek(u)).toBe(35)
    s.c.y.set(11)
    expect(peek(u)).toBe(35)
    const v = compute(() => u)
    const unsubscribeV = subscribe(v)
    flush()
    expect(peek(v)).toBe(55)
    const w = compute(() => u)
    const unsubscribeW = subscribe(w)
    expect(peek(w)).toBe(55)
    expect(updateCount).toBe(2)
    unsubscribeV()
    unsubscribeW()
  })

  it('should update array length when modified', () => {
    const s = state([1, 2, 3, 4])
    const u = compute(() => {
      computeCount++
      return s.length
    })
    const unsubscribeU = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(4)
    s.push(5, 6)
    flush()
    expect(peek(u)).toBe(6)
    s.pop()
    flush()
    expect(peek(u)).toBe(5)
    unsubscribeU()
    expect(updates).toStrictEqual([6, 5])
    expect(computeCount).toBe(3)
  })

  it('should update when a state accessed with unstate changes', () => {
    const s = state({ a: 11 })
    const u = compute(() => {
      computeCount++
      return peek(s.a)
    })
    const unsubscribeU = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(11)
    s.a.set(17)
    flush()
    expect(peek(u)).toBe(17)
    unsubscribeU()
    expect(updates).toStrictEqual([17])
    expect(computeCount).toBe(2)
  })

  it('should update correctly with a direct and indirect dependency', () => {
    const s = state({ a: 2, b: 3 })
    const u = compute(() => s.a * 5)
    const v = compute(() => u + s.b)
    const unsubscribeV = subscribe(v, up)
    flush()
    expect(peek(v)).toBe(13)
    s.a.set(11)
    flush()
    expect(peek(v)).toBe(58)
    unsubscribeV()
    expect(updates).toStrictEqual([58])
  })

  it('should work if compute is called inside compute', () => {
    const s = state({ a: 2, b: 3 })
    const u = compute(() => s.a * 5 * compute(() => s.b * 7))
    const unsubscribe = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(210)
    s.a.set(11)
    flush()
    expect(peek(u)).toBe(11 * 5 * 3 * 7)
    s.b.set(13)
    flush()
    expect(peek(u)).toBe(11 * 5 * 13 * 7)
    unsubscribe()
    expect(updates).toStrictEqual([11 * 5 * 3 * 7, 11 * 5 * 13 * 7])
  })

  it('should subscribe to string changes when accessing .length', () => {
    const s = state('ko')
    const t = compute(() => s.length > 0)
    const unsubscribe = subscribe(t)
    expect(peek(t)).toBe(true)
    s.set('')
    flush()
    expect(peek(t)).toBe(false)
    s.set('sill')
    flush()
    expect(peek(t)).toBe(true)
    unsubscribe()
  })

  it('should drop stored sources when a recomputation touches no state', () => {
    const trigger = state(0)
    let readTrigger = true
    const u = compute(() => (readTrigger ? peek(trigger) : 42))
    const unsubscribe = subscribe(u)
    flush()
    expect(peek(u)).toBe(0)
    readTrigger = false
    trigger.set(1)
    flush()
    expect(peek(u)).toBe(42)
    unsubscribe()
  })

  it('should drop multiple stored sources when a recomputation touches no state', () => {
    const a = state(1)
    const b = state(2)
    let useDeps = true
    const sum = compute(() => (useDeps ? +a + +b : 999))
    const unsubscribe = subscribe(sum)
    flush()
    expect(peek(sum)).toBe(3)
    useDeps = false
    a.set(5)
    flush()
    expect(peek(sum)).toBe(999)
    unsubscribe()
  })

  it('should poison the derived state when a rerun throws a non-circular error', () => {
    const s = state(0)
    let shouldThrow = false
    const u = compute(() => {
      if (shouldThrow) throw new Error('boom')
      return +s
    })
    const unsubscribe = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(0)
    shouldThrow = true
    s.set(1)
    expect(() => flush()).not.toThrow()
    expect(() => String(peek(u))).toThrow('boom')
    unsubscribe()
  })

  it('should resolve to a circular dependency when returning its own state mid-computation', () => {
    const s = state(0)
    const u: State<number> = compute(() => {
      const v = +s
      return v === 0 ? 0 : u
    })
    const unsubscribe = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(0)
    s.set(1)
    flush()
    expect(() => String(peek(u))).toThrow('circular dependency')
    unsubscribe()
  })

  it('should poison (not throw) when the very first computation throws a non-circular error', () => {
    const u = compute(() => {
      throw new Error('immediate boom')
    })
    expect(() => String(peek(u))).toThrow('immediate boom')
  })

  it('carries the original cause unchanged through a chain of computes', () => {
    const a = state(1)
    const cause = new Error('risky failed')
    const b = compute(() => {
      if (+a === 0) throw cause
      return +a * 2
    })
    const c = compute(() => +b + 1)
    const unsubscribe = subscribe(c, up)
    flush()
    expect(peek(c)).toBe(3)
    a.set(0)
    flush()
    try {
      String(peek(c))
      expect.unreachable('expected peek(c) coercion to throw')
    } catch (e) {
      expect(e).toBe(cause)
    }
    unsubscribe()
  })

  it('should resubscribe cleanly after a compute drops to zero sources and loses all subscribers', () => {
    const trigger = state(0)
    let readTrigger = true
    const u = compute(() => (readTrigger ? peek(trigger) : 42))
    const unsub1 = subscribe(u, up)
    flush()
    readTrigger = false
    trigger.set(1)
    flush()
    expect(peek(u)).toBe(42)
    unsub1()
    const unsub2 = subscribe(u, up)
    flush()
    expect(peek(u)).toBe(42)
    unsub2()
  })

  it('should refresh a compute with more than eight distinct sources on a targeted flush', () => {
    const sources = Array.from({ length: 9 }, (_, i) => state(i))
    const total = compute(() => sources.reduce((acc, s) => acc + +s, 0))
    expect(peek(total)).toBe(36)
    sources[8]!.set(100)
    flush(total)
    expect(peek(total)).toBe(128)
  })

  it('fully unsubscribes from every source once a >8-source compute has zero subscribers', () => {
    // Once a compute touches more than MAX_ARRAY_SIZE (8) distinct sources, its .srcs bookkeeping
    // switches from an array to a genuine Set -- unsubscribeSources' Set branch must actually call
    // uns() on each one, or the dead transform stays registered as a subscriber on every source
    // and gets pointlessly queued and re-run whenever any of them changes again.
    const sources = Array.from({ length: 9 }, (_, i) => state(i))
    let runs = 0
    const total = compute(() => {
      runs++
      return sources.reduce((acc, s) => acc + +s, 0)
    })
    const unsubscribe = subscribe(total)
    flush()
    expect(runs).toBe(1)
    unsubscribe()
    sources[8]!.set(100)
    flush()
    expect(runs).toBe(1)
  })

  it('refreshes a returned-but-untouched computed state before adopting its value', () => {
    // When a compute's hook returns a State/LightState directly (not its unwrapped value via
    // peek()), that state was never "touched" during evaluation, so run() must explicitly
    // refresh() it before adopting its value -- otherwise a cold (unsubscribed) computed value
    // that's stale relative to its own sources gets adopted as-is, silently propagating a stale
    // result instead of the current one.
    const trigger = state(1)
    const innerComputed = compute(() => peek(trigger) * 10)
    expect(peek(innerComputed)).toBe(10)
    trigger.set(2)
    // innerComputed is cold (no subscribers), so it hasn't caught up yet -- still shows 10 if peeked now
    const dummy = state('d')
    const outer = compute(() => {
      peek(dummy)
      return innerComputed
    })
    expect(peek(outer)).toBe(20)
  })

  it("unsubscribes from a single dropped source (update()'s own bookkeeping)", () => {
    // update() must actually call uns() on a target's sole previous source once it's no longer
    // in the new source set -- skipping it leaves the dead source subscribed forever, so a later
    // unrelated change to it still re-queues and re-runs this transform.
    let runs = 0
    const trigger = state(0)
    let readTrigger = true
    const u = compute(() => {
      runs++
      return readTrigger ? peek(trigger) : 42
    })
    const unsubscribe = subscribe(u)
    flush()
    expect(runs).toBe(1)
    readTrigger = false
    trigger.set(1)
    flush()
    expect(runs).toBe(2)
    trigger.set(2)
    flush()
    expect(runs).toBe(2)
    unsubscribe()
  })

  it('does not re-inflate source refcount when a second subscriber joins', () => {
    // sub()'s `if (rc === 0) state.tf?.subscribeSources(state)` must only re-establish a
    // target's own subscriptions to its sources on the very FIRST subscriber -- doing it again
    // for every later subscriber inflates the source's refcount beyond what corresponding
    // unsubscribes can ever bring back to zero, permanently leaking the subscription.
    let runs = 0
    const trigger = state(1)
    const u = compute(() => {
      runs++
      return peek(trigger) * 2
    })
    const unsub1 = subscribe(u)
    const unsub2 = subscribe(u)
    flush()
    expect(runs).toBe(1)
    unsub1()
    unsub2()
    trigger.set(99)
    flush()
    expect(runs).toBe(1)
  })

  it('auto-flushes a queued update without an explicit flush() call', async () => {
    // Transform.queue() must call queueFlush() itself -- without it, a queued transform just
    // sits in transformQueue forever unless something else happens to call flush() manually.
    const trigger = state(1)
    const u = compute(() => peek(trigger) * 2)
    const unsubscribe = subscribe(u)
    expect(peek(u)).toBe(2)
    trigger.set(5)
    await sleep(5)
    expect(peek(u)).toBe(10)
    unsubscribe()
  })

  it('depends on a State read through an explicit valueOf or toString call', () => {
    const s = state({ flag: false, n: 1 })
    const u = compute(() => `${s.n.valueOf() * 10} ${s.flag.toString()}`)
    const unsubscribe = subscribe(u, up)
    flush()
    s.n.set(2)
    flush()
    s.flag.set(true)
    flush()
    expect(updates).toStrictEqual(['20 false', '20 true'])
    unsubscribe()
  })

  it('depends on a POJO State read through its own toString or valueOf', () => {
    const point = (v: number) => ({
      v,
      toString() {
        return `p${v}`
      },
      valueOf() {
        return v
      },
    })
    const s = state({ p: point(1) })
    const text = compute(() => s.p.toString())
    const number = compute(() => s.p.valueOf())
    const unsubscribeText = subscribe(text, up)
    const unsubscribeNumber = subscribe(number, up)
    flush()
    s.p = point(2) as typeof s.p
    flush()
    expect(updates).toStrictEqual(['p2', 2])
    unsubscribeText()
    unsubscribeNumber()
  })
})
