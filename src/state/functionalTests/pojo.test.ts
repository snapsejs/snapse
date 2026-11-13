import type { State } from '@/state/types/types.js'
import { describe, expect, it } from 'vitest'
import { compute, flush, isState, peek, state, subscribe } from '@/index.js'

describe('pojo state', () => {
  it('rejects .set() on a member of a computed pojo', () => {
    const raw = state({ x: 1, y: 2 })
    const derived = compute(() => ({ x: Number(raw.x) * 10, y: Number(raw.y) * 10 }))
    const unsub = subscribe(derived)
    flush()
    const yProxy = derived.y
    expect(Number(yProxy)).toBe(20)
    raw.y.set(3)
    flush()
    expect(Number(yProxy)).toBe(30)
    expect(() => yProxy.set(999)).toThrow(TypeError)
    expect(Number(yProxy)).toBe(30)
    unsub()
  })

  it('keeps the same selected state when a computed pojo recomputes for another member', () => {
    const s = state({ item: { x: 1 }, n: 1 })
    const item = s.item
    const derived = compute(() => ({ cur: s.item, n: Number(s.n) * 10 }))
    const unsub = subscribe(derived)
    flush()
    s.n = 2 as never
    flush()
    expect(peek(derived.n)).toBe(20)
    expect(derived.cur === item).toBe(true)
    expect(peek(item.x)).toBe(1)
    unsub()
  })

  it('leaves a state selected by a computed pojo writable and untouched when the selection moves', () => {
    const s = state({ items: [{ x: 1 }, { x: 2 }], idx: 0 })
    const item0 = s.items[0]!
    const item1 = s.items[1]!
    const derived = compute(() => ({ cur: s.items[Number(s.idx)]! }))
    const unsub = subscribe(derived)
    flush()
    expect(derived.cur === item0).toBe(true)
    derived.cur.x = 5 as never
    expect(peek(item0.x)).toBe(5)
    s.idx = 1 as never
    flush()
    expect(peek(item0.x)).toBe(5)
    expect(derived.cur === item1).toBe(true)
    expect(peek(derived.cur.x)).toBe(2)
    unsub()
  })

  it('moves a computed pojo selection between computed states', () => {
    const s = state({ n: 1, first: true })
    const a = compute(() => Number(s.n) + 1)
    const b = compute(() => Number(s.n) + 2)
    const derived = compute(() => ({ cur: s.first == true ? a : b }))
    const unsub = subscribe(derived)
    flush()
    expect(peek(derived.cur)).toBe(2)
    s.first = false as never
    flush()
    expect(derived.cur === b).toBe(true)
    expect(peek(derived.cur)).toBe(3)
    unsub()
  })

  it('rejects every write to a nested member of a computed pojo, yet its recompute updates it', () => {
    const raw = state({ n: 1 })
    const derived = compute(() => ({ a: { b: Number(raw.n) * 10, list: [Number(raw.n)] } }))
    const unsub = subscribe(derived)
    flush()
    const a = derived.a
    const b = a.b
    const list = a.list
    expect(() => b.set(5)).toThrow(TypeError)
    expect(() => (a.b = 5 as never)).toThrow(TypeError)
    expect(() => delete (a as Record<string, unknown>).b).toThrow(TypeError)
    expect(() => list.push(5)).toThrow(TypeError)
    expect(() => list[0]!.set(5)).toThrow(TypeError)
    raw.n = 2 as never
    flush()
    expect(peek(b)).toBe(20)
    expect(peek(derived.a.list[0]!)).toBe(2)
    unsub()
  })

  it('rejects writing a computed pojo member through a container that holds it by reference', () => {
    const raw = state({ y: 1 })
    const derived = compute(() => ({ y: Number(raw.y) * 10 }))
    const holder = state({ p: { y: derived.y } })
    expect(() => (holder.p = { y: 5 } as never)).toThrow(TypeError)
    expect(() => (holder.p.y = 5 as never)).toThrow(TypeError)
    expect(peek(derived.y)).toBe(10)
  })

  it('leaves a previously selected state untouched when a computed pojo replaces it with a value', () => {
    const s = state({ item: { x: 1 }, selected: true })
    const item = s.item
    const derived = compute(() => ({ cur: s.selected == true ? s.item : { x: 0 } }))
    const unsub = subscribe(derived)
    flush()
    expect(derived.cur === item).toBe(true)
    s.selected = false as never
    flush()
    expect(peek(item.x)).toBe(1)
    expect(peek(derived.cur.x)).toBe(0)
    expect(() => derived.cur.x.set(3)).toThrow(TypeError)
    s.selected = true as never
    flush()
    expect(derived.cur === item).toBe(true)
    item.x = 4 as never
    expect(peek(derived.cur.x)).toBe(4)
    unsub()
  })

  it('should not be possible to update chained states through a pojo update', () => {
    const s = state(1)
    const t = compute(() => s + 1)
    const pp = state({
      p: {
        t,
      },
    })
    expect(() => pp.p = { t: 77 } as State<{ t: number }>).toThrow()
  })

  // Intended upsert semantics for `container.prop = x`: a key in x that isn't already present
  //   becomes a new member (state or plain value, whichever x supplies); a key that's already
  //   backed by an existing state has its VALUE copied into that same state, not replaced by a
  //   fresh one. The recursive merge in updateValue only checks whether the *immediate* old value
  //   `instanceof LightState` (or resolves to one via getLightState) -- it never descends into a
  //   plain nested object to discover a state embedded further down. So the moment an intermediate
  //   container hasn't itself been promoted (nothing ever read it before), the whole subtree below
  //   it gets a wholesale replace, silently severing any state nested inside -- regardless of depth.
  it('adds a genuinely new member even though it was not a state before', () => {
    const pp = state({ p: { a: 1 } as Record<string, number> })
    pp.p = { a: 1, b: 2 } as never
    expect(peek(pp.p.b)).toBe(2)
  })

  it('preserves the identity of an existing, never-promoted nested primary state', () => {
    const inner = state(5)
    const pp = state({ p: { inner } })

    pp.p = { inner: 10 } as never
    expect(peek(pp.p.inner)).toBe(10)

    inner.set(20) // if identity was preserved, this reaches the very slot pp.p.inner now reads
    expect(peek(pp.p.inner)).toBe(20)
  })

  it('preserves nested-state identity one level deeper, through updateValue\'s own recursion', () => {
    const inner = state(5)
    const outer = state({ mid: { p: { inner } } })

    void outer.mid // promote 'mid' only -- 'p' and 'inner' stay unpromoted

    outer.mid = { p: { inner: 10 } } as never
    expect(peek(outer.mid.p.inner)).toBe(10)

    inner.set(20)
    expect(peek(outer.mid.p.inner)).toBe(20)
  })

  it('allows deleting an existing POJO property, and it is reflected reactively', () => {
    const s = state<{ x?: number }>({ x: 1 })
    const c = compute(() => s.x)
    const unsubscribe = subscribe(c)
    flush()
    expect(peek(c)).toBe(1)
    delete s.x
    flush()
    expect(peek(c)).toBe(undefined)
    expect('x' in s).toBe(false)
    expect(Object.keys(s)).toStrictEqual([])
    unsubscribe()
  })

  it('is a no-op when deleting a non-existent POJO property', () => {
    const s = state<{ x?: number }>({})
    expect(() => delete s.x).not.toThrow()
    expect('x' in s).toBe(false)
  })

  it('replaces a deleted property with a plain value as a fresh member, not a merge', () => {
    const s = state<{ x?: { a: number, b: number } }>({ x: { a: 1, b: 2 } })
    delete s.x
    s.x = { a: 9 } as never
    expect(peek((s.x as { a: number }).a)).toBe(9)
    expect('b' in (s.x as object)).toBe(false)
  })

  it('deleting then assigning an existing state establishes true reference identity', () => {
    const container = state({ item: 42 })
    const s = state<{ selected?: number }>({ selected: 1 })

    delete s.selected
    s.selected = container.item as never

    expect(peek(s.selected)).toBe(42)
    container.item.set(99)
    expect(peek(s.selected)).toBe(99)
  })

  it('assigning after delete establishes a reference, unlike assigning to an existing key', () => {
    const source = state(5)

    const byValue = state({ slot: 1 })
    byValue.slot = source as never
    expect(peek(byValue.slot)).toBe(5)

    const byReference = state<{ slot?: number }>({ slot: 1 })
    delete byReference.slot
    byReference.slot = source as never
    expect(peek(byReference.slot)).toBe(5)

    source.set(20)

    expect(peek(byValue.slot)).toBe(5)
    expect(peek(byReference.slot)).toBe(20)
  })

  it('deleting a key recovers a slot that direct reassignment could not touch', () => {
    const source = state(1)
    const derivedValue = compute(() => Number(source) + 1)
    const s = state<{ a?: unknown }>({})
    s.a = derivedValue as never
    expect(() => (s.a = 5 as never)).toThrow()
    expect(() => delete s.a).not.toThrow()
    s.a = 5 as never
    expect(peek(s.a)).toBe(5)
  })

  it('should not be possible to delete a property on a derived POJO state', () => {
    const s = state({ x: 1 })
    const derived = compute(() => ({ x: s.x }))
    expect(() => delete (derived as Record<string, number>).x).toThrow()
  })

  it('is possible to reassign a POJO to a primitive', () => {
    type S = {
      a: { z: number } | undefined
      b: { z: number } | null
      c: { z: number } | number
      d: { z: number } | string
    }
    const s = state<S>({
      a: { z: 1 },
      b: { z: 1 },
      c: { z: 1 },
      d: { z: 1 },
    })
    s.a = state(undefined)
    s.b = state(null)
    s.c = 42 as State<number>
    s.d = 'sill' as State<string>
  })

  // POJO property names can collide with the library's own method names (e.g. 'set'), so POJOs
  //   only special-case the handful of keys a native JS protocol actually requires (toJSON,
  //   toString, valueOf) -- everything else, including 'set', reads as plain data.
  it('reads a "set" property as plain data, not the removed internal set() method', () => {
    const s = state({ set: 24 })
    expect(peek(s.set)).toBe(24)
    expect(Number(s.set) * 5).toBe(120)
  })

  it('coerces an ordinary POJO the same as a plain object', () => {
    const s = state({ a: 1 })
    expect(String(s)).toBe('[object Object]')
  })

  it('uses a real toString method when coercing a POJO that defines one', () => {
    const s = state({ toString: () => 'custom!' })
    expect(String(s)).toBe('custom!')
  })

  it('uses a real valueOf method when coercing a POJO that defines one', () => {
    const s = state({ valueOf: () => 42 })
    expect(Number(s) + 1).toBe(43)
  })

  it('returns raw values, typed as such, from a POJO\'s own toString and valueOf', () => {
    const s = state({ p: { v: 1, toString: () => 'p', valueOf: () => 1 } })
    expect(isState(s.p.toString())).toBe(false)
    expect(isState(s.p.valueOf())).toBe(false)
    expect(isState(s.p.v)).toBe(true)
    // @ts-expect-error - a raw string has no State methods
    void s.p.toString().set
    // @ts-expect-error - a raw number has no State methods
    void s.p.valueOf().set
  })

  // Known limitation: unlike 'toJSON' (which checks `instanceof Function` before calling the
  //   real value, and otherwise falls back to the raw object), 'toString'/'valueOf' match native
  //   coercion semantics and unconditionally try to .bind() whatever is stored under that key --
  //   there's no raw value to fall back to, since the whole point of calling .toString()/.valueOf()
  //   is to produce one. A real function, or an absent/undefined/null value, works fine; any other
  //   data shadowing the key throws merely by being read, let alone coerced.
  it('throws merely reading a "toString" property that holds non-function data', () => {
    const s = state({ toString: 5 } as { toString: unknown })
    expect(() => s.toString).toThrow(TypeError)
    expect(() => String(s)).toThrow(TypeError)
  })

  it('throws merely reading a "valueOf" property that holds non-function data', () => {
    const s = state({ valueOf: 'nope' } as { valueOf: unknown })
    expect(() => s.valueOf).toThrow(TypeError)
    expect(() => +(s as unknown as number)).toThrow(TypeError)
  })

  it('types undeclared keys as unknown, so they cannot be used without narrowing', () => {
    const s = state({ b: 'c' })
    // @ts-expect-error toLowerCase is not a member of an object state
    expect(() => s.toLowerCase()).toThrow(TypeError)
    // @ts-expect-error typo is undeclared
    expect(() => s.typo.foo).toThrow(TypeError)
    s.added = 19
    expect(peek(s.added)).toBe(19)
  })

  it('types an optional object member as either its object state or a nullish state', () => {
    const s = state<{ selected?: { r: number } }>({})
    const r = s.selected?.r
    r?.set(1)
    expect(r).toBe(undefined)
  })
})
