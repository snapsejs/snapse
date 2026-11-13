import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, flush, peek, state } from '@/index.js'
import { a, div, span } from '@/DOM/elements/DOMElements.js'

describe('reactive text fast path', () => {
  beforeEach(() => setupDOM())

  it('updates reactive primitive text in a leaf element', () => {
    const s = state({ n: 1 })
    SnapseRoot(component(() => div('count: ', s.n))())
    flush()
    expect(document.body.textContent).toBe('count: 1')
    s.n.set(2)
    flush()
    expect(document.body.textContent).toBe('count: 2')
  })

  it('handles nullish reactive text (renders empty, then updates)', () => {
    const s = state<{ v: string | null }>({ v: null })
    SnapseRoot(component(() => div('[', s.v, ']'))())
    flush()
    expect(document.body.textContent).toBe('[]')
    s.v.set('x')
    flush()
    expect(document.body.textContent).toBe('[x]')
    s.v.set(null)
    flush()
    expect(document.body.textContent).toBe('[]')
  })

  it('deopts text -> element -> text nested in collapsing elements', () => {
    const s = state({ mode: 0 })
    const v = compute(() => {
      const m = peek(s.mode)
      return m === 0 ? 'hello' : m === 1 ? div('elem') : 'back'
    })
    SnapseRoot(component(() => div(span(a(v))))())
    flush()
    expect(document.body.textContent).toBe('hello')
    s.mode.set(1)
    flush()
    expect(document.body.textContent).toBe('elem')
    s.mode.set(2)
    flush()
    expect(document.body.textContent).toBe('back')
  })

  it('deopts text -> array -> text (primitive initial value)', () => {
    const s = state({ mode: 0 })
    const v = compute(() => {
      const m = peek(s.mode)
      return m === 0 ? 'a' : m === 1 ? ['b', 'c'] : m === 2 ? ['d'] : 'e'
    })
    SnapseRoot(component(() => div('(', v, ')'))())
    flush()
    expect(document.body.textContent).toBe('(a)')
    s.mode.set(1)
    flush()
    expect(document.body.textContent).toBe('(bc)')
    s.mode.set(2)
    flush()
    expect(document.body.textContent).toBe('(d)')
    s.mode.set(3)
    flush()
    expect(document.body.textContent).toBe('(e)')
  })

  it('keeps reactive text correct alongside reactive sibling content', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = state<{ t: any, arr: number[] }>({ t: 'x', arr: [1, 2, 3] })
    SnapseRoot(component(() => div('[', s.t, '|', s.arr.map(n => String(n)), ']'))())
    flush()
    expect(document.body.textContent).toBe('[x|123]')
    s.arr.splice(1, 1)
    flush()
    expect(document.body.textContent).toBe('[x|13]')
    s.t.set(div('E'))
    flush()
    expect(document.body.textContent).toBe('[E|13]')
    s.arr.push(4)
    flush()
    expect(document.body.textContent).toBe('[E|134]')
  })
})
