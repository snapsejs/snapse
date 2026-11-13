import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, findState, flush, state } from '@/index.js'
import { div, input } from '@/DOM/elements/DOMElements.js'
import type { DOMChild } from '@/DOM/types.js'
import { sleep } from '@/common/test/testUtil.js'

describe('test state in the dom', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should create a state and render to DOM', () => {
    const counter = state(0)
    const myApp = component(() => {
      return div(
        'Count: ',
        counter,
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('Count: 0')
    counter.set(5)
    flush()
    expect(document.body.textContent).toBe('Count: 5')
  })

  it('renders a promoted member of a computed pojo directly and keeps it updating', () => {
    const raw = state(1)
    const derived = compute(() => ({ y: Number(raw) * 10 }))
    const myApp = component(() => div({ id: 'out' }, compute(() => derived.y)))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.getElementById('out')?.textContent).toBe('10')
    raw.set(2)
    flush()
    expect(document.getElementById('out')?.textContent).toBe('20')
  })

  it('should render nothing for a state containing undefined or null', () => {
    const s = state({
      null: 'A' as string | null,
      undefined: 'B' as string | undefined,
    })
    const myApp = component(() => {
      return div(
        'Undefined:', s.undefined, 'Null:', s.null,
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('Undefined:BNull:A')
    s.null.set(null)
    s.undefined.set(undefined)
    flush()
    expect(document.body.textContent).toBe('Undefined:Null:')
  })

  it('should not try to update hidden elements', () => {
    const s = state({
      a: true,
      b: 'B',
    })
    const myApp = component(() => {
      return div(
        'x',
        s.a.opt(input({ value: s.b })),
      )
    })
    SnapseRoot(myApp())
    flush()
    s.b.set('C')
    s.a.set(false)
    flush()
    expect(document.body.textContent).toBe('x')
  })

  it('should reassign a DOMChild-typed state holding a rendered element via .set()', () => {
    const s = state<{ view: DOMChild }>({ view: null })
    const myApp = component(() => div(s.view))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('')
    s.view.set(div('first'))
    flush()
    expect(document.body.textContent).toBe('first')
    // The state's current value is now an ElementController (STATE_DOMOBJECT) - reassigning
    // again exercises .set() while the state is in that kind.
    s.view.set(div('second'))
    flush()
    expect(document.body.textContent).toBe('second')
  })

  it('should fall back via .or() on a DOMChild-typed state holding an element', () => {
    const s = state<{ view: DOMChild }>({ view: null })
    const myApp = component(() => div(s.view.or(div('fallback'))))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('fallback')
    s.view.set(div('real'))
    flush()
    expect(document.body.textContent).toBe('real')
  })

  it('should use the generic .or() fallback for a DOM object with no own .or()', () => {
    // A state whose *current* value is already a NodeController is STATE_DOMOBJECT. Its .or()
    // checks for an own `.or` method first (ComponentController has one, for its async-placeholder
    // behavior) and otherwise falls back to the generic FunctionTransform-based .or() -- exercised
    // here with a plain ElementController (div(...)), which has no own .or().
    const c = state(div('content')).or('fallback')
    const myApp = component(() => div('b', c, 'e'))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('bcontente')
  })

  it('should throw when calling findState after await', async () => {
    let caught = 0
    const X = component(async () => {
      await sleep(1)
      let s
      try {
        s = findState('myState')
      } catch {
        caught++
      }
      return div(s)
    })
    const myApp = component(() => {
      state(42, 'myState')
      return div(
        X(),
      )
    })
    SnapseRoot(myApp())
    flush()
    await sleep(2)
    expect(caught).toBe(1)
  })

  it('should throw when creating named state after await', async () => {
    let caught = 0
    const myApp = component(async () => {
      await sleep(1)
      let s
      try {
        s = state(42, 'invalid')
      } catch {
        caught++
      }
      return div(
        'ok',
        s,
      )
    })
    SnapseRoot(myApp())
    flush()
    await sleep(2)
    expect(caught).toBe(1)
  })
})
