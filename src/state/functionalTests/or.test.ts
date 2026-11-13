import { describe, expect, it } from 'vitest'
import { flush, peek, state, subscribe } from '@/index.js'
import { deepPeek } from '@/common/test/testUtil.js'

describe('state .or chainfunction', () => {
  it('should handle the .or function correctly', () => {
    const s = state({
      a: null as null | undefined | number | string | number[] | string[],
    })
    const t = s.a.or('a')
    const unsubscribe = subscribe(t, () => null)
    expect(peek(t)).toBe('a')
    s.a.set(1)
    flush()
    expect(peek(t)).toBe(1)
    s.a.set(undefined)
    flush()
    expect(peek(t)).toBe('a')
    s.a.set('b')
    flush()
    expect(peek(t)).toBe('b')
    s.a.set('')
    flush()
    expect(peek(t)).toBe('a')
    s.a.set(['b'])
    flush()
    expect(peek(t)).toStrictEqual(['b'])
    s.a.set([])
    flush()
    expect(peek(t)).toBe('a')
    s.a.set([1])
    flush()
    expect(deepPeek(t)).toStrictEqual([1])
    unsubscribe()
  })

  it('should handle .or() and .set() on a state that varies between null and a function', () => {
    const fnA = () => 'a'
    const fnB = () => 'b'
    const s = state<{ f: (() => string) | null }>({ f: null })
    expect(peek(s.f.or(fnA))).toBe(fnA)
    s.f.set(fnA)
    flush()
    // A function is always truthy, so .or() is a pass-through once the state holds one.
    expect(peek(s.f.or(fnB))).toBe(fnA)
    // Reassigning while the state's current kind is STATE_FUNCTION exercises .set() there too.
    s.f.set(fnB)
    flush()
    expect(peek(s.f.or(fnA))).toBe(fnB)
    s.f.set(null)
    flush()
    expect(peek(s.f.or(fnA))).toBe(fnA)
  })
})
