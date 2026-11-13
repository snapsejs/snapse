import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, flush, state } from '@/index.js'
import { button, div } from '@/DOM/elements/DOMElements.js'
import { sleep } from '@/common/test/testUtil.js'
import type { RenderError } from '@/DOM/util/RenderError.js'

describe('reactive-update error handling', () => {
  beforeEach(() => setupDOM())

  it('catches an error raised by a compute() recomputation, not by the state.set() that triggered it', () => {
    const productCount = state(1)
    const totalCount = state(10)
    const averagePrice = compute(() => {
      if (+productCount === 0) throw new Error('division by zero')
      return +totalCount / +productCount
    })
    let captured: RenderError | undefined
    const Fallback = component(({ renderError }) => {
      captured = renderError
      return div('fallback: ', (renderError!.cause as Error).message)
    })
    const App = component(() => div('price: ', averagePrice))
    SnapseRoot(App().catch(Fallback()))
    flush()
    expect(document.body.textContent).toBe('price: 10')

    productCount.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('fallback: division by zero')
    expect(captured!.cause).toBeInstanceOf(Error)

    productCount.set(2)
    captured!.reset()
    expect(document.body.textContent).toBe('price: 5')
  })

  it('isolates a reactive error with no .catch(): uncaught, but does not block other updates', () => {
    const risky = state(1)
    const computed = compute(() => {
      if (+risky === 0) throw new Error('boom')
      return +risky
    })
    const other = state('idle')
    const App = component(() => div('v: ', computed))
    const Sibling = component(() => div('s: ', other))
    SnapseRoot(App(), Sibling())
    flush()
    expect(document.body.textContent).toBe('v: 1s: idle')

    const microtasks: (() => void)[] = []
    const originalQueueMicrotask = globalThis.queueMicrotask
    globalThis.queueMicrotask = (fn: () => void) => {
      microtasks.push(fn)
    }
    try {
      risky.set(0)
      other.set('active')
      expect(() => flush()).not.toThrow()
    } finally {
      globalThis.queueMicrotask = originalQueueMicrotask
    }
    // The unrelated sibling's update still applied, even though `computed`'s update had no
    // .catch() ancestor to bubble to.
    expect(document.body.textContent).toContain('s: active')
    expect(microtasks.length).toBeGreaterThanOrEqual(1)
    expect(() => microtasks.forEach(fn => fn())).toThrow('boom')
  })

  it('isolates an error thrown directly by a DOM event handler, without blocking other updates', () => {
    const other = state('idle')
    const App = component(() => div(
      button({
        click: () => {
          throw new Error('handler boom')
        },
      }, 'break'),
      div('s: ', other),
    ))
    SnapseRoot(App())
    flush()

    const errors: unknown[] = []
    window.addEventListener('error', e => {
      // Prevents jsdom's default handling, which would otherwise also print this expected
      //   error to the console (per spec, an unhandled "error" event logs to the console -
      //   preventDefault() marks it handled, same as a real browser's window.onerror).
      e.preventDefault()
      errors.push((e as ErrorEvent).error)
    })
    const btn = document.querySelector('button')!
    // The listener dispatch machinery (jsdom, and real browsers per spec) reports a thrown
    //   exception as an uncaught "error" event rather than letting it propagate out of .click().
    expect(() => btn.click()).not.toThrow()
    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toBe('handler boom')

    other.set('active')
    flush()
    expect(document.body.textContent).toContain('s: active')
  })

  it('turns a rejected async promise into a catchable error, not a stuck .or() fallback', async () => {
    const Async = component(async () => {
      await sleep(1)
      throw new Error('fetch failed')
    })
    let captured: RenderError | undefined
    const Fallback = component(({ renderError }) => {
      captured = renderError
      return div('fallback: ', (renderError!.cause as Error).message)
    })
    const App = component(() => div(Async().or('loading')))
    SnapseRoot(App().catch(Fallback()))
    flush()
    expect(document.body.textContent).toBe('loading')

    await sleep(2)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('fallback: fetch failed')
    expect(captured!.cause).toBeInstanceOf(Error)
  })

  it('bubbles a poisoned generic attribute value to the nearest .catch()', () => {
    const trigger = state(1)
    const titleValue = compute(() => {
      if (+trigger === 0) throw new Error('bad title')
      return 'ok'
    })
    const Fallback = component(({ renderError }) => div('fallback: ', (renderError!.cause as Error).message))
    const App = component(() => div({ title: titleValue }, 'content'))
    SnapseRoot(App().catch(Fallback()))
    flush()
    expect(document.body.textContent).toBe('content')

    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('fallback: bad title')
  })

  it('bubbles a poisoned class value to the nearest .catch()', () => {
    const trigger = state(1)
    const classValue = compute(() => {
      if (+trigger === 0) throw new Error('bad class')
      return 'ok-class'
    })
    const Fallback = component(({ renderError }) => div('fallback: ', (renderError!.cause as Error).message))
    const App = component(() => div({ class: classValue }, 'content'))
    SnapseRoot(App().catch(Fallback()))
    flush()
    expect(document.body.textContent).toBe('content')

    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('fallback: bad class')
  })

  it('bubbles a poisoned individual class-map value to the nearest .catch()', () => {
    const trigger = state(1)
    const activeFlag = compute(() => {
      if (+trigger === 0) throw new Error('bad flag')
      return true
    })
    const Fallback = component(({ renderError }) => div('fallback: ', (renderError!.cause as Error).message))
    const App = component(() => div({ class: { active: activeFlag } }, 'content'))
    SnapseRoot(App().catch(Fallback()))
    flush()
    expect(document.body.textContent).toBe('content')

    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('fallback: bad flag')
  })

  it('calls a plain-function fallback with the RenderError on a reactive error', () => {
    const trigger = state(1)
    const risky = compute(() => {
      if (+trigger === 0) throw new Error('boom')
      return +trigger
    })
    const App = component(() => div('v: ', risky))
    SnapseRoot(App().catch((e: RenderError) => `handled: ${(e.cause as Error).message}`))
    flush()
    expect(document.body.textContent).toBe('v: 1')

    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('handled: boom')
  })

  it('rethrows a reactive error to an outer .catch(), invoking but not mounting its fallback', () => {
    const trigger = state(1)
    const risky = compute(() => {
      if (+trigger === 0) throw new Error('boom')
      return +trigger
    })
    const calls: RenderError[] = []
    const App = component(() => div('v: ', risky))
    const Inner = component(() => App().catch('inner handled'))
    SnapseRoot(Inner().catch((e: RenderError) => {
      calls.push(e)
      return 'outer handled'
    }))
    flush()
    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('inner handled')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.fallbackRendered).toBe(true)
  })

  it('stops an outer .catch() from firing on a reactive error once stopPropagation() is called', () => {
    const trigger = state(1)
    const risky = compute(() => {
      if (+trigger === 0) throw new Error('boom')
      return +trigger
    })
    let outerCalls = 0
    const App = component(() => div('v: ', risky))
    const Inner = component(() => App().catch((e: RenderError) => {
      e.stopPropagation()
      return 'inner handled'
    }))
    SnapseRoot(Inner().catch(() => {
      outerCalls++
      return 'outer handled'
    }))
    flush()
    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('inner handled')
    expect(outerCalls).toBe(0)
  })

  it('leaves fallbackRendered false and lets an outer .catch() replace the UI when the inner '
    + 'fallback function returns nullish on a reactive error', () => {
    const trigger = state(1)
    const risky = compute(() => {
      if (+trigger === 0) throw new Error('boom')
      return +trigger
    })
    const App = component(() => div('v: ', risky))
    const Inner = component(() => App().catch(() => null))
    SnapseRoot(Inner().catch((e: RenderError) => {
      expect(e.fallbackRendered).toBe(false)
      return 'outer handled'
    }))
    flush()
    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('outer handled')
  })
})

describe('.catch() directly on an element or root (reactive-time)', () => {
  beforeEach(() => setupDOM())

  it('replaces the whole element (not just its children) when a child throws on recompute', () => {
    const trigger = state(1)
    const risky = compute(() => {
      if (+trigger === 0) throw new Error('boom')
      return +trigger
    })
    SnapseRoot(div('v: ', risky).catch('Error'))
    flush()
    expect(document.body.textContent).toBe('v: 1')

    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('Error')
    expect(document.querySelector('div')).toBeNull()
  })

  it('self-catches an attribute that only starts throwing on a later recompute', () => {
    const trigger = state(1)
    const title = compute(() => {
      if (+trigger === 0) throw new Error('bad title')
      return 'ok'
    })
    SnapseRoot(div({ title }, 'content').catch('Error'))
    flush()
    expect(document.body.textContent).toBe('content')

    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('Error')
    expect(document.querySelector('div')).toBeNull()
  })

  it('does not notify an outer .catch() once a self-catch calls stopPropagation()', () => {
    const trigger = state(1)
    const title = compute(() => {
      if (+trigger === 0) throw new Error('bad title')
      return 'ok'
    })
    let outerCalls = 0
    const Inner = component(() => div({ title }, 'content').catch((e: RenderError) => {
      e.stopPropagation()
      return 'Error'
    }))
    SnapseRoot(Inner().catch(() => {
      outerCalls++
      return 'outer handled'
    }))
    flush()
    trigger.set(0)
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('Error')
    expect(outerCalls).toBe(0)
  })
})
