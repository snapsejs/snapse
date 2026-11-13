import { beforeEach, describe, expect, it } from 'vitest'
import { compute, flush, peek, state, subscribe } from '@/index.js'
import { deepPeek } from '@/common/test/testUtil.js'

import type { State } from '@/state/types/types.js'

describe('chainedFunctions', () => {
  let updates: unknown[] = []

  const up = (v: unknown) => updates.push(deepPeek(v))

  beforeEach(() => {
    updates = []
  })

  it('should update chained states from a string state', () => {
    const s = state({
      a: 'lax',
    })
    const u = s.a.toUpperCase()
    const r = u.replace('A', 'E')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(String(s.a)).toBe('lax')
    expect(String(u)).toBe('LAX')
    expect(String(r)).toBe('LEX')
    s.a.set('laxity')
    flush()
    expect(String(s.a)).toBe('laxity')
    expect(String(u)).toBe('LAXITY')
    expect(String(r)).toBe('LEXITY');
    (s.a as string) = 'defeat'
    flush()
    expect(String(s.a)).toBe('defeat')
    expect(String(u)).toBe('DEFEAT')
    expect(String(r)).toBe('DEFEET')
    unsubscribeR()
    expect(updates).toStrictEqual(['LEXITY', 'DEFEET'])
  })

  it('should update chained states from a string state only after connection', () => {
    const s = state({
      a: 'lax',
    })
    const u = s.a.toUpperCase()
    const r = u.replace('A', 'E')
    expect(String(s.a)).toBe('lax')
    expect(String(u)).toBe('LAX')
    expect(String(r)).toBe('LEX')
    s.a.set('laxity')
    flush()
    expect(String(s.a)).toBe('laxity')
    expect(String(u)).toBe('LAX')
    expect(String(r)).toBe('LEX')
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(String(r)).toBe('LEXITY')
    expect(updates).toStrictEqual([]);
    (s.a as string) = 'defeat'
    flush()
    expect(String(s.a)).toBe('defeat')
    expect(String(u)).toBe('DEFEAT')
    expect(String(r)).toBe('DEFEET')
    unsubscribeR()
    expect(updates).toStrictEqual(['DEFEET'])
  })

  it('should update chained states from an array state', () => {
    const s = state({
      a: [1, 2],
    })
    const u = s.a.map(n => n * 2)
    const i = compute(() => u.some(v => v == 6))
    const unsubscribeI = subscribe(i, up)
    flush()
    expect(+s.a[1]!).toBe(2)
    expect(Number(u[1])).toBe(4)
    expect(i == true).toBe(false);
    (s.a as number[]) = [3, 5]
    flush()
    expect(Number(s.a[1])).toBe(5)
    expect(Number(u[1])).toBe(10)
    expect(i == true).toBe(true)
    unsubscribeI()
    expect(updates).toStrictEqual([true])
  })

  it('should update when a secondary state is used in a filter function', () => {
    const s = state({
      a: [1, 2, 3, 4, 5, 6, 7],
      b: 2,
    })
    const r = s.a.filter(n => n > s.b)
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(deepPeek(r)).toStrictEqual([3, 4, 5, 6, 7])
    s.b.set(4)
    flush()
    expect(deepPeek(r)).toStrictEqual([5, 6, 7])
    unsubscribeR()
    expect(deepPeek(updates)).toStrictEqual([[5, 6, 7]])
  })

  it('should update when a secondary state is used in an at function', () => {
    const s = state({
      a: [1, 2, 3, 4, 5, 6, 7],
      b: 2,
    })
    const r = s.a.at(s.b)
    const unsubscribeR = subscribe(r, up)
    flush()
    expect(peek(r)).toStrictEqual(3)
    s.b.set(4)
    flush()
    expect(peek(r)).toStrictEqual(5)
    unsubscribeR()
    expect(updates).toStrictEqual([5])
  })

  it('should only notify once for a doubly chained state', () => {
    const a = state([1, 2, 3, 4, 5])
    const r = a.filter(n => n & 1).map(n => n * 5)
    const unsubscribe = subscribe(r, up)
    flush()
    expect(deepPeek(r)).toStrictEqual([5, 15, 25])
    unsubscribe()
    expect(updates).toStrictEqual([])
  })

  it('should update when compute returns a stale state', () => {
    const s = state({
      a: ['a', 'b', 'c', 'd', 'e'],
      b: 2,
    })
    const u = s.a.at(s.b)
    expect(peek(u)).toBe('c')
    s.b.set(3)
    flush()
    expect(peek(u)).toBe('c')
    // compute copies u's value (states never wrap states), so v holds string | undefined.
    const v = compute(() => u) as State<string | undefined>
    const unsubscribeV = subscribe(v, up)
    expect(peek(v)).toBe('d')
    s.b.set(4)
    flush()
    expect(peek(v)).toBe('e')
    unsubscribeV()
    expect(updates).toStrictEqual(['e'])
  })

  it('should update when opt returns a stale state', () => {
    const s = state({
      a: ['a', 'b', 'c', 'd', 'e'],
      b: 2,
      c: false,
    })
    const u = s.c.opt(s.b, 0)
    const v = s.a.at(u)
    expect(peek(v)).toBe('a')
    s.b.set(3)
    flush()
    expect(peek(v)).toBe('a')
    s.c.set(true)
    flush()
    expect(peek(v)).toBe('a')
    const unsubscribeV = subscribe(v, up)
    flush()
    expect(peek(v)).toBe('d')
    unsubscribeV()
    expect(updates).toStrictEqual([])
  })

  it('should init and update correctly when using opt on a stale state', () => {
    const s = state({
      a: ['a', 'b', 'c', 'd', 'e'],
      b: 2,
      c: false,
    })
    const u = compute(() => !+s.c)
    expect(peek(u)).toBe(true)
    s.c.set(true)
    flush()
    expect(peek(u)).toBe(true)
    const v = u.opt('x', 'y')
    expect(peek(v)).toBe('y')
    s.c.set(false)
    flush()
    expect(peek(v)).toBe('y')
    const unsubscribeV = subscribe(v, up)
    flush()
    expect(peek(v)).toBe('x')
    unsubscribeV()
    expect(updates).toStrictEqual([])
  })

  it('should update when a chained function returns a state', () => {
    const s = state([0, 1, 2, 3, 4])
    const u = s.at(2)
    expect(peek(u)).toBe(2)
    const unsubscribeU = subscribe(u, up)
    flush()
    s[2]!.set(7)
    flush()
    expect(peek(u)).toBe(7)
    s.sort()
    flush()
    expect(peek(u)).toBe(3)
    unsubscribeU()
    expect(updates).toStrictEqual([7, 3])
  })

  it('should preserve or create source substates for a chained function', () => {
    const s = state({
      items: [] as string[],
      searchTerm: '',
    })
    const t = s.items.filter(item => peek(item).includes(s.searchTerm))
      .map(item => ['i', item])
    const unsubscribeT = subscribe(t, up)
    expect(peek(t)).toStrictEqual([])
    s.items.push('item1')
    flush()
    const i1 = t[0]
    expect(deepPeek(t)).toStrictEqual([['i', 'item1']])
    s.items.push('item2')
    flush()
    const i2 = t[0]
    expect(deepPeek(t)).toStrictEqual([['i', 'item1'], ['i', 'item2']])
    s.searchTerm.set('1')
    flush()
    const i3 = t[0]
    expect(deepPeek(t)).toStrictEqual([['i', 'item1']])
    expect(i1).toBe(i2)
    expect(i1).toBe(i3)
    expect(updates).toStrictEqual([[['i', 'item1']], [['i', 'item1'], ['i', 'item2']], [['i', 'item1']]])
    unsubscribeT()
  })

  it('should pass through well known symbol functions', () => {
    const s = state({
      t: 'sill',
      a: 'i',
    })
    const b = s.t.split(s.a.or(undefined) as State<string>)
    const unsubscribe = subscribe(b, () => null)
    expect(peek(b)).toStrictEqual(['s', 'll'])
    s.a.set('')
    flush()
    expect(peek(b)).toStrictEqual(['sill'])
    unsubscribe()
  })

  it('should work with toFixed on integer state', () => {
    const s = state({
      t: 3.14159,
    })
    const b = s.t.toFixed(2)
    const unsubscribe = subscribe(b, () => null)
    expect(peek(b)).toBe('3.14')
    s.t.set(2.71828)
    flush()
    expect(peek(b)).toBe('2.72')
    unsubscribe()
  })

  it('should find a raw value with includes on an array state', () => {
    const s = state({ fruits: ['banana', 'mango'] })
    expect(peek(s.fruits.includes('mango'))).toBe(true)
    expect(peek(s.fruits.includes('kiwi'))).toBe(false)
  })

  it('should find a raw value with indexOf on an array state', () => {
    const s = state({ fruits: ['banana', 'mango'] })
    expect(peek(s.fruits.indexOf('mango'))).toBe(1)
    expect(peek(s.fruits.indexOf('kiwi'))).toBe(-1)
  })

  it('should find a raw value with lastIndexOf on an array state', () => {
    const s = state({ fruits: ['banana', 'mango', 'banana'] })
    expect(peek(s.fruits.lastIndexOf('banana'))).toBe(2)
    expect(peek(s.fruits.lastIndexOf('kiwi'))).toBe(-1)
  })
})
