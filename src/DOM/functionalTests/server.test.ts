// @vitest-environment node
// Deliberately runs with no DOM environment at all: renderToString must never reach for
// document, Node, Element or any other browser global.
import { describe, expect, it } from 'vitest'
import { renderToString } from '@/server.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { br, button, div, img, input, span } from '@/DOM/elements/DOMElements.js'
import { circle, svg } from '@/DOM/elements/SVGElements.js'
import { HYDRATE_MARKER_TEXT } from '@/DOM/util/childShape.js'

describe('server-side rendering without a DOM', () => {
  it('should run in an environment that has no DOM globals whatsoever', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof Node).toBe('undefined')
    expect(typeof Element).toBe('undefined')
    expect(typeof HTMLElement).toBe('undefined')
  })

  it('should render a plain element tree', () => {
    const myApp = component(() => div(span('a'), span('b')))
    expect(renderToString(myApp())).toBe('<div><span>a</span><span>b</span></div>')
  })

  it('should render attributes in the order they were given', () => {
    const myApp = component(() => div({ id: 'x', title: 'y' }, 'c'))
    expect(renderToString(myApp())).toBe('<div id="x" title="y">c</div>')
  })

  it('should render a style object as a style attribute', () => {
    const myApp = component(() => div({ style: { color: 'red', marginTop: '1px' } }, 'c'))
    expect(renderToString(myApp())).toBe('<div style="color: red; margin-top: 1px;">c</div>')
  })

  it('should render a class object as a class attribute, dropping disabled names', () => {
    const myApp = component(() => div({ class: { on: true, off: false } }, 'c'))
    expect(renderToString(myApp())).toBe('<div class="on">c</div>')
  })

  it('should render true as a valueless attribute and omit false and undefined', () => {
    const myApp = component(() => div(
      input({ disabled: true }), input({ disabled: false }), input({ disabled: undefined }),
    ))
    expect(renderToString(myApp())).toBe('<div><input disabled=""><input><input></div>')
  })

  it('should leave void elements unclosed', () => {
    const myApp = component(() => div(br(), img({ src: 'a.png' })))
    expect(renderToString(myApp())).toBe('<div><br><img src="a.png"></div>')
  })

  it('should escape text content', () => {
    const myApp = component(() => div('a < b & c > d'))
    expect(renderToString(myApp())).toBe('<div>a &lt; b &amp; c &gt; d</div>')
  })

  it('should escape attribute values', () => {
    const myApp = component(() => div({ title: 'say "hi" & <bye>' }, 'c'))
    expect(renderToString(myApp())).toBe('<div title="say &quot;hi&quot; &amp; <bye>">c</div>')
  })

  it('should not emit event handlers as attributes', () => {
    const myApp = component(() => button({ click: () => undefined, id: 'b' }, 'go'))
    const html = renderToString(myApp())
    expect(html).toBe('<button id="b">go</button>')
    expect(html).not.toContain('click')
  })

  it('should not emit an event handler given with listener options', () => {
    const myApp = component(() => button({ click: [() => undefined, { once: true }] }, 'go'))
    expect(renderToString(myApp())).toBe('<button>go</button>')
  })

  it('should serialize a bound value as an attribute but swallow a bound event', () => {
    const text = state('hello')
    const myApp = component(() => input({ value: text, input: text }))
    const html = renderToString(myApp())
    expect(html).toBe('<input value="hello">')
  })

  it('should render current state values', () => {
    const s = state({ count: 41 })
    const myApp = component(() => div('Count: ', s.count))
    expect(renderToString(myApp())).toContain('Count: ')
    expect(renderToString(myApp())).toContain('41')
  })

  it('should render array children', () => {
    const s = state({ items: ['a', 'b'] })
    const myApp = component(() => div(s.items))
    expect(renderToString(myApp())).toContain('a')
    expect(renderToString(myApp())).toContain('b')
  })

  it('should render SVG elements with their own tag casing preserved', () => {
    const myApp = component(() => svg({ viewBox: '0 0 10 10' }, circle({ cx: 5, cy: 5, r: 2 })))
    expect(renderToString(myApp()))
      .toBe('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="2"></circle></svg>')
  })

  it('should emit innerHTML markup verbatim in place of children', () => {
    const myApp = component(() => div({ innerHTML: '<b>raw</b>' }))
    expect(renderToString(myApp())).toBe('<div><b>raw</b></div>')
  })

  it('should emit a hydration marker where a junction would otherwise be ambiguous', () => {
    const s = state({ flag: false })
    const myApp = component(() => div('x', s.flag.opt(null, 'y'), 'z'))
    expect(renderToString(myApp())).toContain(HYDRATE_MARKER_TEXT)
  })

  it('should not emit a marker where the junction is already unambiguous', () => {
    const myApp = component(() => div('a', 'b'))
    const html = renderToString(myApp())
    expect(html).not.toContain('<!--')
    expect(html).toBe('<div>ab</div>')
  })

  it('should render nothing for a portal, which installs outside the markup either way', () => {
    // Wherever a nested root installs is outside its ancestor's markup, so none of it is server
    // rendered and the client builds it instead. This one would install at the end of body.
    const Dialog = component(() => SnapseRoot(div('dialog')))
    const myApp = component(() => div('page', Dialog()))
    expect(renderToString(myApp())).toBe(`<div>page<!--${HYDRATE_MARKER_TEXT}--></div>`)
  })

  it('should not build a portal that names csr for itself, there being no DOM to build it in', () => {
    // A mode of its own normally wins, but nothing can install into a real element during a
    // render pass - on a server document.createElement would throw rather than produce markup.
    let reached = 0
    const target = {
      nodeType: 1,
      get insertBefore(): never {
        reached++
        throw Error('portal installed into its target during a render pass')
      },
    } as unknown as HTMLElement
    const Dialog = component(() => SnapseRoot({ root: target, mode: 'csr' }, div('dialog')))
    const myApp = component(() => div('page', Dialog()))
    expect(renderToString(myApp())).toBe(`<div>page<!--${HYDRATE_MARKER_TEXT}--></div>`)
    expect(reached).toBe(0)
  })

  it('should render nothing for a portal that names a root of its own', () => {
    // There is no DOM on a server to reach that element with, and hydration builds it client-side
    const target = { nodeType: 1 } as unknown as HTMLElement
    const Dialog = component(() => SnapseRoot({ root: target }, div('dialog')))
    const myApp = component(() => div('page', Dialog()))
    expect(renderToString(myApp())).toBe(`<div>page<!--${HYDRATE_MARKER_TEXT}--></div>`)
  })

  it('should reject a top-level render root that names a root of its own', () => {
    expect(() => {
      SnapseRoot({ root: { nodeType: 1 } as unknown as HTMLElement, mode: 'render' }, div('x'))
      flush()
    }).toThrow()
  })

  it('should render a .catch() fallback instead of the failed subtree', () => {
    const Boom = component((): string => {
      throw Error('boom')
    })
    const myApp = component(() => div(Boom().catch(() => 'recovered')))
    expect(renderToString(myApp())).toBe('<div>recovered</div>')
  })

  it('should fire no lifecycle callbacks at all, and serialize none of them', () => {
    // There is no interaction and no document to be inserted into, so none of these have
    // anything to report. They are left out of the markup too, like any handler.
    const calls: string[] = []
    const myApp = component(() => div({
      nodeCreated: () => calls.push('created'),
      nodeInserted: () => calls.push('inserted'),
      nodeRemoved: () => calls.push('removed'),
      id: 'a',
    }, 'x'))
    expect(renderToString(myApp())).toBe('<div id="a">x</div>')
    expect(calls).toEqual([])
  })

  it('should run an already-satisfied outer component fallback with no DOM to build it in', () => {
    // The inner boundary renders the replacement, so the outer one is only notified - its
    // component fallback is invoked detached, purely for side effects, which still needs a
    // throwaway container to build into. On a server that cannot be a real element.
    let outerRuns = 0
    const Throwing = component((): string => {
      throw Error('boom')
    })
    const Inner = component(() => Throwing().catch(() => 'inner handled'))
    const OuterFallback = component(() => {
      outerRuns++
      return 'outer'
    })
    const myApp = component(() => div(Inner().catch(OuterFallback())))
    expect(renderToString(myApp())).toBe('<div>inner handled</div>')
    expect(outerRuns).toBe(1)
  })

  it('should render nested components, marking the junction between two of them', () => {
    // Two adjacent components are each SHAPE_DYNAMIC - neither side is a known-element hard
    // boundary at classification time - so the junction between them needs a marker.
    const Inner = component(({ label }: { label: string }) => span(label))
    const myApp = component(() => div(Inner({ label: 'a' }), Inner({ label: 'b' })))
    expect(renderToString(myApp()))
      .toBe(`<div><span>a</span><!--${HYDRATE_MARKER_TEXT}--><span>b</span></div>`)
  })
})
