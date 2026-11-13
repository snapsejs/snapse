import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush } from '@/index.js'
import { renderToString } from '@/server.js'
import { div, input } from '@/DOM/elements/DOMElements.js'
import type { DOMEventListener } from '@/DOM/types.js'

describe('test the autofocus attribute', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
  })

  it('focuses an element with autofocus when inserted on the client', () => {
    const myApp = component(() => input({ id: 'test-1', autofocus: true }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLInputElement
    // The attribute itself is omitted on the client: the browser's own autofocus handling
    // would race the manual focus() call below and log a spurious console warning.
    expect(testEl.hasAttribute('autofocus')).toBe(false)
    expect(document.activeElement).toBe(testEl)
  })

  it('does not focus an element without autofocus', () => {
    const myApp = component(() => input({ id: 'test-1' }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(document.activeElement).toBe(document.body)
  })

  it('does not focus an element with autofocus: false, and omits the attribute', () => {
    const myApp = component(() => input({ id: 'test-1', autofocus: false }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLInputElement
    expect(document.activeElement).toBe(document.body)
    expect(testEl.hasAttribute('autofocus')).toBe(false)
  })

  it('focuses and still calls nodeInserted, prop order autofocus then nodeInserted', () => {
    let called = 0
    const nodeInserted: DOMEventListener = () => {
      called++
    }
    const myApp = component(() => input({ id: 'test-1', autofocus: true, nodeInserted }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(called).toBe(1)
    expect(document.activeElement).toBe(document.getElementById('test-1'))
  })

  it('focuses and still calls nodeInserted, prop order nodeInserted then autofocus', () => {
    let called = 0
    const nodeInserted: DOMEventListener = () => {
      called++
    }
    const myApp = component(() => input({ id: 'test-1', nodeInserted, autofocus: true }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(called).toBe(1)
    expect(document.activeElement).toBe(document.getElementById('test-1'))
  })

  it('does not focus during hydration, even though the attribute is present', () => {
    const myApp = component(() => input({ id: 'test-1', autofocus: true }))
    document.body.innerHTML = renderToString(myApp())
    document.getElementById('test-1')!.blur()
    SnapseRoot({ root: document.body, mode: 'hydrate' }, myApp())
    flush()
    expect(document.activeElement).toBe(document.body)
    expect(document.getElementById('test-1')!.getAttribute('autofocus')).toBe('')
  })

  it('does not throw and still reflects the attribute in render (SSR) mode', () => {
    const myApp = component(() => input({ id: 'test-1', autofocus: true }))
    // Focusing is left to the browser: there is nothing to focus while rendering to markup.
    expect(renderToString(myApp())).toBe('<input id="test-1" autofocus="">')
  })

  it('focuses an autofocus element nested inside a wrapper, once actually connected', () => {
    const myApp = component(() => div(
      input({ id: 'test-1', autofocus: true }),
      input({ id: 'test-2' }),
    ))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    // The wrapping div is still off-document while its own children are built, so the nested
    // input's nodeInserted fires before it's actually connected -- focus is deferred to the end
    // of the flush, by which point the whole subtree, including the wrapper, is attached.
    expect(document.activeElement).toBe(document.getElementById('test-1'))
  })

  it('does not focus an element that a nodeInserted callback already removed', () => {
    const myApp = component(() => input({
      id: 'test-1',
      nodeInserted: e => e!.target!.remove(),
      autofocus: true,
    }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(document.getElementById('test-1')).toBeNull()
    expect(document.activeElement).toBe(document.body)
  })
})
