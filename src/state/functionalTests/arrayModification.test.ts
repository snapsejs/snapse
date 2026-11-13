import { beforeEach, describe, expect, it } from 'vitest'
import { flush, state, subscribe } from '@/index.js'
import { deepPeek } from '@/common/test/testUtil.js'

describe('array modification', () => {
  let updates: unknown[] = []

  const up = (v: unknown) => updates.push(deepPeek(v))

  beforeEach(() => {
    updates = []
  })

  it('should update chained map', () => {
    const s = state([1, 2, 3, 4])
    const t = s.map(n => n * 2)
    const unsubscribeT = subscribe(t, up)
    flush()
    expect(deepPeek(s)).toStrictEqual([1, 2, 3, 4])
    expect(deepPeek(t)).toStrictEqual([2, 4, 6, 8])
    s.push(5)
    flush()
    expect(deepPeek(t)).toStrictEqual([2, 4, 6, 8, 10])
    unsubscribeT()
    expect(updates).toStrictEqual([[2, 4, 6, 8, 10]])
  })

  it('should update chained map and return spliced values', () => {
    const s = state([1, 2, 3, 4])
    const t = s.map(n => n * 2)
    const unsubscribeT = subscribe(t, up)
    flush()
    expect(deepPeek(s)).toStrictEqual([1, 2, 3, 4])
    expect(deepPeek(t)).toStrictEqual([2, 4, 6, 8])
    const spliced = s.splice(1, 2, 10, 20)
    flush()
    expect(deepPeek(spliced)).toStrictEqual([2, 3])
    expect(deepPeek(t)).toStrictEqual([2, 20, 40, 8])
    unsubscribeT()
    expect(updates).toStrictEqual([[2, 20, 40, 8]])
  })

  it('should not be allowed to update chained array values', () => {
    const s = state([1, 2, 3])
    const t = s.map(x => x * 2)
    expect(() => t[1]!.set(42)).toThrow()
  })

  it('should not be allowed to overwrite an array slot holding a chained state', () => {
    const s = state([1, 2, 3])
    const t = s.map(x => x * 2)
    // Embed a chained element directly in a plain array so the slot already holds it
    // before the `arr[i] = v` assignment is attempted.
    const u = state<unknown[]>([t[1]])
    expect(() => {
      (u as unknown[])[0] = 42
    }).toThrow()
  })

  it('should not be allowed to delete chained array values', () => {
    const s = state([1, 2, 3])
    const t = s.map(x => x * 2)
    expect(() => delete t[1]).toThrow()
  })
})
