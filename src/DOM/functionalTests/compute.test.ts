import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, flush, peek, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'

let s = state({
  case: 1 as number,
  text: 'case',
})

const miv = component(({ children }) => {
  return div('m', ...children)
})

describe('test the compute function in the dom', () => {
  beforeEach(() => {
    setupDOM()
    s = state({
      case: 1,
      text: 'case',
    })
  })

  it('should handle compute returning DOMElement, Component, string or array', () => {
    const u = compute(() => {
      switch (peek(s.case)) {
        case 1:
          return div(s.text, ' 1')
        case 2:
          return miv(s.text, ' 2')
        case 3:
          return s.text + ' 3'
        case 4:
          return [div(s.text, ' 4a'), miv(s.text, ' 4b'), s.text + ' 4c']
      }
    })

    const MyApp = component(() => {
      return u
    })

    SnapseRoot(MyApp())
    flush()

    expect(document.body.textContent).toBe('case 1')
    s.text.set('mode')
    flush()
    expect(document.body.textContent).toBe('mode 1')
    s.case.set(2)
    flush()
    expect(document.body.textContent).toBe('mmode 2')
    s.text.set('case')
    flush()
    expect(document.body.textContent).toBe('mcase 2')
    s.case.set(3)
    flush()
    expect(document.body.textContent).toBe('case 3')
    s.text.set('mode')
    flush()
    expect(document.body.textContent).toBe('mode 3')
    s.case.set(4)
    flush()
    expect(document.body.textContent).toBe('mode 4ammode 4bmode 4c')
    s.text.set('case')
    flush()
    expect(document.body.textContent).toBe('case 4amcase 4bcase 4c')
    s.case.set(1)
    flush()
    expect(document.body.textContent).toBe('case 1')
    s.case.set(3)
    flush()
    expect(document.body.textContent).toBe('case 3')
    s.case.set(2)
    flush()
    expect(document.body.textContent).toBe('mcase 2')
    s.case.set(1)
    flush()
    expect(document.body.textContent).toBe('case 1')
    s.case.set(4)
    flush()
    expect(document.body.textContent).toBe('case 4amcase 4bcase 4c')
    s.case.set(2)
    flush()
    expect(document.body.textContent).toBe('mcase 2')
    s.case.set(4)
    flush()
    expect(document.body.textContent).toBe('case 4amcase 4bcase 4c')
    s.case.set(3)
    flush()
    expect(document.body.textContent).toBe('case 3')
    s.case.set(1)
    flush()
    expect(document.body.textContent).toBe('case 1')
  })

  it('should handle compute that returns array of non-states', () => {
    const t = state({
      s: '',
    })

    const x = compute(() => {
      if (!peek(t.s)) return 'a'
      return [
        'b',
        'c',
      ]
    })

    const MyApp = component(() => {
      return x
    })

    SnapseRoot(MyApp())
    flush()

    expect(document.body.textContent).toBe('a')
    t.s.set('x')
    flush()
    expect(document.body.textContent).toBe('bc')
    t.s.set('y')
    flush()
    expect(document.body.textContent).toBe('bc')
  })
})
