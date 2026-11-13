import { beforeEach, describe, expect, it } from 'vitest'
import { compute, flush, isState, peek, state, subscribe } from '@/index.js'
import { deepPeek, isLightState } from '@/common/test/testUtil.js'
import type { State } from '@/state/types/types.js'

describe('map on state', () => {
  let updates: unknown[] = []
  const updates2: unknown[] = []

  const up = (v: unknown) => updates.push(String(deepPeek(v)))

  beforeEach(() => {
    updates = []
  })

  it('should not trigger updates on array when children are modified', () => {
    const s = state([1, 2, 3, 4])
    const updatesS: string[] = []
    const upS = (v: unknown) => updatesS.push(String(deepPeek(v)))
    const t = s.map(n => n * 2)
    const unsubscribeS = subscribe(s, upS)
    const unsubscribeT = subscribe(t, up)
    const unsubscribe2 = subscribe(t[2]!, v => updates2.push(String(v)))
    flush()
    expect(deepPeek(t)).toStrictEqual([2, 4, 6, 8])
    expect(deepPeek(s)).toStrictEqual([1, 2, 3, 4])
    s[2]!.set(7)
    flush()
    expect(deepPeek(t)).toStrictEqual([2, 4, 14, 8])
    expect(deepPeek(s)).toStrictEqual([1, 2, 7, 4])
    s.push(5)
    flush()
    expect(deepPeek(t)).toStrictEqual([2, 4, 14, 8, 10])
    expect(deepPeek(s)).toStrictEqual([1, 2, 7, 4, 5])
    unsubscribeS()
    unsubscribeT()
    unsubscribe2()
    expect(updatesS).toStrictEqual(['1,2,7,4,5'])
    expect(updates).toStrictEqual(['2,4,14,8,10'])
    expect(updates2).toStrictEqual(['14'])
  })

  it('should recalculate map when the function is updated', () => {
    const s = state([3, 4, 5, 6])
    let mapFunctionsCalled = 0
    const mapFunction = state((n: number) => {
      mapFunctionsCalled++
      return n * 2
    })
    const t = s.map(mapFunction)
    const u = t.join(' ')
    const unsubscribeU = subscribe(u, v => up(v))
    flush()
    expect(peek(u)).toStrictEqual('6 8 10 12')
    expect(mapFunctionsCalled).toBe(4)
    mapFunction.set((n: number) => n * 3)
    flush()
    expect(peek(u)).toStrictEqual('9 12 15 18')
    unsubscribeU()
    expect(updates).toStrictEqual([
      '9 12 15 18',
    ])
  })

  it('should have a stateful map index argument', () => {
    const s = state(['b', 'd', 'c', 'a'])
    let mapFunctionsCalled = 0
    const mapFunction = state((c: string, i: number) => {
      mapFunctionsCalled++
      return `${c}${i}`
    })
    const t = s.map(mapFunction)
    const u = t.join(' ')
    const unsubscribeU = subscribe(u, v => up(v))
    flush()
    expect(peek(u)).toStrictEqual('b0 d1 c2 a3')
    expect(mapFunctionsCalled).toBe(4)
    s.sort()
    flush()
    // 'c' keeps index 2, so only the other three are mapped again
    expect(mapFunctionsCalled).toBe(7)
    expect(peek(u)).toStrictEqual('a0 b1 c2 d3')
    unsubscribeU()
    expect(updates).toStrictEqual([
      'a0 b1 c2 d3',
    ])
  })

  it('maps undefined elements added after the previous length', () => {
    const s = state<unknown[]>([])
    const t = s.map(v => peek(v) ?? 'none')
    const unsubscribe = subscribe(t.join(','))
    s.set([undefined, 'a'])
    flush()
    expect(peek(t.join(','))).toBe('none,a')
    unsubscribe()
  })

  it('maps each new element once and keeps results aligned through random edits', () => {
    let seed = 7
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    let next = 0
    const s = state(Array.from({ length: 30 }, () => `v${next++}`))
    let mapped = 0
    const t = s.map(v => {
      mapped++
      return `${v}!`
    })
    const joined = t.join(' ')
    const unsubscribe = subscribe(joined)
    const newStates = (count: number) => Array.from({ length: count }, () => state(`v${next++}`))
    const edits: ((elements: State<string>[]) => void)[] = [
      elements => elements.splice(rand(elements.length + 1), 1),
      elements => elements.splice(rand(elements.length + 1), 1 + rand(4)),
      elements => elements.splice(rand(elements.length + 1), 0, ...newStates(1 + rand(3))),
      elements => elements.splice(rand(elements.length + 1), 0, ...elements.splice(rand(elements.length), 1)),
      elements => {
        const last = elements.length - 1
        if (last > 0) [elements[0], elements[last]] = [elements[last]!, elements[0]!]
      },
      elements => elements.reverse(),
      elements => elements.sort(() => rand(3) - 1),
      elements => elements.splice(0, elements.length, ...newStates(rand(5))),
    ]
    for (let round = 0; round < 300; round++) {
      const elements = Array.from({ length: s.length }, (_, i) => s[i]!)
      const before = new Set(elements)
      edits[rand(edits.length)]!(elements)
      const added = elements.filter(e => !before.has(e)).length
      mapped = 0
      s.set(elements)
      flush()
      expect(mapped).toBe(added)
      expect(peek(joined)).toBe(elements.map(e => `${peek(e)}!`).join(' '))
    }
    unsubscribe()
  })

  it('should not call map function for unchanged values', () => {
    const s = state([1, 2, 3, 4])
    const updatesS = []
    const upS = (v: unknown) => updatesS.push(String(v))
    let mapFunctionsCalled = 0
    const t = s.map(n => {
      mapFunctionsCalled++
      return n * 2
    })
    const unsubscribeS = subscribe(s, upS)
    const unsubscribeT = subscribe(t, up)
    flush()
    s.push(5)
    flush()
    unsubscribeS()
    unsubscribeT()
    expect(mapFunctionsCalled).toBe(5)
  })

  it('should not call map function for unchanged moved values', () => {
    const s = state(['b', 'd', 'c', 'a'])
    let mapFunctionsCalled = 0
    const t = s.map((c: string) => {
      mapFunctionsCalled++
      return `${c}`
    })
    const u = t.join(' ')
    const unsubscribeU = subscribe(u, v => up(v))
    flush()
    expect(peek(u)).toStrictEqual('b d c a')
    expect(mapFunctionsCalled).toBe(4)
    s.sort()
    flush()
    expect(mapFunctionsCalled).toBe(4)
    expect(peek(u)).toStrictEqual('a b c d')
    unsubscribeU()
    expect(updates).toStrictEqual([
      'a b c d',
    ])
  })

  it('should not be possible to change a derived array', () => {
    const s = state([1, 2, 3, 4])
    const t = s.map(n => n * 2)
    expect(() => t[2]!.set(14)).toThrow()
    expect(() => t[2]! = 14 as State<number>).toThrow()
  })

  it('should not be possible to mutate a derived array in place', () => {
    const s = state([1, 2, 3, 4])
    const t = s.map(n => n * 2)
    expect(() => t.push(99)).toThrow()
    expect(() => t.pop()).toThrow()
    expect(() => t.splice(0, 1)).toThrow()
  })

  it('should not pass index unless the callback takes that argument', () => {
    const s = state([1, 2, 3, 4])
    let argsPassed = 0
    function mapFunc(n: number) {
      argsPassed += arguments.length
      return n * 2
    }
    const t = s.map(mapFunc)
    const u = t.join('')
    expect(peek(u)).toBe('2468')
    expect(argsPassed).toBe(4)
  })

  it('should not return states unnecessarily', () => {
    const s = state([1, 2, 3, 4])
    const t = s.map(() => 'ko')
    expect(peek(t).some(v => isState(v))).toBe(false)
  })

  it('should generate LightState mapped values', () => {
    const s = state([1, 2, 3, 4])
    const t = s.map(n => n * 2)
    for (const item of peek(t)) {
      expect(isState(item)).toBe(false)
      expect(isLightState(item)).toBe(true)
    }
  })

  it('should pass a stateful index that updates in place when an element moves', () => {
    const s = state(['b', 'd', 'c', 'a'])
    let aIndex: State<number> | undefined
    const t = s.map((c, i) => {
      if (String(c) === 'a') aIndex = i
      return c
    })
    expect(peek(aIndex!)).toBe(3)
    const unsubscribeT = subscribe(t, () => {})
    const indexUpdates: number[] = []
    const unsubscribeIndex = subscribe(aIndex!, v => indexUpdates.push(v as number))
    s.sort()
    flush()
    expect(peek(aIndex!)).toBe(0)
    unsubscribeIndex()
    unsubscribeT()
    expect(deepPeek(t)).toStrictEqual(['a', 'b', 'c', 'd'])
    expect(indexUpdates).toStrictEqual([0])
  })

  it('should pass the reactive source array as the third callback argument', () => {
    const s = state([10, 20, 30])
    let capturedArray: unknown
    const t = s.map((n, i, array) => {
      capturedArray = array
      return n * 2
    })
    flush()
    expect(isState(capturedArray)).toBe(true)
    expect(capturedArray).toBe(s)
    expect(deepPeek(capturedArray)).toStrictEqual([10, 20, 30])
    expect(deepPeek(t)).toStrictEqual([20, 40, 60])
  })

  it('should allow calling state methods on the value passed to the map callback', () => {
    const s = state([1])
    let capturedValue: State<number> | undefined
    const t = s.map(n => {
      capturedValue = n
      return peek(n) * 2
    })
    expect(deepPeek(t)).toStrictEqual([2])
    capturedValue!.set(10)
    flush()
    expect(peek(s[0]!)).toBe(10)
  })

  it('preserves the identity of a State wrapped in a mapped plain object', () => {
    const s = state([{ cx: 1 }, { cx: 2 }])
    const original = s[0]!
    const wrapped = s.map(item => ({ item }))[0]!.item

    expect(wrapped === original).toBe(true)
    expect(peek(wrapped.cx)).toBe(1)
    original.cx = 99 as never
    flush()
    expect(peek(wrapped.cx)).toBe(99)
  })

  it('isolates a misuse throw (non-array replacement) without aborting the rest of the flush pass', () => {
    // This is a misuse-detection invariant (like the DEV-mode throws elsewhere in the codebase),
    // not a user-derivation error - it isn't poisoned (see Transform.flush()'s per-item isolation),
    // but a throw here also must not block unrelated queued work in the same flush pass, and must
    // still surface loudly rather than being silently dropped.
    const s = state([1, 2, 3])
    const t = s.map(n => n * 2)
    const unsubscribeT = subscribe(t, () => {})
    flush()

    const other = state(0)
    let seen: number | undefined
    const unsubscribeOther = subscribe(other, v => {
      seen = v
    })

    const microtasks: (() => void)[] = []
    const originalQueueMicrotask = globalThis.queueMicrotask
    globalThis.queueMicrotask = (fn: () => void) => {
      microtasks.push(fn)
    }
    try {
      s.set(5 as unknown as number[])
      other.set(1)
      expect(() => flush()).not.toThrow()
    } finally {
      globalThis.queueMicrotask = originalQueueMicrotask
    }
    expect(seen).toBe(1)
    expect(microtasks).toHaveLength(1)
    expect(() => microtasks[0]!()).toThrow(TypeError)
    unsubscribeT()
    unsubscribeOther()
  })

  it('poisons only the failing element when one mapper callback throws', () => {
    const s = state([1, 2, 3])
    const t = s.map(n => {
      if (+n === 2) throw new Error('bad element')
      return n * 2
    })
    const unsubscribe = subscribe(t, () => {})
    flush()
    expect(peek(t[0]!)).toBe(2)
    expect(() => String(peek(t[1]!))).toThrow('bad element')
    expect(peek(t[2]!)).toBe(6)
    unsubscribe()
  })

  it('should update when an untouched returned value changes', () => {
    const s = state([1, 2, 3])
    const t = s.map(n => ({ v: n }))
    const u = compute(() => t[1]!.v)
    const unsubscribe = subscribe(u)
    expect(peek(u)).toBe(2)
    s[1]!.set(4)
    flush()
    expect(peek(u)).toBe(4)
    unsubscribe()
  })

  it('should not update a detached reference', () => {
    const s = state([1, 2, 3])
    const t = s.map(n => ({ v: n }))
    const u = t[1]!.v
    const unsubscribe = subscribe(u)
    expect(peek(u)).toBe(2)
    s.splice(1, 1, 5)
    flush()
    expect(peek(u)).toBe(2)
    unsubscribe()
  })

  // LightState.get wraps an element of a computed array in a state without a transform when it is
  //   first read, so nothing rejects writing to it.
  it('rejects .set() on an element of a mapped array', () => {
    const s = state([1, 2, 3])
    const t = s.map(() => 'x')
    expect(() => t[1]!.set('y')).toThrow(TypeError)
  })
})
