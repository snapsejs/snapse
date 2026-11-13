import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, component, compute, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'
import { getLightState } from '@/state/state.js'
import { getRefCount } from '@/state/common/refCountAndType.js'

const subCount = (st: unknown) => getRefCount(getLightState(st)!)
const cc = process.env.CC_BUILD === 'true'

describe('ComponentController.catch() detached-invoke cleanup', () => {
  beforeEach(() => setupDOM())

  // Reaches into getLightState/getRefCount to verify invokeDetached() (ComponentController.ts)
  //   leaves no dangling subscription - not observable via the public API, and getLightState
  //   can't resolve a State produced by the CC_BUILD-aliased @/index.js bundle anyway (a separate
  //   module realm from the source-imported internals used here).
  it.skipIf(cc)('invokes a Component fallback further up (without mounting it) once an inner '
    + 'boundary already rendered, and leaves no dangling subscription', () => {
    const g = state('leak-check')
    const base = subCount(g)
    let outerCalls = 0
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const Inner = component(() => Throwing().catch('inner handled'))
    const OuterFallback = component(() => {
      outerCalls++
      return div('outer: ', g)
    })
    SnapseRoot(Inner().catch(OuterFallback()))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('inner handled')
    expect(outerCalls).toBe(1)
    expect(subCount(g)).toBe(base)
  })

  it.skipIf(cc)('invokes a Component fallback further up (without mounting it) once an inner '
    + 'boundary already rendered on a reactive error, and leaves no dangling subscription', () => {
    const trigger = state(1)
    const risky = compute(() => {
      if (+trigger === 0) throw new Error('boom')
      return +trigger
    })
    const g = state('leak-check')
    const base = subCount(g)
    let outerCalls = 0
    const App = component(() => div('v: ', risky))
    const Inner = component(() => App().catch('inner handled'))
    const OuterFallback = component(() => {
      outerCalls++
      return div('outer: ', g)
    })
    SnapseRoot(Inner().catch(OuterFallback()))
    flush()
    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('inner handled')
    expect(outerCalls).toBe(1)
    expect(subCount(g)).toBe(base)
  })
})
