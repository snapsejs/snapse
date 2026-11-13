import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, flush, state } from '@/index.js'
import { a, div, input } from '@/DOM/elements/DOMElements.js'
import { circle, g, svg } from '@/DOM/elements/SVGElements.js'

describe('correct removal of promoted/flattened elements', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
  })

  it('removes an svg wrapping a reactive g child when the whole component is swapped out', () => {
    // svg's only child is g, and g's only child is a reactive mapped array
    // (kept alive as a retained StateController, so neither g nor svg gets
    // flattened away on its own) — this is resolveChild()'s "promote the
    // sole NodeController child, discard the wrapper" optimization, which
    // used to silently orphan the whole <svg> once the enclosing (`.el`-less)
    // component was removed, since nothing was left tracking it.
    const s = state({ showCanvas: true })
    const circles = state([{ cx: 1, cy: 1, r: 1 }])

    const Canvas = component(() => svg({ id: 'canvas' }, g(circles.map(c => circle(c)))))
    const myApp = component(() => s.showCanvas.opt(Canvas(), div('other page')))

    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(document.getElementById('canvas')).not.toBeNull()

    s.showCanvas.set(false)
    flush()
    expect(document.getElementById('canvas')).toBeNull()
  })

  it('removes a single-child wrapper element on .remove(), not just its inner content', () => {
    // div(a(state)) is a chain of single-NodeController-child wrappers, and
    // a root has no `.el` of its own to cascade-remove a discarded wrapper's
    // DOM node — same resolveChild() hazard as the svg case above.
    document.body.innerHTML = ''
    const s = state({ n: 1 })
    const app = SnapseRoot(div(a(s.n)))
    flush()
    expect(document.body.innerHTML).toBe('<div><a>1</a></div>')
    app.remove()
    expect(document.body.innerHTML).toBe('')
  })

  it('does not collapse a wrapper whose reactive child renders more than one grandchild element', () => {
    // resolveChild()'s "promote the sole grandchild, discard the wrapper" optimization
    // must only fire when there is exactly one grandchild element — otherwise the wrapper
    // element is load-bearing (it's the only container holding the siblings together).
    document.body.innerHTML = '<div id="app"></div>'
    const items = state([{ v: 1 }, { v: 2 }])
    const myApp = component(() => g(items.map(it => circle(it.v))))
    SnapseRoot({ root: document.getElementById('app') }, svg(myApp()))
    flush()
    expect(document.querySelectorAll('circle').length).toBe(2)
    expect(document.querySelector('g')).not.toBeNull()
  })

  it('returns a plain (non-element) single grandchild value from a StateController wrapper directly', () => {
    // resolveChild()'s StateController-side collapse: when the sole retained child is not
    // itself a NodeController (e.g. a plain text node), it's returned as-is without recursing.
    document.body.innerHTML = '<div id="app"></div>'
    const s = state({ text: 'hello' })
    const myApp = component(() => div(s.text.opt(s.text)))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(document.getElementById('app')!.textContent).toBe('hello')
    s.text.set('world')
    flush()
    expect(document.getElementById('app')!.textContent).toBe('world')
  })

  it('should update a computed value when an element is re-created', () => {
    const s = state({
      dialogOpen: false,
      def: 1,
    })
    const myApp = component(() => {
      return s.dialogOpen.opt(
        div(
          input({ value: s.def, id: 'test-1' }),
          input({ value: compute(() => s.def), id: 'test-2' }),
        ),
      )
    })
    SnapseRoot(myApp())
    flush()
    s.dialogOpen.set(true)
    flush()
    s.def.set(2)
    flush()
    let el1 = document.getElementById('test-1') as HTMLInputElement | null
    expect(el1?.value).toBe('2')
    let el2 = document.getElementById('test-2') as HTMLInputElement | null
    expect(el2?.value).toBe('2')
    s.dialogOpen.set(false)
    flush()
    s.def.set(3)
    s.dialogOpen.set(true)
    flush()
    el1 = document.getElementById('test-1') as HTMLInputElement | null
    expect(el1?.value).toBe('3')
    el2 = document.getElementById('test-2') as HTMLInputElement | null
    expect(el2?.value).toBe('3')
  })
})
