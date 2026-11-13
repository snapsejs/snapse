import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { button, img, input, p, td } from '@/DOM/elements/DOMElements.js'

describe('test html attributes', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = 'Test:<div id="app"></div>world'
  })

  it('should work with static attributes', () => {
    const myApp = component(() => {
      return p(
        { id: 'test-1', style: { textTransform: 'uppercase' } },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('style')).toBe('text-transform: uppercase;')
  })

  it('should work with state attributes', () => {
    const s = state({
      style: { textTransform: null as string | null },
    })
    const myApp = component(() => {
      return p(
        {
          id: 'test-1',
          style: s.style,
        },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('style')).toBe(null)
    s.style.textTransform.set('uppercase')
    flush()
    expect(testEl.getAttribute('style')).toBe('text-transform: uppercase;')
    s.style.textTransform.set(null)
    flush()
    expect(testEl.getAttribute('style')).toBe('')
  })

  it('should accept a state as attributes', () => {
    const attrs = state({ id: 'test-1', title: 'a' })
    SnapseRoot({ root: document.getElementById('app') }, p(attrs, 'Hello'))
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('title')).toBe('a')
    expect(testEl.textContent).toBe('Hello')
    attrs.title.set('b')
    flush()
    expect(testEl.getAttribute('title')).toBe('b')
  })

  it('should work with boolean attributes', () => {
    const s = state({
      disabled: true,
    })
    const myApp = component(() => {
      return button(
        { id: 'test-1', disabled: s.disabled },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLButtonElement
    expect(testEl.disabled).toBe(true)
    expect(testEl.getAttribute('disabled')).toBe('')
    s.disabled.set(false)
    flush()
    expect(testEl.disabled).toBe(false)
  })

  it('should work with style attributes', () => {
    const s = state(1)
    const myApp = component(() => {
      return p(
        { id: 'test-1', style: { borderWidth: [s, 'px'] } },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('style')).toBe('border-width: 1px;')
    s.set(5)
    flush()
    expect(testEl.getAttribute('style')).toBe('border-width: 5px;')
  })

  it('should work with any interpolated attribute', () => {
    const s = state<number | null>(2)
    const myApp = component(() => {
      return img(
        { id: 'test-1', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA', alt: ['test', s] },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('alt')).toBe('test2')
    s.set(7)
    flush()
    expect(testEl.getAttribute('alt')).toBe('test7')
    s.set(null)
    flush()
    expect(testEl.getAttribute('alt')).toBe('test')
  })

  it('should work with the innerHTML attribute', () => {
    const s = state({
      content: '<strong>Hello</strong>',
    })
    const myApp = component(() => {
      return p(
        { id: 'test-1', innerHTML: s.content },
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.innerHTML).toBe('<strong>Hello</strong>')
    s.content.set('<em>World</em>')
    flush()
    expect(testEl.innerHTML).toBe('<em>World</em>')
  })

  it('should stringify numeric attribute values', () => {
    const s = state({ span: 2 })
    const myApp = component(() => [
      p({ id: 'test-1', tabIndex: 3 }),
      td({ id: 'test-2', colSpan: s.span }),
    ])
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    const testEl2 = document.getElementById('test-2') as HTMLElement
    expect(testEl.getAttribute('tabindex')).toBe('3')
    expect(testEl2.getAttribute('colspan')).toBe('2')
    s.span.set(5)
    flush()
    expect(testEl2.getAttribute('colspan')).toBe('5')
  })

  it('should keep a controlled input value on the property after the field is dirty', () => {
    const s = state({ value: 'a' })
    const myApp = component(() => input({ id: 'test-1', value: s.value }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const el = document.getElementById('test-1') as HTMLInputElement
    expect(el.value).toBe('a')
    // Simulate user interaction dirtying the property, then update the state programmatically.
    el.value = 'typed'
    s.value.set('b')
    flush()
    expect(el.value).toBe('b')
  })

  it('should reflect a controlled checkbox checked state on the property', () => {
    const s = state({ checked: false })
    const myApp = component(() => input({ id: 'test-1', type: 'checkbox', checked: s.checked }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const el = document.getElementById('test-1') as HTMLInputElement
    expect(el.checked).toBe(false)
    s.checked.set(true)
    flush()
    expect(el.checked).toBe(true)
    s.checked.set(false)
    flush()
    expect(el.checked).toBe(false)
  })

  it('should join a static array of plain values into one attribute string', () => {
    const myApp = component(() => p({ id: 'test-1', title: ['a', 'b', null, 'c'] }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('title')).toBe('abc')
  })

  it('should reactively join an array attribute value containing a State', () => {
    const s = state({ part: 'a' })
    const myApp = component(() => p({ id: 'test-1', title: [s.part, 'b'] }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('title')).toBe('ab')
    s.part.set('x')
    flush()
    expect(testEl.getAttribute('title')).toBe('xb')
  })

  it('should stringify a bigint attribute value', () => {
    const myApp = component(() => p({ id: 'test-1', 'data-big': 10n as unknown as string }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('data-big')).toBe('10')
  })

  it('should remove an attribute when its bound state transitions to null', () => {
    const s = state<string | null>('hi')
    const myApp = component(() => p({ id: 'test-1', 'data-foo': s }))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('data-foo')).toBe('hi')
    s.set(null)
    flush()
    expect(testEl.hasAttribute('data-foo')).toBe(false)
  })

  it('should not crash on a not-yet-defined (undefined) property value', () => {
    const obj: Record<string, string> = {}
    const myApp = component(() => p({ id: 'test-1', title: obj.notYetDefined }))
    expect(() => {
      SnapseRoot({ root: document.getElementById('app') }, myApp())
      flush()
    }).not.toThrow()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.hasAttribute('title')).toBe(false)
  })

  it('should silently ignore a property whose value matches no known handling', () => {
    const myApp = component(() => p({ id: 'test-1', 'data-foo': {} as unknown as string }))
    expect(() => {
      SnapseRoot({ root: document.getElementById('app') }, myApp())
      flush()
    }).not.toThrow()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.hasAttribute('data-foo')).toBe(false)
  })

  it('should type-check object states passed as attributes or style', () => {
    p(state({ id: 'x', title: 'y' }))
    p({ style: state({ color: 'red' as string | null }) })
    // @ts-expect-error a Date is not an attribute value
    p(state({ title: new Date() }))
    // @ts-expect-error a Date is not a style value
    p({ style: state({ color: new Date() }) })
  })
})
