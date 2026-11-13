import { describe, expect, it } from 'vitest'
import { peek, state } from '@/index.js'

describe('serialize state', () => {
  it('should be able to serialize a state', () => {
    const s = state({
      a: 1,
      b: 'test',
      c: {
        d: 2,
        toJSON: 'possible',
      },
      e: [3, 4],
      f: null,
      g: true,
    })

    const serialized = JSON.stringify(s)
    expect(serialized).toBe('{"a":1,"b":"test","c":{"d":2,"toJSON":"possible"},"e":[3,4],"f":null,"g":true}')

    const s2 = state(JSON.parse(serialized))
    const serialized2 = JSON.stringify(s2)
    expect(serialized2).toBe(serialized)
  })

  it('should use a real toJSON method when serializing a wrapped value that has one', () => {
    const s = state({
      when: { toJSON: () => '2024-01-01' } as unknown as { toJSON: unknown },
    })
    // Force the nested value to become a state proxy before stringifying, since only
    // proxied values expose the internal toJSON handler being tested here.
    expect(peek(s.when)).toBeTruthy()
    expect(JSON.stringify(s)).toBe('{"when":"2024-01-01"}')
  })

  it('should fall back to the raw value when serializing a nullish wrapped value', () => {
    const s = state({ a: 1, when: null as unknown as Date })
    expect(peek(s.when)).toBe(null)
    expect(JSON.stringify(s)).toBe('{"a":1,"when":null}')
  })
})
