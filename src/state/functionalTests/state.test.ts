import type { State } from '@/state/types/types.js'
import { describe, expect, it } from 'vitest'
import { CircularDependencyError, compute, flush, isState, peek, state, subscribe } from '@/index.js'
import { deepPeek, isAnyState, isLightState } from '@/common/test/testUtil.js'

describe('state', () => {
  it('should create and detect states', () => {
    const s = state(1)
    const t = peek(state([1]).map(v => v * 1))[0]
    const u = 1
    const v = {}
    const w = null
    expect(isState(s)).toBe(true)
    expect(isLightState(s)).toBe(false)
    expect(isAnyState(s)).toBe(true)
    expect(isState(t)).toBe(false)
    expect(isLightState(t)).toBe(true)
    expect(isAnyState(t)).toBe(true)
    expect(isState(u)).toBe(false)
    expect(isLightState(u)).toBe(false)
    expect(isAnyState(u)).toBe(false)
    expect(isState(v)).toBe(false)
    expect(isLightState(v)).toBe(false)
    expect(isAnyState(v)).toBe(false)
    expect(isState(w)).toBe(false)
    expect(isLightState(w)).toBe(false)
    expect(isAnyState(w)).toBe(false)
  })

  it('should not be possible to change the value of a derived state', () => {
    const s = state('a')
    const t = s.toUpperCase()
    expect(peek(t)).toStrictEqual('A')
    expect(() => t.set('B')).toThrow()
  })

  it('should be possible to update an untouched array', () => {
    const s = state([1, 2, 3, 4, 5])
    s[2] = 9 as State<number>
    expect(deepPeek(s)).toStrictEqual([1, 2, 9, 4, 5])
    expect(isState(peek(s)[1])).toBe(false)
    const t = s.map(v => 2 * v)
    const u = t.join('')
    expect(isState(peek(s)[1])).toBe(true)
    const unsubscribe = subscribe(u)
    expect(deepPeek(t)).toStrictEqual([2, 4, 18, 8, 10])
    s[2] = 7 as State<number>
    flush()
    expect(deepPeek(s)).toStrictEqual([1, 2, 7, 4, 5])
    expect(peek(u)).toBe('2414810')
    expect(deepPeek(t)).toStrictEqual([2, 4, 14, 8, 10])
    unsubscribe()
  })

  it('should have a stateful response for a called function', () => {
    const s = state((a: number) => a + 1)
    const t = s(1)
    const unsubscribe = subscribe(t)
    expect(isState(t)).toBe(true)
    expect(peek(t)).toBe(2)
    s.set((a: number) => a + 2)
    flush()
    expect(peek(t)).toBe(3)
    unsubscribe()
  })

  it('should create a new state when calling state on a state', () => {
    const s = state(4)
    const t = state(s)
    expect(s === t).toBe(false)
    expect(peek(t)).toBe(4)
  })

  it('should update a pojo state when assigning a pojo', () => {
    type Obj = State<{ x: number, y: number, z: number }>
    const s = state({
      m: { x: 3, y: 4, z: 5 },
    })
    const updates = [] as number[]
    const unsubscribe = subscribe(s.m.y, (v: number) => updates.push(peek(v)))
    s.m.y.set(5)
    flush()
    s.m = { x: 8, y: 9 } as Obj
    flush()
    expect(peek(s.m.x)).toBe(8)
    const t = state({ y: 1, z: 2 })
    s.m = t as Obj
    flush()
    expect(peek(s.m.y)).toBe(1)
    expect(updates).toStrictEqual([5, 9, 1])
    unsubscribe()
  })

  it('should replace a pojo state with a non-pojo value', () => {
    const s = state({ m: { x: 1, y: 2 } })
    expect(peek(s.m.x)).toBe(1)
    s.m = 5 as unknown as typeof s.m
    expect(peek(s.m)).toBe(5)
  })

  it('should work with optional chaining', () => {
    const s = state({
      a: undefined,
      b: [{ x: 3 }],
    })
    const c = s.b[1]
    expect(c?.x).toBe(undefined)
  })

  it('should throw when deleting a primary array element', () => {
    const s = state({ b: [1] })
    expect(() => delete (s.b as unknown as unknown[])[1]).toThrow()
  })

  it('should trigger dependencies when setting an array', () => {
    const s = state({
      arr: [] as { x: number }[],
      q: 8,
    })
    const c = compute(() => s.arr[0]?.x)
    const unsubscribe = subscribe(c)
    expect(peek(c)).toBe(undefined)
    s.arr.set([{ x: 5 }])
    flush()
    expect(peek(c)).toBe(5)
    unsubscribe()
  })

  it('should apply a recomputed value that is a plain non-state value', () => {
    const s = state({ arr: [] as { x: number }[] })
    const c = compute(() => {
      const b = s.arr[0]
      return b ? 'yes' : 'no'
    })
    const unsubscribe = subscribe(c)
    expect(peek(c)).toBe('no')
    s.arr.set([{ x: 5 }])
    flush()
    expect(peek(c)).toBe('yes')
    unsubscribe()
  })

  it('should pick up a newly added reference', () => {
    const s = state({ arr: [] as { x: number }[] })
    const c = compute(() => {
      return s.arr[0] && (s.arr[0].x > 2) ? 'yes' : 'no'
    })
    const unsubscribe = subscribe(c)
    expect(peek(c)).toBe('no')
    s.arr.set([{ x: 5 }])
    flush()
    expect(peek(c)).toBe('yes')
    const ref = s.arr[0]!
    s.arr.pop()
    expect(peek(c)).toBe('yes')
    flush()
    ref.x.set(1)
    flush()
    expect(peek(c)).toBe('no')
    unsubscribe()
  })

  it('should trigger dependencies when updating an array', () => {
    const s = state({
      arr: [{ x: 3 }],
    })
    const c = compute(() => s.arr[0]?.x)
    const unsubscribe = subscribe(c)
    expect(peek(c)).toBe(3)
    s.arr[0] = { x: 5 } as State<{ x: number }>
    flush()
    expect(peek(c)).toBe(5)
    unsubscribe()
  })

  it('should not be confusing when conditionally accessing array item', () => {
    const s = state({
      arr: [] as { x: number }[],
    })
    const c = compute(() => s.arr[0]?.x)
    const unsubscribe = subscribe(c)
    expect(peek(c)).toBe(undefined)
    s.arr.push({ x: 5 })
    flush()
    expect(peek(c)).toBe(5)
    s.arr.pop()
    flush()
    expect(peek(c)).toBe(undefined)
    unsubscribe()
  })

  it('should trigger dependencies when assigning to a new array index', () => {
    const s = state({ arr: [] as number[] })
    const c = compute(() => s.arr[23])
    const unsubscribe = subscribe(c)
    expect(peek(c)).toBe(undefined)
    s.arr[23] = 4 as State<number>
    flush()
    expect(peek(c)).toBe(4)
    unsubscribe()
  })

  it('should trigger dependencies when extending a POJO', () => {
    type MyState = {
      a: number
      b?: number
    }
    const s = state<MyState>({
      a: 4,
    })
    const c = compute(() => s?.b)
    const unsubscribe = subscribe(c)
    expect(peek(c)).toBe(undefined)
    s.b = state(5)
    flush()
    expect(peek(c)).toBe(5)
    unsubscribe()
  })

  it('should be possible to access a property on a nullish state', () => {
    type MyState = { n: { v: number } | null }
    const s = state<MyState>({ n: null })
    const v = s.n?.v
    expect(peek(v)).toBe(undefined)
    const u = { ...s?.n }
    expect(u).toStrictEqual({})
    s.n.set({ v: 3 })
    const w = s.n?.v
    expect(peek(w)).toBe(3)
    const z = { ...s.n }
    expect(deepPeek(z)).toStrictEqual({ v: 3 })
  })

  it('should handle circular references', () => {
    const s = state<number []>([])
    const t = compute(() => s[0]! + 1)
    const unsubscribe = subscribe(t)
    s.push(t)
    flush()
    expect(() => +peek(t)!).toThrow(CircularDependencyError)
    unsubscribe()
  })

  it('resolves a diamond dependency to one correct recomputation, not a stale one', () => {
    // x reads y before l1, so a naive push-driven re-run of x (l1's update, then later y's) could
    //   land x on a transient value computed before y catches up. connect()'s eager refresh of a
    //   touched source is what prevents that: reading y inside x's own recompute pulls y fresh
    //   first, so x's single run already reflects both l1 and l2 -- it never needs a second pass.
    const l1 = state(1)
    const l2 = state(1)
    let xRuns = 0
    const y = compute(() => Number(l2) * 10)
    const x = compute(() => {
      xRuns++
      return Number(l1) + Number(y)
    })
    const unsubscribe = subscribe(x)

    xRuns = 0
    l1.set(2)
    l2.set(2)
    flush()

    expect(peek(x)).toBe(22)
    expect(xRuns).toBe(1)
    unsubscribe()
  })

  // A recomputed node is tagged with the global peekVersion(), not the precise max of its own
  //   sources -- coarser, but only ever applied when the node actually reran (and connect() had
  //   already forced that node's own sources maximally fresh first), so it can't make a dormant
  //   reader downstream think an ancestor moved when it didn't.
  it('does not let unrelated version churn spuriously retrigger a dormant reader', () => {
    const l = state(1)
    const u = state('unrelated')
    let midRuns = 0
    const mid = compute(() => {
      midRuns++
      return +l * 2
    })
    let dormantRuns = 0
    const dormant = compute(() => {
      dormantRuns++
      return +mid + 100
    })
    const unsub = subscribe(mid, () => {})
    flush(dormant) // sync dormant to mid's current state once, then go quiet
    midRuns = 0
    dormantRuns = 0

    for (let i = 0; i < 5; i++) {
      u.set(`unrelated-${i}`)
      flush()
    }
    expect(midRuns).toBe(0)

    flush(dormant)
    expect(dormantRuns).toBe(0)
    unsub()
  })

  it('still propagates a genuine change exactly once through interleaved unrelated churn', () => {
    const l = state(1)
    const u = state('unrelated')
    let midRuns = 0
    const mid = compute(() => {
      midRuns++
      return +l * 2
    })
    let dormantRuns = 0
    const dormant = compute(() => {
      dormantRuns++
      return +mid + 100
    })
    const unsub = subscribe(mid, () => {})
    flush(dormant)
    midRuns = 0
    dormantRuns = 0

    u.set('u1')
    flush()
    l.set(2)
    u.set('u2')
    flush()
    u.set('u3')
    flush()

    flush(dormant)
    expect(midRuns).toBe(1)
    expect(dormantRuns).toBe(1)
    expect(peek(dormant)).toBe(104)
    unsub()
  })

  // A staleness check on a transform can find it dirty and cache that verdict for the current
  //   epoch before the transform actually reruns. Once it does rerun (here, as a side effect of
  //   `mid` pulling `upstream` fresh), the cached "dirty as of this epoch" verdict is not
  //   invalidated even though the transform's own version now matches the epoch -- so a second,
  //   later check within the very same epoch (no new write in between) incorrectly reports it dirty
  //   again and reruns it for nothing.
  it('does not rerun a transform that has already caught up within the same epoch', () => {
    const leaf = state(1)
    let upstreamRuns = 0
    const upstream = compute(() => {
      upstreamRuns++
      return Number(leaf) * 2
    })
    let midRuns = 0
    const mid = compute(() => {
      midRuns++
      return Number(upstream) + 1
    })

    leaf.set(2)
    flush(mid)
    expect(Number(mid)).toBe(5)

    upstreamRuns = 0
    midRuns = 0

    flush(mid) // nothing changed since the previous flush(mid) -- must be a no-op
    expect(midRuns).toBe(0)
    expect(upstreamRuns).toBe(0)
  })

  it('should support getOwnPropertyDescriptor and valueOf on a primitive state', () => {
    const s = state(5)
    expect(Object.getOwnPropertyDescriptor(s, 'toFixed')).toBeUndefined()
    expect(s.valueOf()).toBe(5)
  })

  it('returns raw values, typed as such, from toString and valueOf', () => {
    const s = state({ str: 'a', num: 5, big: 5n, bool: true, arr: [1, 2] })
    const raw = [
      s.str.toString(), s.str.valueOf(), s.num.toString(), s.num.valueOf(), s.big.toString(),
      s.big.valueOf(), s.bool.toString(), s.bool.valueOf(), s.arr.toString(),
    ]
    expect(raw.some(isState)).toBe(false)
    // @ts-expect-error - a raw boolean has no State methods
    void s.bool.valueOf().set
    // @ts-expect-error - a raw number has no State methods
    void s.num.valueOf().set
    // @ts-expect-error - a raw string has no State methods
    void s.str.toString().set
    // @ts-expect-error - a raw string has no State methods
    void s.arr.toString().set
  })

  it('should not throw accessing .toString/.valueOf on a state holding null or undefined', () => {
    const n = state(null)
    expect(n.toString).toBeUndefined()
    expect(n.valueOf).toBeUndefined()
    const u = state(undefined)
    expect(u.toString).toBeUndefined()
    expect(u.valueOf).toBeUndefined()
  })

  it('should not throw accessing .toString/.valueOf on a POJO that shadows them with undefined', () => {
    const s = state({ toString: undefined, valueOf: undefined } as {
      toString?: () => string
      valueOf?: () => unknown
    })
    expect(s.toString).toBeUndefined()
    expect(s.valueOf).toBeUndefined()
  })

  it('upserts a live State POJO that is assigned into a never-promoted destination', () => {
    const s = state({ selected: { name: '' }, people: [{ name: 'Max' }] })
    s.selected = s.people[0] as never
    s.selected.name = 'EDITED' as never
    expect(peek(s.people[0]!.name)).toBe('Max')
  })

  it('copies correctly once the destination has been promoted first', () => {
    const s = state({ selected: { name: '' }, people: [{ name: 'Max' }] })
    void s.selected.name
    s.selected = s.people[0] as never
    s.selected.name = 'EDITED' as never
    expect(peek(s.people[0]!.name)).toBe('Max')
  })
})
