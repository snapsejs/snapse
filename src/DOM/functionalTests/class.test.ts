import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { renderToString } from '@/server.js'
import { p } from '@/DOM/elements/DOMElements.js'

describe('test html attributes', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = 'Test:<div id="app"></div>world'
  })

  it('should work with static class', () => {
    const myApp = component(() => {
      return p(
        { id: 'test-1', class: 'test-class' },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    flush()
    expect(testEl.getAttribute('class')).toBe('test-class')
  })

  it('should not crash on an undefined (not-yet-defined) class value', () => {
    // classes.notYetDefined reads as a plain `undefined`, not a missing property --
    // isReactiveClassValue's isArray() check used to crash on that via
    // Object.getPrototypeOf(undefined).
    const classes: Record<string, string> = {}
    const myApp = component(() => {
      return p(
        { id: 'test-1', class: classes.notYetDefined },
        'Hello',
      )
    })
    expect(() => {
      SnapseRoot({ root: document.getElementById('app') }, myApp())
      flush()
    }).not.toThrow()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.hasAttribute('class')).toBe(false)
  })

  it('should work with state class', () => {
    const s = state({
      class: null as string | string[] | null,
    })
    const myApp = component(() => {
      return p(
        { id: 'test-1', class: s.class },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    flush()
    expect(testEl.hasAttribute('class')).toBe(false)
    s.class.set('test-class')
    flush()
    expect(testEl.getAttribute('class')).toBe('test-class')
    s.class.set(null)
    flush()
    expect(testEl.hasAttribute('class')).toBe(false)
    s.class.set(['class-a', 'class-b'])
    flush()
    expect(testEl.getAttribute('class')).toBe('class-a class-b')
  })

  it('should work with state object class', () => {
    const s = state({
      class: { classA: true, classB: false, classC: true },
    })
    const myApp = component(() => {
      return p(
        { id: 'test-1', class: s.class },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    flush()
    expect(testEl.getAttribute('class')).toBe('classA classC')
    s.class.classB.set(true)
    flush()
    expect(testEl.getAttribute('class')).toBe('classA classB classC')
    s.class.classA.set(false)
    flush()
    expect(testEl.getAttribute('class')).toBe('classB classC')
  })

  it('should work with a plain object whose condition is a State', () => {
    const s = state({ isActive: false, isBig: true })
    const myApp = component(() => {
      return p(
        { id: 'test-1', class: { active: s.isActive, big: s.isBig } },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    flush()
    expect(testEl.getAttribute('class')).toBe('big')
    s.isActive.set(true)
    flush()
    expect(testEl.getAttribute('class')).toBe('active big')
    s.isBig.set(false)
    flush()
    expect(testEl.getAttribute('class')).toBe('active')
  })

  it('has no class attribute while the class list is empty', () => {
    const isActive = state(false)
    SnapseRoot({ root: document.getElementById('app') }, p({ id: 'test-1', class: { active: isActive } }))
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.hasAttribute('class')).toBe(false)
    isActive.set(true)
    flush()
    expect(testEl.getAttribute('class')).toBe('active')
    isActive.set(false)
    flush()
    expect(testEl.hasAttribute('class')).toBe(false)
  })

  it('has no class attribute for an empty static class', () => {
    SnapseRoot(
      { root: document.getElementById('app') },
      p({ id: 'test-1', class: '' }),
      p({ id: 'test-2', class: [] }),
    )
    flush()
    expect(document.getElementById('test-1')!.hasAttribute('class')).toBe(false)
    expect(document.getElementById('test-2')!.hasAttribute('class')).toBe(false)
  })

  it('renders no class attribute for an empty class list', () => {
    expect(renderToString(p({ class: { active: state(false) } }, 'x'))).toBe('<p>x</p>')
  })

  it('should work with a computed State condition in a class object', () => {
    const s = state({ count: 0 })
    const myApp = component(() => {
      return p(
        { id: 'test-1', class: { positive: s.count.is(3) } },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    flush()
    expect(testEl.hasAttribute('class')).toBe(false)
    s.count.set(3)
    flush()
    expect(testEl.getAttribute('class')).toBe('positive')
  })

  it('should work with complex combo class', () => {
    const s = state({
      class: { classA: true, classB: false, classC: true },
      class2: 'classD' as string | null,
      class3: ['classE'],
    })
    const myApp = component(() => {
      return p(
        { id: 'test-1', class: [s.class, s.class2, s.class3] },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    flush()
    expect(testEl.getAttribute('class')).toBe('classA classC classD classE')
    s.class.classB.set(true)
    flush()
    expect(testEl.getAttribute('class')).toBe('classA classB classC classD classE')
    s.class.classA.set(false)
    flush()
    expect(testEl.getAttribute('class')).toBe('classB classC classD classE')
    s.class2.set(null)
    flush()
    expect(testEl.getAttribute('class')).toBe('classB classC classE')
    s.class3.set(['classF', 'classG'])
    flush()
    expect(testEl.getAttribute('class')).toBe('classB classC classF classG')
  })

  it('should reactively update a class array mixing static and reactive entries', () => {
    // Only some entries are States: proves isReactiveClassValue uses `.some`, not `.every`
    // -- with `.every`, the static 'fixed' entry would make the array look non-reactive.
    const dynamic = state('dyn-a')
    const myApp = component(() => {
      return p(
        { id: 'test-1', class: ['fixed', dynamic] },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('class')).toBe('fixed dyn-a')
    dynamic.set('dyn-b')
    flush()
    expect(testEl.getAttribute('class')).toBe('fixed dyn-b')
  })

  it('should reactively update a class object mixing static and reactive values', () => {
    // Only one value is a State: proves isReactiveClassValue uses `.some`, not `.every`
    // -- with `.every`, the static 'alwaysBig' entry would make the object look non-reactive.
    const s = state({ isActive: false })
    const myApp = component(() => {
      return p(
        { id: 'test-1', class: { active: s.isActive, alwaysBig: true } },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('class')).toBe('alwaysBig')
    s.isActive.set(true)
    flush()
    expect(testEl.getAttribute('class')).toBe('active alwaysBig')
  })

  it('should work with a plain (non-reactive) array class value', () => {
    const myApp = component(() => {
      return p(
        { id: 'test-1', class: ['test-class', 'other-class'] },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const testEl = document.getElementById('test-1') as HTMLElement
    expect(testEl.getAttribute('class')).toBe('test-class other-class')
  })
})
