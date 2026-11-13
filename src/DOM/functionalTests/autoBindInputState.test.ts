import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { renderToString } from './common/hydrationTestSupport.js'
import { SnapseRoot, component, compute, flush, peek, state } from '@/index.js'
import { input, meter, option, progress, select } from '@/DOM/elements/DOMElements.js'

// `<progress>`/`<meter>` have a natively numeric `.value` (unlike `<input>`, where it's
// always a string), so the change/input auto-bind sugar accepts a `State<number>` for
// them - see the `ValueTypeOf<E> extends (string | number)` gate in elementAttributeTypes.ts.
describe('numeric auto-bind sugar for progress/meter', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should reflect a number state as the progress value (one-way, via value:)', () => {
    const n = state(3)
    const myApp = component(() => progress({ id: 'test', max: 10, value: n }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLProgressElement
    expect(el.value).toBe(3)
    n.set(7)
    flush()
    expect(el.value).toBe(7)
  })

  it('should write a numeric change event value back into the bound state', () => {
    const n = state(3)
    const myApp = component(() => progress({ id: 'test', max: 10, value: n, change: n }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLProgressElement
    el.value = 9
    el.dispatchEvent(new Event('change', { bubbles: true }))
    flush()
    expect(peek(n)).toBe(9)
    expect(el.value).toBe(9)
  })

  it('should reflect a number state as the meter value (one-way, via value:)', () => {
    const n = state(0.5)
    const myApp = component(() => meter({ id: 'test', min: 0, max: 1, value: n }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLMeterElement
    expect(el.value).toBe(0.5)
    n.set(0.8)
    flush()
    expect(el.value).toBe(0.8)
  })

  it('should write a numeric input event value back into the bound state', () => {
    const n = state(0.5)
    const myApp = component(() => meter({ id: 'test', min: 0, max: 1, value: n, input: n }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLMeterElement
    el.value = 0.2
    el.dispatchEvent(new Event('input', { bubbles: true }))
    flush()
    expect(peek(n)).toBe(0.2)
    expect(el.value).toBe(0.2)
  })
})

// `<input type="number"|"range">` reports `.value` as a `string` regardless of `type` (DOM
// spec), but `.valueAsNumber` gives the numeric value - the `input(...)` factory overloads on
// the literal `type:` passed so a `State<number>` can only be bound alongside those two types
// (see the `NumericHTMLInputElement`/`StandardHTMLInputElement` overloads in DOMElements.ts).
describe('numeric auto-bind sugar for input[type=number|range]', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should reflect a number state as the input value (one-way, via value:)', () => {
    const n = state(3)
    const myApp = component(() => input({ id: 'test', type: 'number', value: n }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLInputElement
    expect(el.valueAsNumber).toBe(3)
    n.set(7)
    flush()
    expect(el.valueAsNumber).toBe(7)
  })

  it('should write a numeric change event value back into the bound state', () => {
    const n = state(3)
    const myApp = component(() => input({
      id: 'test', type: 'number', value: n, change: n,
    }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLInputElement
    el.valueAsNumber = 9
    el.dispatchEvent(new Event('change', { bubbles: true }))
    flush()
    expect(peek(n)).toBe(9)
    expect(el.valueAsNumber).toBe(9)
  })

  it.each([
    ['a computed state', () => compute(() => Number(state(1)) * 10)],
    ['a member of a computed pojo', () => compute(() => ({ v: Number(state(1)) * 10 })).v],
  ])('should refuse to bind events to %s', (_name, bound) => {
    const n = bound()
    const myApp = component(() => input({ id: 'test', type: 'number', value: n, change: n }))
    expect(() => {
      SnapseRoot({ root: document.body }, myApp())
      flush()
    }).toThrow(TypeError)
  })

  it('should write a numeric input event value back into the bound state for type=range', () => {
    const n = state(0.5)
    const myApp = component(() => input({
      id: 'test', type: 'range', min: 0, max: 1, step: 0.1, value: n, input: n,
    }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLInputElement
    el.valueAsNumber = 0.8
    el.dispatchEvent(new Event('input', { bubbles: true }))
    flush()
    expect(peek(n)).toBe(0.8)
    expect(el.valueAsNumber).toBe(0.8)
  })
})

// `<input type="checkbox"|"radio">` exposes `.checked`, an IDL property entirely separate
// from `.value` (a checked checkbox can independently have any `.value` string) - the
// change/input auto-bind sugar accepts a `State<boolean>` for these two types via the
// `CheckboxHTMLInputElement` overload/`CheckedTypeOf<E>` gate (DOMElements.ts,
// elementAttributeTypes.ts).
describe('render (SSR) mode must serialize bound value/checked as attributes', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should serialize a bound input value as an attribute, not assign the live DOM property', () => {
    // In render (SSR) mode there's no live DOM to hold IDL-property state -- the value
    // must come through as a real `value="..."` attribute in the serialized markup.
    const s = state('hello')
    const myApp = component(() => input({ value: s }))
    const html = renderToString(myApp())
    expect(html).toContain('value="hello"')
  })

  it('should serialize a bound checkbox checked state as an attribute', () => {
    const checked = state(true)
    const myApp = component(() => input({ type: 'checkbox', checked }))
    const html = renderToString(myApp())
    expect(html).toMatch(/checked(="")?/)
  })
})

describe('boolean auto-bind sugar for input[type=checkbox|radio]', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should reflect a boolean state as the checkbox checked property (one-way, via checked:)', () => {
    const checked = state(false)
    const myApp = component(() => input({ id: 'test', type: 'checkbox', checked }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLInputElement
    expect(el.checked).toBe(false)
    checked.set(true)
    flush()
    expect(el.checked).toBe(true)
  })

  it('should reflect a checked: update even after the IDL property has been touched directly', () => {
    // Setting the `checked` IDL property via script sets the checkbox's "dirty" flag (HTML
    // spec), even when the value doesn't change -- after that, the `checked` *attribute* stops
    // reflecting to the live property at all. updateProperty()'s fast path (direct property
    // assignment) must be used for every checked: update, not just the first one, or a
    // reactive change after any such touch silently fails to show up on the checkbox.
    const checked = state(false)
    const myApp = component(() => input({ id: 'test', type: 'checkbox', checked }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLInputElement
    el.checked = false // same value, but still sets the dirty flag
    checked.set(true)
    flush()
    expect(el.checked).toBe(true)
  })

  it('should write checked-change event values back into the bound state, in both directions', () => {
    const checked = state(false)
    const myApp = component(() => input({
      id: 'test', type: 'checkbox', checked, change: checked,
    }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLInputElement

    el.checked = true
    el.dispatchEvent(new Event('change', { bubbles: true }))
    flush()
    expect(peek(checked)).toBe(true)
    expect(el.checked).toBe(true)

    el.checked = false
    el.dispatchEvent(new Event('change', { bubbles: true }))
    flush()
    expect(peek(checked)).toBe(false)
    expect(el.checked).toBe(false)
  })

  it('should write checked-input event values back into the bound state for type=radio', () => {
    const checked = state(false)
    const myApp = component(() => input({
      id: 'test', type: 'radio', checked, input: checked,
    }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLInputElement

    el.checked = true
    el.dispatchEvent(new Event('input', { bubbles: true }))
    flush()
    expect(peek(checked)).toBe(true)
    expect(el.checked).toBe(true)
  })

  it('should reflect a boolean state as the option selected property', () => {
    // The other option starts genuinely selected, so `<select>`'s "must have one option
    // selected" default-reset behavior can't mask `test`'s own selected:false.
    const sel = state(false)
    const myApp = component(() => select(
      option({ id: 'test', value: 'a', selected: sel }, 'A'),
      option({ value: 'b', selected: true }, 'B'),
    ))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLOptionElement
    expect(el.selected).toBe(false)
    sel.set(true)
    flush()
    expect(el.selected).toBe(true)
  })

  it('should reflect a selected: update even after the IDL property has been touched directly', () => {
    // Same dirty-flag quirk as checked: -- see the analogous checked: test above.
    const sel = state(false)
    const myApp = component(() => select(
      option({ id: 'test', value: 'a', selected: sel }, 'A'),
      option({ value: 'b', selected: true }, 'B'),
    ))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLOptionElement
    el.selected = false
    sel.set(true)
    flush()
    expect(el.selected).toBe(true)
  })

  it('should bind value: (string) and checked: (boolean) independently on the same checkbox', () => {
    const value = state('apple')
    const checked = state(false)
    const myApp = component(() => input({
      id: 'test', type: 'checkbox', value, checked, change: checked,
    }))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const el = document.getElementById('test') as HTMLInputElement
    expect(el.value).toBe('apple')
    expect(el.checked).toBe(false)

    el.checked = true
    el.dispatchEvent(new Event('change', { bubbles: true }))
    flush()
    expect(peek(checked)).toBe(true)
    expect(el.value).toBe('apple')
  })
})
