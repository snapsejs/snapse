import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, peek, state } from '@/index.js'
import { button, div, input } from '@/DOM/elements/DOMElements.js'
import { svg } from '@/DOM/elements/SVGElements.js'
import type { EventListenerWithOptions } from '@/DOM/types.js'
import type { ElementAttributesOf } from '@/DOM/elements/elementAttributeTypes.js'

describe('test html attributes', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = 'Test:<div id="app"></div>world'
  })

  it('should work with static event listeners', () => {
    let clicked: boolean = false
    const myApp = component(() => {
      return button(
        { click: () => clicked = true, id: 'test' },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test') as HTMLElement
    testEl.click()
    expect(clicked).toBe(true)
  })

  it('should listen to a custom event given a function value', () => {
    const received: unknown[] = []
    SnapseRoot(
      { root: document.getElementById('app') },
      div({
        id: 'test', 'item-selected': (ev: CustomEvent) => received.push(ev.detail),
      } as unknown as ElementAttributesOf<HTMLDivElement>),
    )
    flush()
    document.getElementById('test')!.dispatchEvent(new CustomEvent('item-selected', { detail: 7 }))
    expect(received).toEqual([7])
  })

  it('should listen to standard events that have no on-handler property', () => {
    const received: string[] = []
    SnapseRoot(
      { root: document.getElementById('app') },
      div(
        { focusin: (ev: FocusEvent) => received.push(ev.type) },
        input({
          id: 'test',
          focusout: (ev: FocusEvent) => received.push(ev.type),
          compositionstart: (ev: CompositionEvent) => received.push(ev.data),
          compositionupdate: [(ev: CompositionEvent) => received.push(ev.data), { once: true }],
          compositionend: (ev: CompositionEvent) => received.push(ev.data),
        }),
      ),
    )
    flush()
    const testEl = document.getElementById('test')!
    testEl.focus()
    testEl.blur()
    for (const type of ['compositionstart', 'compositionupdate', 'compositionupdate', 'compositionend'])
      testEl.dispatchEvent(new window.CompositionEvent(type, { data: type }))
    expect(received)
      .toEqual(['focusin', 'focusout', 'compositionstart', 'compositionupdate', 'compositionend'])
  })

  it('should listen to focusin on an SVG element', () => {
    const received: string[] = []
    SnapseRoot(
      { root: document.getElementById('app') },
      svg({ id: 'test', focusin: (ev: FocusEvent) => received.push(ev.type) }),
    )
    flush()
    document.getElementById('test')!.dispatchEvent(new window.FocusEvent('focusin'))
    expect(received).toEqual(['focusin'])
  })

  it('should work with state listener', () => {
    let clicked = 0
    const s = state<(() => void) | undefined | null>(null)
    const myApp = component(() => {
      return button(
        { click: s, id: 'test' },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test') as HTMLElement
    testEl.click()
    expect(clicked).toBe(0)
    s.set(() => clicked++)
    flush()
    testEl.click()
    expect(clicked).toBe(1)
    s.set(undefined)
    flush()
    testEl.click()
    expect(clicked).toBe(1)
  })

  it('does not re-attach a listener when the bound handler transitions to null/undefined', () => {
    // removeEventListener always fires for a previously-registered key, but the guard around
    // the re-attach call further down (`if (dv != null)`) is what stops it from immediately
    // re-adding a phantom listener wrapping the now-nullish handler.
    const s = state<(() => void) | undefined | null>(() => {})
    const myApp = component(() => button({ click: s, id: 'test' }, 'Hello'))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test') as HTMLElement
    const addSpy = vi.spyOn(testEl, 'addEventListener')
    s.set(undefined)
    flush()
    expect(addSpy).not.toHaveBeenCalled()
  })

  it('attaches a computed handler only while it holds a function', () => {
    const s = state({ enabled: false })
    let clicks = 0
    const handler = s.enabled.opt(() => clicks++)
    const myApp = component(() => button({ click: handler, id: 'test' }, 'Hello'))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test') as HTMLElement
    testEl.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicks).toBe(0)
    s.enabled.set(true)
    flush()
    testEl.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicks).toBe(1)
    s.enabled.set(false)
    flush()
    testEl.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicks).toBe(1)
  })

  it('tracks multiple distinct listeners on the same element without losing earlier ones', () => {
    // Registering a second listener (mouseover) must not clobber the internal record of
    // the first one (click) -- otherwise a later reactive update to `click` won't find its
    // own key in the map, skips the removeEventListener call, and ends up stacking a second
    // click listener alongside the still-attached original.
    let clicked = 0
    const clickHandler = state<() => void>(() => clicked++)
    const myApp = component(() => button(
      { click: clickHandler, mouseover: () => {}, id: 'test' },
      'Hello',
    ))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test') as HTMLElement
    clickHandler.set(() => clicked++)
    flush()
    testEl.click()
    expect(clicked).toBe(1)
  })

  it('should work with array-form listener [handler, options]', () => {
    let clicked = 0
    const myApp = component(() => {
      return button(
        { click: [() => clicked++, { once: true }], id: 'test' },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test') as HTMLElement
    testEl.click()
    testEl.click()
    expect(clicked).toBe(1) // once:true → only the first click is handled
  })

  it('should work with an EventListenerObject handler in array form', () => {
    // A bare EventListenerObject is rare enough that it's only accepted in the
    // array-tuple form, matching addEventListener's own two-argument shape.
    let clicked = 0
    const handlerObj = { handleEvent: () => clicked++ }
    const myApp = component(() => {
      return button(
        { click: [handlerObj, { once: true }], id: 'test' },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test') as HTMLElement
    testEl.click()
    testEl.click()
    expect(clicked).toBe(1) // once:true → only the first click is handled
  })

  it('should work with array-form listener wrapped in a state (reactive)', () => {
    let a = 0
    let b = 0
    const s = state<EventListenerWithOptions>([() => a++, { capture: false }])
    const myApp = component(() => {
      return button({ click: s as unknown as EventListenerWithOptions, id: 'test' }, 'Hello')
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test') as HTMLElement
    testEl.click()
    expect(a).toBe(1)
    s.set([() => b++, { once: true }])
    flush()
    testEl.click()
    testEl.click()
    expect(a).toBe(1) // old handler detached
    expect(b).toBe(1) // new handler attached, once:true
  })

  it('should set a state event listener when input changes', () => {
    const s = state('ko')
    let el: HTMLInputElement
    const cf = (e?: { target?: HTMLElement }) => el = e!.target as HTMLInputElement
    const myApp = component(() => {
      return input({ change: s, nodeInserted: cf })
    })
    SnapseRoot(myApp())
    flush()
    expect(peek(s)).toBe('ko')
    el!.value = 'sill'
    const event = new Event('change', { bubbles: true })
    el!.dispatchEvent(event)
    flush()
    expect(peek(s)).toBe('sill')
  })

  it('should set a state event listener when the state starts out falsy', () => {
    const s = state('')
    let el: HTMLInputElement
    const cf = (e?: { target?: HTMLElement }) => el = e!.target as HTMLInputElement
    const myApp = component(() => {
      return input({ input: s, nodeInserted: cf })
    })
    SnapseRoot(myApp())
    flush()
    expect(peek(s)).toBe('')
    el!.value = 'sill'
    const event = new Event('input', { bubbles: true })
    el!.dispatchEvent(event)
    flush()
    expect(peek(s)).toBe('sill')
  })

  it('should set a state event listener when the state starts out undefined', () => {
    const s = state<string | undefined>(undefined)
    let el: HTMLInputElement
    const cf = (e?: { target?: HTMLElement }) => el = e!.target as HTMLInputElement
    const myApp = component(() => {
      return input({ input: s, nodeInserted: cf })
    })
    SnapseRoot(myApp())
    flush()
    expect(peek(s)).toBe(undefined)
    el!.value = 'sill'
    const event = new Event('input', { bubbles: true })
    el!.dispatchEvent(event)
    flush()
    expect(peek(s)).toBe('sill')
  })

  it('fires a state-held handler once per click after its element is removed and recreated', () => {
    let clicks = 0
    const flag = state(true)
    const handler = state(() => clicks++)
    const toggled = button({ id: 'test', click: handler as unknown as () => void }, 'Hello')
    SnapseRoot({ root: document.getElementById('app') }, div(flag.opt(toggled, 'hidden')))
    flush()
    document.getElementById('test')!.click()
    expect(clicks).toBe(1)
    flag.set(false)
    flush()
    flag.set(true)
    flush()
    document.getElementById('test')!.click()
    expect(clicks).toBe(2)
  })

  it('should re-attach a state event listener after the element is removed and re-inserted', () => {
    // Reproduces snapse-7guis cells.ts: an `input(...)` element (not wrapped in a
    // component()) is passed directly into .opt() as one of the two branches, so the
    // same ElementController instance is reused every time the selector toggles back on.
    // Binding `value` to state (as cells.ts does) keeps a live subscription on the
    // controller, so NodeController.resolveChild() does not collapse it to a bare
    // element on first render.
    const flag = state(true)
    const value = state('start')
    const toggled = input({ value, change: value })
    const myApp = component(() => {
      return div(flag.opt(toggled, 'hidden'))
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()

    let el = document.querySelector('input')
    expect(el).toBeTruthy()
    el!.value = 'typed'
    el!.dispatchEvent(new Event('change', { bubbles: true }))
    flush()
    expect(peek(value)).toBe('typed')

    flag.set(false)
    flush()
    expect(document.querySelector('input')).toBeNull()

    flag.set(true)
    flush()
    el = document.querySelector('input')
    expect(el).toBeTruthy()
    el!.value = 'typed again'
    el!.dispatchEvent(new Event('change', { bubbles: true }))
    flush()
    expect(peek(value)).toBe('typed again')
  })

  it('should re-create the element correctly when a childless reused controller is toggled back in', () => {
    // Same reuse pattern as above, but with no state-bound property, so the controller
    // has no subscription (`sub`) on first render. NodeController.resolveChild() then
    // collapses it to its bare `el` for the DOM tree. If `def` (the tag name) were
    // nulled there, as it once was, createNode() would rebuild the wrong element on
    // reinsertion (createElement(undefined) instead of createElement('input')).
    let clicked = 0
    const flag = state(true)
    const toggled = input({ click: () => clicked++ })
    const myApp = component(() => {
      return div(flag.opt(toggled, 'hidden'))
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()

    let el = document.querySelector('input')
    expect(el).toBeTruthy()
    el!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicked).toBe(1)

    flag.set(false)
    flush()
    expect(document.querySelector('input')).toBeNull()

    flag.set(true)
    flush()
    el = document.querySelector('input')
    expect(el).toBeTruthy()
    el!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicked).toBe(2)
  })

  it('should re-create a reused controller with no properties at all after toggling', () => {
    // Proves the collapse fix is general, not specific to elements with event
    // listeners: this element has zero properties, so `eventListeners` is never
    // populated, yet the same collapse-then-reinsert hazard applies.
    const flag = state(true)
    const toggled = input()
    const myApp = component(() => {
      return div(flag.opt(toggled, 'hidden'))
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(document.querySelector('input')).toBeTruthy()

    flag.set(false)
    flush()
    expect(document.querySelector('input')).toBeNull()

    flag.set(true)
    flush()
    expect(document.querySelector('input')).toBeTruthy()
  })

  it('should re-create a reused single-child wrapper after toggling', () => {
    // A div wrapping a single input, captured once and toggled as a unit: the div's
    // own `args` survive reinsertion (its parent is the StateController), so it
    // rebuilds correctly, but its `input` child's `args` must also survive (parent is
    // a plain element, not a StateController) or the recreated <input> would come back
    // with no properties/listeners re-applied at all.
    let clicked = 0
    const flag = state(true)
    const toggled = div(input({ click: () => clicked++ }))
    const myApp = component(() => {
      return flag.opt(toggled, 'hidden')
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()

    let wrapper = document.querySelector('div#app > div')
    expect(wrapper).toBeTruthy()
    let el = wrapper!.querySelector('input')
    expect(el).toBeTruthy()
    el!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicked).toBe(1)

    flag.set(false)
    flush()
    expect(document.querySelector('div#app > div')).toBeNull()

    flag.set(true)
    flush()
    wrapper = document.querySelector('div#app > div')
    expect(wrapper).toBeTruthy()
    el = wrapper!.querySelector('input')
    expect(el).toBeTruthy()
    el!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicked).toBe(2)
  })

  it('should re-create a reused two-level-nested wrapper after toggling', () => {
    // Same hazard one level deeper: args must survive being reused transitively through
    // more than one plain-element wrapper, not just a single hop from the StateController.
    let clicked = 0
    const flag = state(true)
    const toggled = div(div(input({ click: () => clicked++ })))
    const myApp = component(() => {
      return flag.opt(toggled, 'hidden')
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()

    let el = document.querySelector('input')
    expect(el).toBeTruthy()
    el!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicked).toBe(1)

    flag.set(false)
    flush()
    expect(document.querySelector('input')).toBeNull()

    flag.set(true)
    flush()
    el = document.querySelector('input')
    expect(el).toBeTruthy()
    el!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicked).toBe(2)
  })
})
