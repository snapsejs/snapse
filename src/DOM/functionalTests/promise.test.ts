import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'
import { sleep } from '@/common/test/testUtil.js'

describe('promises in DOM', () => {
  beforeEach(() => setupDOM())

  it('renders a promise when it resolves', async () => {
    const promise = new Promise<string | undefined>(resolve => setTimeout(() => resolve('ko'), 1))

    const MyApp = component(() => {
      return div(
        'b',
        promise,
        'e',
      )
    })
    SnapseRoot(MyApp())
    flush()
    expect(document.body.textContent).toBe('be')
    await sleep(2)
    flush()
    expect(document.body.textContent).toBe('bkoe')
  })

  it('renders an async component when it returns', async () => {
    const Async = component(async () => {
      await sleep(1)
      return div('returned')
    })

    const MyApp = component(() => {
      return div(
        'b',
        Async(),
        'e',
      )
    })
    SnapseRoot(MyApp())
    flush()
    expect(document.body.textContent).toBe('be')
    await sleep(2)
    flush()
    expect(document.body.textContent).toBe('breturnede')
  })

  it('renders fallback for an async component until it returns', async () => {
    const Async = component(async () => {
      await sleep(1)
      return div('returned')
    })

    const MyApp = component(() => {
      return div(
        'b',
        Async().or('loading'),
        'e',
      )
    })
    SnapseRoot(MyApp())
    flush()
    expect(document.body.textContent).toBe('bloadinge')
    await sleep(2)
    flush()
    expect(document.body.textContent).toBe('breturnede')
  })

  it('renders a sync component directly, not its .or() fallback', () => {
    // ComponentController.createNode() only takes the async/PromiseTransform path when the
    // component itself is an async function -- a sync component's return value is a plain
    // ChildProp (e.g. a NodeController, string, or array), not a thenable, so routing it through
    // PromiseTransform (which unconditionally calls `promise.then(...)`) would throw. .or()
    // being called doesn't change that: the fallback only ever applies while a *real* async
    // component's promise is still pending.
    const Sync = component(() => div('sync-result'))
    const MyApp = component(() => div('b', Sync().or('fallback'), 'e'))
    SnapseRoot(MyApp())
    expect(() => flush()).not.toThrow()
    expect(document.body.textContent).toBe('bsync-resulte')
  })

  it('preserves ComponentController.or\'s real behavior when called through a State', async () => {
    // A state holding a ComponentController is STATE_DOMOBJECT, whose .or() delegates to the
    // component's own .or() (rather than the generic chain-function fallback) precisely so this
    // still works - proving the delegation doesn't just type-check but actually preserves the
    // real async-placeholder behavior.
    const Async = component(async () => {
      await sleep(1)
      return div('returned')
    })

    const MyApp = component(() => {
      const c = state(Async()).or('loading')
      return div('b', c, 'e')
    })
    SnapseRoot(MyApp())
    flush()
    expect(document.body.textContent).toBe('bloadinge')
    await sleep(2)
    flush()
    expect(document.body.textContent).toBe('breturnede')
  })
})
