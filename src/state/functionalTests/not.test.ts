import { describe, expect, it } from 'vitest'
import { flush, peek, state, subscribe } from '@/index.js'

describe('state .not chainfunction', () => {
  it('should handle the .not function correctly', () => {
    const s = state({
      a: null as null | undefined | number | string | boolean,
    })
    const t = s.a.not()
    const unsubscribe = subscribe(t, () => null)
    expect(peek(t)).toBe(true)
    s.a.set(1)
    flush()
    expect(peek(t)).toBe(false)
    s.a.set(0)
    flush()
    expect(peek(t)).toBe(true)
    s.a.set('a')
    flush()
    expect(peek(t)).toBe(false)
    s.a.set('')
    flush()
    expect(peek(t)).toBe(true)
    s.a.set(undefined)
    flush()
    expect(peek(t)).toBe(true)
    s.a.set(true)
    flush()
    expect(peek(t)).toBe(false)
    unsubscribe()
  })
})
