import { describe, expect, it } from 'vitest'
import { peek, state } from '@/index.js'

describe('peek', () => {
  it('should extract value from states', () => {
    const s = state([1, 2, 3, 4])
    const t = s.map(n => n * 2)
    const f = () => 42
    expect(peek(s[2])).toBe(3)
    expect(peek(peek(s)[2])).toBe(3)
    expect(peek(t[2])).toBe(6)
    expect(peek(peek(t)[2])).toBe(6)
    expect(peek(1)).toBe(1)
    expect(peek(undefined)).toBe(undefined)
    expect(peek(null)).toBe(null)
    expect(peek({ a: 1 })).toStrictEqual({ a: 1 })
    expect(peek('hello')).toBe('hello')
    expect(peek(true)).toBe(true)
    expect(peek(f)).toBe(f)
  })
})
