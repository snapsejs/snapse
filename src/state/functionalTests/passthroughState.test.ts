import { describe, expect, it } from 'vitest'
import { compute, flush, peek, state, subscribe } from '@/index.js'

describe('map pass-through of an unwrapped existing state', () => {
  it('preserves identity when a map result unwraps an already-tracked, never-touched state', () => {
    const s = state([{ cx: 1 }, { cx: 2 }])
    const original = s[0]!

    // The first map wraps `item` unread (never touched, so it isn't even wrapped itself, see
    //   below); the second map's callback touches the wrapper (reading `.item`) but never reads
    //   through to any of `original`'s own properties, so `original` itself is handed back as-is.
    const wrapped = s.map(item => ({ item })).map(w => w.item)[0]!

    expect(wrapped === original).toBe(true)
    expect(peek(wrapped.cx)).toBe(1)

    original.cx = 99 as never
    flush()
    expect(peek(wrapped.cx)).toBe(99)
  })

  it('preserves identity when a map result unwraps an already-tracked, touched state', () => {
    const s = state([{ cx: 1 }, { cx: 2 }])
    const original = s[0]!
    const cx = original.cx
    cx.set(7)
    expect(peek(cx)).toBe(7)

    const wrapped = s.map(item => ({ item })).map(w => w.item)[0]!

    expect(wrapped === original).toBe(true)
    expect(peek(wrapped.cx)).toBe(7)

    original.cx = 99 as never
    flush()
    expect(peek(wrapped.cx)).toBe(99)
  })

  it('preserves identity through a longer filter/toSorted/slice/map chain', () => {
    // The shape that originally exposed this: closestCircle() in the circleDrawer example.
    const s = state({ circles: [] as { cx: number, cy: number, r: number }[] })
    s.circles.push({ cx: 10, cy: 10, r: 100 })
    s.circles.push({ cx: 20, cy: 20, r: 100 })
    const original = s.circles[0]!

    const closest = s.circles
      .map(c => ({ c, r: Math.sqrt((11 - c.cx) ** 2 + (11 - c.cy) ** 2) }))
      .filter(({ c, r }) => r <= c.r)
      .toSorted((a, b) => a.r - b.r)
      .slice(0, 1)
      .map(c => c.c)

    expect(closest[0] === original).toBe(true)
  })

  it('does not preserve identity when the callback reads a property of the returned state itself', () => {
    // `item.cx` promotes and touches a *leaf* LightState distinct from `item`'s own -- only
    //   `item` itself is exempted from the "was anything external touched" check, not its
    //   children, so this falls back to wrapping. This documents a real, known boundary of the
    //   fix rather than a requirement: reading through the candidate value before returning it
    //   disables the optimization, even though `item`'s own identity is still what's returned.
    const s = state([{ cx: 1 }, { cx: 2 }])
    const original = s[0]!

    const wrapped = s.map(item => (item.cx > 0 ? item : null))[0]!

    expect(wrapped === original).toBe(false)
    expect(peek(wrapped!.cx)).toBe(1)
  })

  it('stays reactive when the branch decision to return an existing state depends on other state', () => {
    // Even though `marker` (the returned state) is an existing, untouched-in-itself value -- the
    //   same shape that's otherwise safe to pass through -- the branch that decides whether to
    //   return it at all depends on `s.c`, which isn't the mapped element and isn't excluded from
    //   the "was anything external touched" check, so this must keep wrapping to stay reactive.
    const s = state({ arr: [1, 2, 3], c: 2 })
    const marker = state('marked')
    const x = s.arr.map(n => (n % s.c === 0 ? null : marker))
    const unsub = subscribe(x, () => {}, { deep: true })
    flush()
    expect(peek(x[2]!)).toBe('marked') // n=3, 3 % 2 !== 0

    s.c.set(3)
    flush()
    expect(peek(x[2]!)).toBe(null) // n=3, 3 % 3 === 0
    unsub()
  })

  it('stays reactive when the branch decision depends on the stateful index argument', () => {
    // The index passed to a multi-arg map callback is mutated in place (`index.set(i)`) when an
    //   element's slot survives a reorder -- unlike the element itself, it is not exempt from the
    //   "was anything external touched" check, so a callback that branches on it must keep
    //   wrapping to stay reactive to that mutation.
    const s = state(['a', 'b'])
    const marker = state('first')
    const t = s.map((c, i) => (peek(i) === 0 ? marker : null))
    const unsub = subscribe(t, () => {}, { deep: true })
    flush()
    expect(peek(t[0]!)).toBe('first')
    expect(peek(t[1]!)).toBe(null)

    // The callback branches on *position*, not on which element occupies it -- so after a
    //   reorder, position 0 must still resolve to `marker`, now via 'b' occupying that slot's
    //   reused transform, and position 1 (now 'a') must switch to null. If the index had been
    //   wrongly exempted from the "was anything touched" check, position 0's result would have
    //   stayed frozen to whichever element originally lived there instead of following position.
    s.reverse()
    flush()
    expect(peek(t[0]!)).toBe('first')
    expect(peek(t[1]!)).toBe(null)
    unsub()
  })

  it('leaves an ordinary compute() over an existing state unaffected', () => {
    // compute()'s hook takes no arguments, so it never has anything to exempt from the "was
    //   anything touched" check -- this is unchanged behavior, confirming the map-specific fix
    //   doesn't leak into compute()'s own, already-correct dependency tracking.
    const s = state([1, 2, 3])
    const t = s.map(n => ({ v: n }))
    const u = compute(() => t[1]!.v)
    const unsub = subscribe(u)
    expect(peek(u)).toBe(2)
    s[1]!.set(4)
    flush()
    expect(peek(u)).toBe(4)
    expect(t[1]!.v).not.toBe(u)
    unsub()
  })

  it('gives a detached reference to an element removed from the source array', () => {
    const s = state([1, 2, 3])
    const t = s.map(n => ({ v: n }))
    const u = t[1]!.v
    const unsub = subscribe(u)
    expect(peek(u)).toBe(2)
    s.splice(1, 1, 5)
    flush()
    expect(peek(u)).toBe(2)
    unsub()
  })

  it('lets a state pass straight through a compute with no stateful calcs', () => {
    const s = state(42)
    const t = compute(() => s)
    expect(t).toBe(s)
  })

  it('keeps .or() reactive to its own source, unlike a mapped element', () => {
    // .or()'s first hook argument is the source itself (internalFunctions.ts: 'or': target =>
    //   value => new FunctionTransform(target, orFunction, [target, value])), an ordinary,
    //   long-lived, user-mutable state -- unlike a map callback's element, nothing guarantees it
    //   won't be written to again, and orFunction's whole job is to react to that. The pass-through
    //   optimization must not apply here even though a stateful fallback makes `ls` resolvable.
    const s = state(0)
    const fallback = state('fallback-marker')
    const result = s.or(fallback)
    const unsub = subscribe(result, () => {})
    flush()
    expect(peek(result)).toBe('fallback-marker')

    s.set(5)
    flush()
    expect(peek(result)).toBe(5)
    unsub()
  })

  it('keeps a map result reactive when the callback touches the whole source array', () => {
    // The third callback argument is the *whole* source array's own LightState -- a distinct
    //   object from hookArgs[0] (the element, `v`), which is all hasNoExternalSources() exempts.
    //   Touching it (here via .length) must disable pass-through, and once wrapped, a re-run
    //   reuses the same LightState via updateValue() rather than rebuilding it, so identity stays
    //   stable even as the wrapped value transitions from an existing state to a plain number.
    const a = state([1, 2])
    const b = a.map((v, _i, arr) => (arr.length > 1 ? v : 55))
    const c = b[0]!
    const unsub = subscribe(b, () => {}, { deep: true })
    flush()
    expect(peek(c)).toBe(1)

    a.pop()
    flush()

    expect(peek(c)).toBe(55)
    expect(c === b[0]).toBe(true)
    unsub()
  })

  it('keeps reacting after a wrapped instance later touches only the pinned element', () => {
    // A single map-element transform instance can run more than once (re-triggered via .rfr()
    //   when a source it previously touched changes), and each run recomputes its own touched
    //   sources from scratch -- they can shrink between runs (this codebase already relies on
    //   that elsewhere, see compute.test.ts's "should drop stored sources when a recomputation
    //   touches no state"). Here the first run touches `external` (forcing a wrap) alongside `w`;
    //   a closure flag means the second run -- triggered by that same `external` changing --
    //   touches only `w`, which on its own would satisfy hasNoExternalSources(). The `!this.tgt`
    //   guard is what stops that from being treated as fresh-instance pass-through: once wrapped,
    //   this instance must keep going through update()/notify() on every future run, or a
    //   subscriber would never learn that `inner` moved on to a new value.
    let useCache = false
    const inner = state('v1')
    const item = state({ ref: inner })
    const s = state([item])
    const external = state(0)

    const t = s.map(w => {
      if (!useCache) {
        useCache = true
        peek(external)
      }
      return w.ref
    })
    const unsub = subscribe(t, () => {}, { deep: true })
    flush()
    expect(peek(t[0]!)).toBe('v1')

    inner.set('v2')
    external.set(1)
    flush()

    expect(peek(t[0]!)).toBe('v2')
    unsub()
  })
})
