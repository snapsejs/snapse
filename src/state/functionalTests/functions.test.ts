import { beforeEach, describe, expect, it } from 'vitest'
import { flush, peek, state, subscribe } from '@/index.js'

describe('function in state', () => {
  let updates: unknown[] = []

  const up = (v: unknown) => updates.push(String(v))

  beforeEach(() => {
    updates = []
  })

  it('should update a state containing a function', () => {
    const s = state<Function | null>(() => 5)
    const unsubscribe = subscribe(s, up)
    flush()
    expect(String(peek(s))).toBe('() => 5')
    s.set(null)
    flush()
    expect(peek(s)).toBe(null)
    unsubscribe()
    expect(updates).toStrictEqual(['null'])
  })

  it('should update a state to a function', () => {
    const s = state<null | (() => unknown)>(null)
    const unsubscribe = subscribe(s, up)
    flush()
    expect(peek(s)).toBe(null)
    s.set(() => 5)
    flush()
    expect(String(peek(s))).toBe('() => 5')
    unsubscribe()
    expect(updates).toStrictEqual(['() => 5'])
  })
})
