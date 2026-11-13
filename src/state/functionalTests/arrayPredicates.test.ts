import { beforeEach, describe, expect, it } from 'vitest'
import { flush, peek, state, subscribe } from '@/index.js'
import { deepPeek } from '@/common/test/testUtil.js'

// The predicate for a truthiness-consuming array method receives element states and may naturally call
// reactive methods on them (e.g. value.includes(...)), which return a State. JS ToBoolean never unwraps an
// object, so without special handling every such element would count as truthy. These tests pin the
// unwrap behaviour for filter/some/every/find/findIndex/findLast/findLastIndex, and confirm the
// value-returning methods (map/sort/reduce) are untouched.

describe('array predicate unwrapping', () => {
  let s: ReturnType<typeof makeState>
  const makeState = () => state({ fruits: ['banana', 'mango', 'blueberry', 'melon'] })

  beforeEach(() => {
    s = makeState()
  })

  it('filters on a predicate that returns a State', () => {
    expect(deepPeek(s.fruits.filter(fruit => fruit.includes('go')))).toEqual(['mango'])
  })

  it('filters on a predicate stored in state that returns a State', () => {
    const t = state({
      fruits: ['banana', 'mango', 'blueberry', 'melon'],
      customFilter: (fruit: string) => fruit.includes('go'),
    })
    expect(deepPeek(t.fruits.filter(t.customFilter))).toEqual(['mango'])
  })

  it('supports some/every/find/findIndex with State-returning predicates', () => {
    expect(peek(s.fruits.some(fruit => fruit.includes('go')))).toBe(true)
    expect(peek(s.fruits.every(fruit => fruit.includes('an')))).toBe(false)
    expect(peek(s.fruits.find(fruit => fruit.includes('go')))).toBe('mango')
    expect(peek(s.fruits.findIndex(fruit => fruit.includes('go')))).toBe(1)
    expect(peek(s.fruits.findLast(fruit => fruit.includes('an')))).toBe('mango')
  })

  it('still keeps elements when the predicate genuinely returns a truthy primitive', () => {
    expect(deepPeek(s.fruits.filter(fruit => fruit.length > 5)))
      .toEqual(['banana', 'blueberry'])
  })

  it('re-filters when the source array changes', () => {
    const updates: unknown[] = []
    const filtered = s.fruits.filter(fruit => fruit.includes('an'))
    subscribe(filtered, v => updates.push(deepPeek(v)))
    flush()
    expect(deepPeek(filtered)).toEqual(['banana', 'mango'])
    s.fruits.push('orange')
    flush()
    expect(deepPeek(filtered)).toEqual(['banana', 'mango', 'orange'])
    expect(updates[updates.length - 1]).toEqual(['banana', 'mango', 'orange'])
  })

  it('re-filters when a touched element value changes', () => {
    const t = state({ people: [{ name: 'ada' }, { name: 'bob' }, { name: 'alan' }] })
    const updates: unknown[] = []
    const filtered = t.people.filter(person => person.name.includes('a'))
    subscribe(filtered, v => updates.push(deepPeek(v)))
    flush()
    expect(deepPeek(filtered)).toEqual([{ name: 'ada' }, { name: 'alan' }])
    t.people[0]!.name.set('zzz')
    flush()
    expect(deepPeek(filtered)).toEqual([{ name: 'alan' }])
    expect(updates[updates.length - 1]).toEqual([{ name: 'alan' }])
  })

  it('leaves map results as states (value-returning method, untouched)', () => {
    const upper = s.fruits.map(fruit => fruit.toUpperCase())
    expect(deepPeek(upper)).toEqual(['BANANA', 'MANGO', 'BLUEBERRY', 'MELON'])
  })

  it('leaves sort comparators untouched (ToNumber coerces state results)', () => {
    const sorted = s.fruits.toSorted((a, b) => a.length - b.length)
    expect(deepPeek(sorted)).toEqual(['mango', 'melon', 'banana', 'blueberry'])
  })
})
