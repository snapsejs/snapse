import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, component, flush, peek, state } from '@/index.js'
import { renderToString } from '@/server.js'
import { div } from '@/DOM/elements/DOMElements.js'
import * as utils from '@/DOM/util/nodeCount.js'

const spy = vi.spyOn(utils, 'getNodeCount')

const N = 100
const arr = [...Array(N).keys()]

// Spies cannot work in CC build mode because it will modify a different instance
describe.skipIf(process.env.CC_BUILD === 'true')('findNode call efficiency', () => {
  beforeEach(() => {
    setupDOM()
    spy.mockClear()
  })

  it('getNodeCount is not quadratic when rendering divs', () => {
    const s = state<(number | string)[]>([...arr])
    const myApp = component(() => s.map(v => div(v)))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(spy.mock.calls.length).toBeLessThanOrEqual(N * 5)
    expect(document.body.textContent).toBe('01234567891011121314151617181920212223242526272829303132333435363'
      + '7383940414243444546474849505152535455565758596061626364656667686970717273747576777879808182838485868'
      + '7888990919293949596979899')
    spy.mockClear()
    s[32]!.set('x')
    flush()
    expect(spy.mock.calls.length).toBe(0)
    expect(document.body.textContent).toBe('012345678910111213141516171819202122232425262728293031x333435363'
      + '7383940414243444546474849505152535455565758596061626364656667686970717273747576777879808182838485868'
      + '7888990919293949596979899')
  })

  it('getNodeCount is not quadratic when hydrating divs', () => {
    const s = state<(number | string)[]>([...arr])
    const myApp = component(() => s.map(v => div(v)))
    document.body.innerHTML = renderToString(myApp())
    spy.mockClear()
    SnapseRoot({ root: document.body, mode: 'hydrate' }, myApp())
    flush()
    expect(spy.mock.calls.length).toBeLessThanOrEqual(N * 5)
    expect(document.body.textContent).toBe('01234567891011121314151617181920212223242526272829303132333435363'
      + '7383940414243444546474849505152535455565758596061626364656667686970717273747576777879808182838485868'
      + '7888990919293949596979899')
    spy.mockClear()
    s[43]!.set('x')
    expect(document.body.textContent).toBe('01234567891011121314151617181920212223242526272829303132333435363'
      + '7383940414243444546474849505152535455565758596061626364656667686970717273747576777879808182838485868'
      + '7888990919293949596979899')
    flush()
    expect(spy.mock.calls.length).toBe(0)
    expect(document.body.textContent).toBe('01234567891011121314151617181920212223242526272829303132333435363'
      + '73839404142x444546474849505152535455565758596061626364656667686970717273747576777879808182838485868'
      + '7888990919293949596979899')
  })

  it('getNodeCount is not quadratic when rendering text nodes', () => {
    const s = state<(number | string)[]>([...arr])
    const myApp = component(() => s.map(v => String(v)))
    document.body.innerHTML = renderToString(myApp())
    spy.mockClear()
    SnapseRoot({ root: document.body, mode: 'hydrate' }, myApp())
    flush()
    expect(spy.mock.calls.length).toBeLessThanOrEqual(N * 3)
    expect(document.body.textContent).toBe('01234567891011121314151617181920212223242526272829303132333435363'
      + '7383940414243444546474849505152535455565758596061626364656667686970717273747576777879808182838485868'
      + '7888990919293949596979899')
    spy.mockClear()
    s[55]!.set('x')
    flush()
    expect(spy.mock.calls.length).toBe(0)
    expect(document.body.textContent).toBe('01234567891011121314151617181920212223242526272829303132333435363'
      + '73839404142434445464748495051525354x565758596061626364656667686970717273747576777879808182838485868'
      + '7888990919293949596979899')
  })

  it('getNodeCount is not quadratic when rendering components with variable children', () => {
    const s = state([...arr])
    let count = 0
    const Gloot = component(({ n }: { n: number }) => {
      count += peek(n)
      return [...Array(n).keys()]
    })
    const myApp = component(() => {
      return ['b',
        s.map(v => {
          return Gloot({ n: v & 11 })
        }), 'e']
    })
    document.body.innerHTML = renderToString(myApp())
    spy.mockClear()
    SnapseRoot({ root: document.body, mode: 'hydrate' }, myApp())
    flush()
    expect(spy.mock.calls.length).toBeLessThanOrEqual(count)
    expect(document.body.textContent).toBe('b00101200101201234567012345678012345678901234567891001234567012'
      + '345678012345678901234567891000101200101201234567012345678012345678901234567891001234567012345678012'
      + '345678901234567891000101200101201234567012345678012345678901234567891001234567012345678012345678901'
      + '234567891000101200101201234567012345678012345678901234567891001234567012345678012345678901234567891'
      + '000101200101201234567012345678012345678901234567891001234567012345678012345678901234567891000101200'
      + '1012012345670123456780123456789012345678910012345670123456780123456789012345678910001012e')
    spy.mockClear()
    s[62]!.set(63)
    flush()
    expect(spy.mock.calls.length).toBeLessThanOrEqual(count)
    expect(document.body.textContent).toBe('b0010120010120123456701234567801234567890123456789100123456701234'
      + '567801234567890123456789100010120010120123456701234567801234567890123456789100123456701234567801234'
      + '567890123456789100010120010120123456701234567801234567890123456789100123456701234567801234567890123'
      + '456789100010120010120123456701234567801234567890123456789100123456701234567801234567891001234567891'
      + '000101200101201234567012345678012345678901234567891001234567012345678012345678901234567891000101200'
      + '1012012345670123456780123456789012345678910012345670123456780123456789012345678910001012e')
    spy.mockClear()
    for (let i = N; i < 2 * N; i++) {
      s.push(i)
    }
    flush()
    expect(spy.mock.calls.length).toBeLessThanOrEqual(count)
    expect(document.body.textContent).toBe('b0010120010120123456701234567801234567890123456789100123456701234'
      + '567801234567890123456789100010120010120123456701234567801234567890123456789100123456701234567801234'
      + '567890123456789100010120010120123456701234567801234567890123456789100123456701234567801234567890123'
      + '456789100010120010120123456701234567801234567890123456789100123456701234567801234567891001234567891'
      + '000101200101201234567012345678012345678901234567891001234567012345678012345678901234567891000101200'
      + '101201234567012345678012345678901234567891001234567012345678012345678901234567891000101200101201234'
      + '567012345678012345678901234567891001234567012345678012345678901234567891000101200101201234567012345'
      + '678012345678901234567891001234567012345678012345678901234567891000101200101201234567012345678012345'
      + '678901234567891001234567012345678012345678901234567891000101200101201234567012345678012345678901234'
      + '567891001234567012345678012345678901234567891000101200101201234567012345678012345678901234567891001'
      + '234567012345678012345678901234567891000101200101201234567012345678012345678901234567891001234567012'
      + '3456780123456789012345678910001012001012e')
  })
})

// While a movable sibling has a deferred removal in flight, findNode / this.nxt resolve physical
// indices by walking siblings and skipping the not-yet-reaped nodes (liveChildAt). That walk must
// stay linear across a full reconcile -- the reconcile loop threads a forward-only cursor so each
// physical node is visited at most once, rather than re-walking from the first child per item.
describe.skipIf(process.env.CC_BUILD === 'true')('liveChildAt sibling walk is not quadratic', () => {
  let restoreNextSibling: (() => void) | undefined

  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
  })

  afterEach(() => {
    restoreNextSibling?.()
    restoreNextSibling = undefined
  })

  const countSiblingWalks = (): (() => number) => {
    const proto = global.Node.prototype
    const original = Object.getOwnPropertyDescriptor(proto, 'nextSibling')!
    let n = 0
    Object.defineProperty(proto, 'nextSibling', {
      configurable: true,
      get(this: Node) {
        n++
        return original.get!.call(this)
      },
    })
    restoreNextSibling = () => Object.defineProperty(proto, 'nextSibling', original)
    return () => n
  }

  it('inserting N fresh items into a list next to a mid-defer sibling stays O(N)', () => {
    const N = 200
    const listA = state<(number | string)[]>([...Array(20).keys()])
    const listB = state<(number | string)[]>([])
    SnapseRoot({ root: document.getElementById('app')! }, div(listA, listB))
    flush()

    const walks = countSiblingWalks()
    listA.set([0]) // defers 19 removals -> deferredNodes non-empty for this flush
    const expected = '0' + [...Array(N).keys()].map(i => `b${i}`).join('')
    listB.set([...Array(N).keys()].map(i => `b${i}`)) // N fresh creates in the trailing list
    flush()

    expect(document.getElementById('app')!.textContent).toBe(expected)
    // A quadratic re-walk would be ~N*N/2 here; the forward cursor keeps it a small multiple of N.
    expect(walks()).toBeLessThan(8 * N)
  })
})
