import { describe, expect, it } from 'vitest'
import { peek, state } from '@/index.js'

describe('unpack state', () => {
  it('should be able to unpack a state array', () => {
    const s = state({
      arr: [1, 2],
    })

    const [a, b] = s.arr
    expect(peek(a)).toBe(1)
    expect(peek(b)).toBe(2)
  })

  it('should be able to unpack a state pojo', () => {
    const s = state({
      obj: {
        a: 1,
        b: 2,
      },
    })

    const { a, b } = s.obj
    expect(peek(a)).toBe(1)
    expect(peek(b)).toBe(2)
  })
})
