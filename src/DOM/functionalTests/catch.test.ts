import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'
import { circle, svg } from '@/DOM/elements/SVGElements.js'
import { sleep } from '@/common/test/testUtil.js'
import type { RenderError } from '@/DOM/util/RenderError.js'

describe('ComponentController.catch()', () => {
  beforeEach(() => setupDOM())

  it('renders the fallback when a component throws during its own construction', () => {
    const Throwing = component(() => {
      throw new Error('boom')
    })
    SnapseRoot(Throwing().catch('handled'))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('handled')
  })

  it('leaves a non-throwing component with .catch() set completely unaffected', () => {
    const Fine = component(() => div('fine'))
    SnapseRoot(Fine().catch('unused fallback'))
    flush()
    expect(document.body.textContent).toBe('fine')
  })

  it('injects renderError only when the fallback is itself a Component', () => {
    let seen: RenderError | undefined
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const Fallback = component(({ renderError }) => {
      seen = renderError
      return div('fallback')
    })
    SnapseRoot(Throwing().catch(Fallback()))
    flush()
    expect(document.body.textContent).toBe('fallback')
    expect(seen).toBeInstanceOf(Error)
    expect(seen!.cause).toBeInstanceOf(Error)
    expect((seen!.cause as Error).message).toBe('boom')
  })

  it('lets a throw bubble past a plain element and an uninvolved component to the nearest .catch()', () => {
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const Passthrough = component(() => div('wrap:', Throwing()))
    const Ancestor = component(() => div(Passthrough()))
    SnapseRoot(Ancestor().catch('handled'))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('handled')
  })

  it('tears down already-rendered earlier siblings when a later sibling throws', () => {
    const Good = component(() => div('good'))
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const Ancestor = component(() => [Good(), Throwing()])
    SnapseRoot(Ancestor().catch('handled'))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('handled')
  })

  it('tears down a never-reached later sibling whose own children were never created', () => {
    // Unlike the earlier-siblings case above, NeverReached sits *after* the throwing sibling, so
    // addChildren's loop never calls its own create() at all - its `this.c` stays undefined
    // (rather than an empty/partial array), exercising removeChildren's `this.c ?? []` fallback.
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const NeverReached = component(() => div('never'))
    const Ancestor = component(() => [Throwing(), NeverReached()])
    SnapseRoot(Ancestor().catch('handled'))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('handled')
  })

  it('lets the nearest (self) .catch() win over an outer one, even through .or()', async () => {
    const NullReturning = component(async () => null)
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const MyApp = component(() =>
      NullReturning().or(Throwing().catch('handled 1')).catch('handled 2'))
    SnapseRoot(MyApp())
    flush()
    expect(document.body.textContent).toBe('handled 1')
    await sleep(2)
    flush()
    expect(document.body.textContent).toBe('handled 1')
  })

  it('bubbles past .or() to an outer .catch() when the .or() fallback has none of its own', () => {
    const NullReturning = component(async () => null)
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const MyApp = component(() =>
      NullReturning().or(Throwing()).catch('handled 2'))
    SnapseRoot(MyApp())
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('handled 2')
  })

  it('reset() re-attempts the original render after the underlying condition is fixed', () => {
    let shouldThrow = true
    let captured: RenderError | undefined
    const Flaky = component(() => {
      if (shouldThrow) throw new Error('boom')
      return div('fixed')
    })
    const Fallback = component(({ renderError }) => {
      captured = renderError
      return div('fallback')
    })
    SnapseRoot(Flaky().catch(Fallback()))
    flush()
    expect(document.body.textContent).toBe('fallback')

    shouldThrow = false
    captured!.reset()
    expect(document.body.textContent).toBe('fixed')
  })

  it('reset() inserts the retried content in its own slot, not after later siblings', () => {
    let shouldThrow = true
    let captured: RenderError | undefined
    const Flaky = component(() => {
      if (shouldThrow) throw new Error('boom')
      return div('fixed')
    })
    const Fallback = component(({ renderError }) => {
      captured = renderError
      return div('fallback')
    })
    SnapseRoot(div(Flaky().catch(Fallback()), 'tail'))
    flush()
    expect(document.body.textContent).toBe('fallbacktail')

    shouldThrow = false
    captured!.reset()
    expect(document.body.textContent).toBe('fixedtail')
  })

  it('produces a fresh RenderError if a reset() retry throws again', () => {
    let failCount = 0
    let captured: RenderError | undefined
    const Flaky = component(() => {
      failCount++
      throw new Error(`boom ${failCount}`)
    })
    const Fallback = component(({ renderError }) => {
      captured = renderError
      return div('fallback:', (renderError!.cause as Error).message)
    })
    SnapseRoot(Flaky().catch(Fallback()))
    flush()
    expect(document.body.textContent).toBe('fallback:boom 1')

    captured!.reset()
    expect(document.body.textContent).toBe('fallback:boom 2')
  })

  it('calls a plain-function fallback with the RenderError and mounts its return value', () => {
    const Throwing = component(() => {
      throw new Error('boom')
    })
    SnapseRoot(Throwing().catch(e => `handled: ${(e.cause as Error).message}`))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('handled: boom')
  })

  it('calls a State<function> fallback with the RenderError and mounts its return value', () => {
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const fallback = state(() => 'handled via state')
    SnapseRoot(Throwing().catch(fallback))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('handled via state')
  })

  it('mounts a State-wrapped non-function fallback normally, not as a callable', () => {
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const fallback = state('static fallback')
    SnapseRoot(Throwing().catch(fallback))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('static fallback')
  })

  it('recognizes a lazily-refreshed State<function> fallback that is stale until forced to '
    + 'refresh', () => {
    // fallback is eagerly computed to the string 'not yet' while trigger is truthy; trigger.set(0)
    //   below makes the *fresh* value a function, but nothing observes/refreshes fallback in
    //   between - resolveCallableFallback() must force a refresh before checking typeof, or it
    //   would see the stale non-function value and wrongly treat this as a non-callable fallback.
    //
    // The fallback function reads e.cause (only available if it's genuinely called as
    //   `callable(renderError)`) rather than just returning a fixed string, specifically so this
    //   test fails if resolveCallableFallback's refresh() is ever removed: without it, this
    //   fallback gets misclassified as non-callable and mounted as a plain reactive child instead
    //   - which happens to *also* end up invoked (StateController refreshes independently, then
    //   auto-wraps the now-visible function as an anonymous component body) but with `e` bound to
    //   that anonymous component's own (empty) props object, not the RenderError - so e.cause is
    //   undefined and this throws, rather than silently passing with a coincidentally-matching
    //   plain string return value.
    const trigger = state(1)
    const fallback = compute(() =>
      (+trigger === 0 ? (e: RenderError) => `handled: ${(e.cause as Error).message}` : 'not yet'))
    trigger.set(0)
    const Throwing = component(() => {
      throw new Error('boom')
    })
    SnapseRoot(Throwing().catch(fallback))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('handled: boom')
  })

  it('rethrows to an outer .catch() by default, invoking (but not mounting) its function fallback', () => {
    const calls: RenderError[] = []
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const Inner = component(() => Throwing().catch('inner handled'))
    SnapseRoot(Inner().catch((e: RenderError) => {
      calls.push(e)
      return 'outer handled'
    }))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('inner handled')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.fallbackRendered).toBe(true)
  })

  it('does not invoke an outer .catch() at all once an inner one calls stopPropagation()', () => {
    let outerCalls = 0
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const Inner = component(() => Throwing().catch((e: RenderError) => {
      e.stopPropagation()
      return 'inner handled'
    }))
    SnapseRoot(Inner().catch(() => {
      outerCalls++
      return 'outer handled'
    }))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('inner handled')
    expect(outerCalls).toBe(0)
  })

  it('does not mount a non-callable outer fallback once an inner boundary already rendered one', () => {
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const Inner = component(() => Throwing().catch('inner handled'))
    SnapseRoot(Inner().catch('outer handled'))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('inner handled')
  })

  it('resets the original inner component via .reset() captured from an outer boundary', () => {
    let shouldThrow = true
    let capturedByOuter: RenderError | undefined
    const Flaky = component(() => {
      if (shouldThrow) throw new Error('boom')
      return div('fixed')
    })
    const Inner = component(() => Flaky().catch('inner handled'))
    SnapseRoot(Inner().catch((e: RenderError) => {
      capturedByOuter = e
      return 'outer handled'
    }))
    flush()
    expect(document.body.textContent).toBe('inner handled')

    shouldThrow = false
    capturedByOuter!.reset()
    expect(document.body.textContent).toBe('fixed')
  })

  it('leaves fallbackRendered false and lets an outer .catch() replace the UI when the inner '
    + 'fallback function returns nullish', () => {
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const Inner = component(() => Throwing().catch(() => null))
    SnapseRoot(Inner().catch((e: RenderError) => {
      expect(e.fallbackRendered).toBe(false)
      return 'outer handled'
    }))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('outer handled')
  })

  it('leaves fallbackRendered false and lets an outer .catch() replace the UI when the inner '
    + 'fallback component renders nullish', () => {
    const Throwing = component(() => {
      throw new Error('boom')
    })
    const NullFallback = component(() => null)
    const Inner = component(() => Throwing().catch(NullFallback()))
    SnapseRoot(Inner().catch((e: RenderError) => {
      expect(e.fallbackRendered).toBe(false)
      return 'outer handled'
    }))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('outer handled')
  })
})

describe('.catch() directly on an element or root (construction-time)', () => {
  beforeEach(() => setupDOM())

  it('replaces the whole element (not just its children) when a child throws during construction', () => {
    const Throwing = component(() => {
      throw new Error('boom')
    })
    SnapseRoot(div(Throwing()).catch('Error'))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('Error')
    expect(document.querySelector('div')).toBeNull()
  })

  it('self-catches a poisoned attribute on the same element, replacing the whole element', () => {
    const badTitle = compute(() => {
      throw new Error('bad title')
    })
    SnapseRoot(div({ title: badTitle }, 'content').catch('Error'))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('Error')
    expect(document.querySelector('div')).toBeNull()
  })

  it('is inherited by SVGElementController through ElementController', () => {
    const Throwing = component(() => {
      throw new Error('boom')
    })
    SnapseRoot(svg(circle(Throwing())).catch('Error'))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('Error')
    expect(document.querySelector('svg')).toBeNull()
  })

  it('catches a top-level construction error via .catch() on SnapseRoot itself, with no '
    + 'enclosing component', () => {
    let shouldThrow = true
    const Flaky = component(() => {
      if (shouldThrow) throw new Error('boom')
      return div('fixed')
    })
    let captured: RenderError | undefined
    SnapseRoot(Flaky()).catch((e: RenderError) => {
      captured = e
      return 'root fallback'
    })
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('root fallback')

    shouldThrow = false
    captured!.reset()
    expect(document.body.textContent).toBe('fixed')
  })

  it('catches a self-referential compute() via .catch(), like any other poisoned value', () => {
    const s = state<number[]>([])
    const next = compute(() => s[0]! + 1)
    s.push(next)
    SnapseRoot(div(next).catch('circular dependency'))
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('circular dependency')
  })
})
