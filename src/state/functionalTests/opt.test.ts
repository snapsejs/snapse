import { beforeEach, describe, expect, it } from 'vitest'
import { compute, flush, peek, state, subscribe } from '@/index.js'
import { deepPeek } from '@/common/test/testUtil.js'

let s = state({
  flag: false,
  num: 2,
  str: 'loading',
  arr: ['a1', 'a2', 'a3'],
  states: {
    loading: 'x1',
    new: 'x2',
  },
})
let updates: unknown[] = []
const up = (v: unknown) => updates.push(peek(v))

describe('opt function', () => {
  beforeEach(() => {
    s = state({
      flag: false,
      num: 2,
      str: 'loading',
      arr: ['a1', 'a2', 'a3'],
      states: {
        loading: 'x1',
        new: 'x2',
      },
    })
    updates = []
  })

  it('should handle opt with boolean, static choices and no default', () => {
    const r = s.flag.opt(4)
    expect(peek(r)).toBe(undefined)
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe(undefined)
    s.flag.set(true)
    flush()
    expect(peek(r)).toBe(4)
    expect(updates).toStrictEqual([4])
    unsubscribeR()
  })

  it('should handle opt with boolean, static choices and default', () => {
    const r = s.flag.opt(4, 5)
    expect(peek(r)).toBe(5)
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe(5)
    s.flag.set(true)
    flush()
    expect(peek(r)).toBe(4)
    expect(updates).toStrictEqual([4])
    unsubscribeR()
  })

  it('should handle opt with boolean, state choice and no default', () => {
    const r = s.flag.opt(s.num)
    expect(peek(r)).toBe(undefined)
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe(undefined)
    s.flag.set(true)
    flush()
    expect(peek(r)).toBe(2)
    expect(updates).toStrictEqual([2])
    unsubscribeR()
  })

  it('should handle opt with boolean, state choices', () => {
    const r = s.flag.opt(s.num, s.str)
    expect(peek(r)).toBe('loading')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('loading')
    s.str.set('new')
    flush()
    expect(peek(r)).toBe('new')
    s.flag.set(true)
    flush()
    expect(peek(r)).toBe(2)
    s.num.set(3)
    flush()
    expect(peek(r)).toBe(3)
    expect(updates).toStrictEqual(['new', 2, 3])
    unsubscribeR()
  })

  it('should handle opt with boolean, state/static choices', () => {
    const r = s.flag.opt(s.num, 'def')
    expect(peek(r)).toBe('def')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('def')
    s.flag.set(true)
    flush()
    expect(peek(r)).toBe(2)
    s.num.set(3)
    flush()
    expect(peek(r)).toBe(3)
    expect(updates).toStrictEqual([2, 3])
    unsubscribeR()
  })

  it('should handle opt with boolean, static/state choices', () => {
    const r = s.flag.opt(42, s.str)
    expect(peek(r)).toBe('loading')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('loading')
    s.str.set('new')
    flush()
    expect(peek(r)).toBe('new')
    s.flag.set(true)
    flush()
    expect(peek(r)).toBe(42)
    expect(updates).toStrictEqual(['new', 42])
    unsubscribeR()
  })

  it('should handle opt with number, static choice and no default', () => {
    const r = s.num.opt(['l1', 'l2', 'l3'])
    expect(peek(r)).toBe('l3')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('l3')
    s.num.set(1)
    flush()
    expect(peek(r)).toBe('l2')
    s.num.set(5)
    flush()
    expect(peek(r)).toBe(undefined)
    expect(updates).toStrictEqual(['l2', undefined])
    unsubscribeR()
  })

  it('should handle opt with number, static choice and default', () => {
    const r = s.num.opt(['l1', 'l2', 'l3'], 'def')
    expect(peek(r)).toBe('l3')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('l3')
    s.num.set(1)
    flush()
    expect(peek(r)).toBe('l2')
    s.num.set(5)
    flush()
    expect(peek(r)).toBe('def')
    expect(updates).toStrictEqual(['l2', 'def'])
    unsubscribeR()
  })

  it('should handle opt with number, state choice and no default', () => {
    const r = s.num.opt(s.arr)
    expect(peek(r)).toBe('a3')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('a3')
    s.arr[2]!.set('a4')
    flush()
    expect(peek(r)).toBe('a4')
    s.num.set(1)
    flush()
    expect(peek(r)).toBe('a2')
    s.num.set(5)
    flush()
    expect(peek(r)).toBe(undefined)
    expect(updates).toStrictEqual(['a4', 'a2', undefined])
    unsubscribeR()
  })

  it('should handle opt with number, state choice and default', () => {
    const r = s.num.opt(s.arr, 'def')
    expect(peek(r)).toBe('a3')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('a3')
    s.arr[2]!.set('a4')
    flush()
    expect(peek(r)).toBe('a4')
    s.num.set(1)
    flush()
    expect(peek(r)).toBe('a2')
    s.num.set(5)
    flush()
    expect(peek(r)).toBe('def')
    expect(updates).toStrictEqual(['a4', 'a2', 'def'])
    unsubscribeR()
  })

  it('should handle opt with number, static/state choices', () => {
    const r = s.num.opt(['l1', 'l2', 'l3'], s.str)
    expect(peek(r)).toBe('l3')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('l3')
    s.num.set(1)
    flush()
    expect(peek(r)).toBe('l2')
    s.num.set(5)
    flush()
    expect(peek(r)).toBe('loading')
    expect(updates).toStrictEqual(['l2', 'loading'])
    unsubscribeR()
  })

  it('should handle opt with number, state/static choices', () => {
    const r = s.num.opt(s.arr, 'def')
    expect(peek(r)).toBe('a3')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('a3')
    s.arr[2]!.set('a4')
    flush()
    expect(peek(r)).toBe('a4')
    s.num.set(1)
    flush()
    expect(peek(r)).toBe('a2')
    s.num.set(5)
    flush()
    expect(peek(r)).toBe('def')
    expect(updates).toStrictEqual(['a4', 'a2', 'def'])
    unsubscribeR()
  })

  it('should handle opt with string, static choice and no default', () => {
    const r = s.str.opt({ loading: 'f1', new: 'f2' })
    expect(peek(r)).toBe('f1')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('f1')
    s.str.set('new')
    flush()
    expect(peek(r)).toBe('f2')
    s.str.set('bananas')
    flush()
    expect(peek(r)).toBe(undefined)
    expect(updates).toStrictEqual(['f2', undefined])
    unsubscribeR()
  })

  it('should handle opt with string, static choice and default', () => {
    const r = s.str.opt({ loading: 'f1', new: 'f2' }, 'def')
    expect(peek(r)).toBe('f1')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('f1')
    s.str.set('new')
    flush()
    expect(peek(r)).toBe('f2')
    s.str.set('bananas')
    flush()
    expect(peek(r)).toBe('def')
    expect(updates).toStrictEqual(['f2', 'def'])
    unsubscribeR()
  })

  it('should handle opt with string, state choice and no default', () => {
    const r = s.str.opt(s.states)
    expect(peek(r)).toBe('x1')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('x1')
    s.str.set('new')
    flush()
    expect(peek(r)).toBe('x2')
    s.str.set('bananas')
    flush()
    expect(peek(r)).toBe(undefined)
    expect(updates).toStrictEqual(['x2', undefined])
    unsubscribeR()
  })

  it('should handle opt with string, state choice and default', () => {
    const r = s.str.opt(s.states, 'def')
    expect(peek(r)).toBe('x1')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toBe('x1')
    s.states.loading.set('x5')
    flush()
    expect(peek(r)).toBe('x5')
    s.str.set('new')
    flush()
    expect(peek(r)).toBe('x2')
    s.str.set('bananas')
    flush()
    expect(peek(r)).toBe('def')
    expect(updates).toStrictEqual(['x5', 'x2', 'def'])
    unsubscribeR()
  })

  it('should calculate opt with a stale state', () => {
    const t = state({ x: 3, y: 5, z: true })
    const u = compute(() => t.x * t.y)
    expect(peek(u)).toBe(15)
    t.y.set(7)
    flush()
    expect(peek(u)).toBe(15)
    const v = t.z.opt(u)
    expect(peek(u)).toBe(21)
    expect(peek(v)).toBe(21)
  })

  it('should opt on empty string as boolean', () => {
    const t = state({ s: '' })
    const u = t.s.opt('a', 'b')
    const unsubscribeU = subscribe(u, up)
    expect(peek(u)).toBe('b')
    t.s.set('s')
    flush()
    expect(peek(u)).toBe('a')
    unsubscribeU()
  })

  it('should handle double chain as opt default', () => {
    const t = state({ arr: [] as number[] })
    const empty = state(true)
    const x = t.arr.toSorted().map(v => ('v' + v))
    const u = empty.opt('-', x)
    const unsubscribeU = subscribe(u, up)
    expect(deepPeek(u)).toStrictEqual('-')
    t.arr.push(1)
    empty.set(false)
    flush()
    expect(deepPeek(u)).toStrictEqual(['v1'])
    unsubscribeU()
  })

  it('should work with a non-integer selecting an array', () => {
    const t = state({ arr: [1, 2] })
    const s = state(false)
    const u = s.opt(t.arr, 'no')
    const unsubscribeU = subscribe(u, up)
    expect(deepPeek(u)).toStrictEqual('no')
    s.set(true)
    flush()
    expect(deepPeek(u)).toStrictEqual([1, 2])
    unsubscribeU()
  })

  it('should work with an array selector', () => {
    const t = state({ arr: [] as number[] })
    const u = t.arr.opt('yes', 'no')
    const unsubscribeU = subscribe(u, up)
    expect(peek(u)).toStrictEqual('no')
    t.arr.set([1])
    flush()
    expect(peek(u)).toStrictEqual('yes')
    t.arr.set([] as number[])
    flush()
    expect(peek(u)).toStrictEqual('no')
    t.arr.push(3)
    flush()
    expect(peek(u)).toStrictEqual('yes')
    t.arr.pop()
    flush()
    expect(peek(u)).toStrictEqual('no')
    unsubscribeU()
  })

  it('rejects a non-exhaustive opt object with no default', () => {
    const s = state({ v: 'ko' as 'ko' | 'sill' })
    // @ts-expect-error - missing 'sill' key and no default
    const t = s.v.opt({ ko: 1 })
    const unsubscribe = subscribe(t)
    flush()
    expect(Number(t)).toBe(1)
    unsubscribe()
  })

  it('accepts an exhaustive opt object with no default', () => {
    const s = state({ v: 'ko' as 'ko' | 'sill' })
    const t = s.v.opt({ ko: 1, sill: 2 })
    expect(peek(t)).toBe(1)
  })

  it('accepts an exhaustive opt object whose branches have different value types', () => {
    const s = state({ v: 'ko' as 'ko' | 'sill' | 'other' })
    const t = s.v.opt({ ko: 1, sill: 'two', other: () => 3 })
    expect(peek(t)).toBe(1)
  })

  it('accepts a partial opt object when a default is given', () => {
    const s = state({ v: 'ko' as 'ko' | 'sill' })
    const t = s.v.opt({ ko: 1 }, 0)
    expect(peek(t)).toBe(1)
  })
})
