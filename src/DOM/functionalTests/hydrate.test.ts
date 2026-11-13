import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { asServedMarkup, minifyHtml, prettifyHtml, renderToString } from './common/hydrationTestSupport.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { button, div, span } from '@/DOM/elements/DOMElements.js'
import { HYDRATE_MARKER_TEXT } from '@/DOM/util/childShape.js'
import type { ChildProp } from '@/DOM/types.js'

const roundTrip = (html: string) => prettifyHtml(minifyHtml(html))

describe('test hydration', () => {
  beforeEach(() => {
    setupDOM()
  })

  let clicked = 0

  const onClick = () => {
    clicked++
  }

  it('should render and hydrate simple elements', () => {
    const myApp = component(() => {
      return button({ id: 'test', style: { color: 'red' }, click: onClick },
        'Hello',
      )
    })
    document.body.innerHTML = `Test:<div id="app">${renderToString(myApp())}</div>world`
    expect(document.body.textContent).toBe('Test:Helloworld')
    expect(document.body.innerHTML).toBe(
      'Test:<div id="app"><button id="test" style="color: red;">Hello</button></div>world')
    const pg = document.getElementById('test')
    pg!.click()
    expect(clicked).toBe(0)
    SnapseRoot({ root: document.getElementById('app'), mode: 'hydrate' }, myApp())
    flush()
    expect(document.body.textContent).toBe('Test:Helloworld')
    expect(document.body.innerHTML).toBe(
      'Test:<div id="app"><button id="test" style="color: red;">Hello</button></div>world')
    pg!.click()
    expect(clicked).toBe(1)
  })

  it('should call nodeInserted with the element as target during hydration', () => {
    let seenTarget: EventTarget | undefined
    const myApp = component(() => div({
      id: 'test', nodeInserted: ev => {
        seenTarget = ev?.target
      },
    }, 'x'))
    const html = renderToString(myApp())
    const container = document.createElement('div')
    container.innerHTML = roundTrip(html)
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(seenTarget).toBe(container.querySelector('#test'))
  })

  it('should not crash when nodeInserted is explicitly undefined during hydration', () => {
    const myApp = component(() => div({ id: 'test', nodeInserted: undefined }, 'x'))
    const html = renderToString(myApp())
    const container = document.createElement('div')
    container.innerHTML = roundTrip(html)
    expect(() => {
      SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
      flush()
    }).not.toThrow()
  })

  it('should render and hydrate nodearrays with changing number of elements', () => {
    const s = state({
      arr: [1, 2, 3],
      c: 2,
      d: 3,
      e: 'e',
    })
    const myApp = component(() => {
      return div(
        'b',
        s.arr.map(n => n % s.c === 0 ? null : div(n)),
        s.e,
        s.arr.map(n => n % s.d === 0 ? null : div(n)),
        'd',
      )
    })
    document.body.innerHTML = renderToString(myApp())
    expect(document.body.textContent).toBe('b13e12d')
    SnapseRoot({ root: document.body, mode: 'hydrate' }, myApp())
    flush()
    s.c.set(4)
    flush()
    expect(document.body.textContent).toBe('b123e12d')
  })

  it('should render and hydrate cascading nodearrays with changing number of elements', () => {
    const s = state({
      arr: [1, 2, 3, 4, 5, 6, 7, 8],
      c: 2,
      d: 3,
      e: 'e',
    })
    const x = s.arr.map(n => {
      return n % s.c === 0
        ? null
        : s.arr.map(m => {
            return m % s.d === 0
              ? div('>', n, m)
              : null
          })
    })

    const myApp = component(() => {
      return div(
        'b',
        x,
        'e',
      )
    })
    document.body.innerHTML = renderToString(myApp())
    expect(document.body.textContent).toBe('b>13>16>33>36>53>56>73>76e')
    SnapseRoot({ root: document.body, mode: 'hydrate' }, myApp())
    flush()
    s.c.set(3)
    flush()
    expect(document.body.textContent).toBe('b>13>16>23>26>43>46>53>56>73>76>83>86e')
  })

  it('should hydrate reactive text adjacent to static text with no element between', () => {
    const s = state({ count: 41 })
    const myApp = component(() => div('Count: ', s.count, ' items'))
    const html = renderToString(myApp())
    expect(html).toContain(HYDRATE_MARKER_TEXT)
    const container = document.createElement('div')
    container.innerHTML = roundTrip(html)
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('Count: 41 items')
    s.count.set(42)
    flush()
    expect(container.textContent).toBe('Count: 42 items')
  })

  it('should not emit markers when reactive text is bounded by elements', () => {
    const s = state({ count: 41 })
    const myApp = component(() => div(span('a'), s.count, span('b')))
    const html = renderToString(myApp())
    expect(html).not.toContain('<!--')
    const container = document.createElement('div')
    container.innerHTML = roundTrip(html)
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('a41b')
    s.count.set(42)
    flush()
    expect(container.textContent).toBe('a42b')
  })

  it('should hydrate a reactive array of elements round-tripped through a string', () => {
    const s = state({ arr: [1, 2, 3] })
    const myApp = component(() => div(s.arr.map(n => div(n))))
    const html = renderToString(myApp())
    expect(html).not.toContain('<!--')
    const container = document.createElement('div')
    container.innerHTML = roundTrip(html)
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('123')
    s.arr.push(4)
    flush()
    expect(container.textContent).toBe('1234')
  })

  it('should hydrate scattered null array items amid elements without markers', () => {
    const s = state({ arr: [1, 2, 3, 4] })
    const myApp = component(() => div(s.arr.map(n => n % 2 ? div(n) : null)))
    const html = renderToString(myApp())
    expect(html).not.toContain('<!--')
    const container = document.createElement('div')
    container.innerHTML = roundTrip(html)
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('13')
    s.arr.push(5)
    flush()
    expect(container.textContent).toBe('135')
  })

  it('should hydrate a raw-primitive reactive array correctly (not a perf case)', () => {
    const s = state({ arr: [1, 2, 3] })
    const myApp = component(() => div(s.arr.map(v => String(v))))
    const html = renderToString(myApp())
    const container = document.createElement('div')
    container.innerHTML = roundTrip(html)
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('123')
    s.arr[0]!.set(9)
    flush()
    expect(container.textContent).toBe('923')
  })

  it('should hydrate a component result adjacent to reactive text with no element between', () => {
    const s = state({ text: 'world' })
    const Greeting = component(() => 'hello ')
    const myApp = component(() => div(Greeting(), s.text))
    const html = renderToString(myApp())
    const container = document.createElement('div')
    container.innerHTML = roundTrip(html)
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('hello world')
    s.text.set('snapse')
    flush()
    expect(container.textContent).toBe('hello snapse')
  })

  it('should hydrate an empty-string literal adjacent to other text', () => {
    const myApp = component(() => div('', 'after'))
    const html = renderToString(myApp())
    const container = document.createElement('div')
    container.innerHTML = roundTrip(html)
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('after')
  })

  it('inserts a synthesized empty text node before, not after, the element that follows it', () => {
    // The empty string produces no serialized DOM node, so the next hydratable node is the
    // <span> itself (not text) -- addChildren falls into the "no text node here after all"
    // branch, which must synthesize one and insert it BEFORE that next node, not at the end.
    const myApp = component(() => div('', span('x')))
    const html = renderToString(myApp())
    const container = document.createElement('div')
    container.innerHTML = html
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    const inner = container.firstElementChild!
    expect(Array.from(inner.childNodes).map(n => n.nodeType)).toEqual([Node.TEXT_NODE, Node.ELEMENT_NODE])
    expect(inner.textContent).toBe('x')
  })

  it('should fail to hydrate correctly without marker comments', () => {
    const s = state({ count: 41 })
    const myApp = component(() => div('Count: ', s.count, ' items'))
    const html = renderToString(myApp())
    expect(html).toContain(HYDRATE_MARKER_TEXT)
    const strippedHtml = html.replace(/<!--[\s\S]*?-->/g, '')
    const container = document.createElement('div')
    container.innerHTML = strippedHtml
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('Count: 41 items')
    s.count.set(42)
    flush()
    expect(container.textContent).toBe('Count: 41 items42')
  })

  it('should not corrupt content when a stray whitespace node precedes a hydration marker', () => {
    const s = state({ count: 41 })
    const myApp = component(() => div('Count: ', s.count, ' items'))
    const html = renderToString(myApp())
    expect(html).toContain(HYDRATE_MARKER_TEXT)
    const container = document.createElement('div')
    container.innerHTML = html
    const markers: Comment[] = []
    const collectComments = (node: Node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.COMMENT_NODE) markers.push(child as Comment)
        collectComments(child)
      }
    }
    collectComments(container)
    expect(markers.length).toBeGreaterThan(0)
    for (const marker of markers) {
      marker.parentNode!.insertBefore(document.createTextNode(' '), marker)
    }
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('Count: 41 items')
    s.count.set(42)
    flush()
    expect(container.textContent).toBe('Count: 42 items')
  })

  it('should hydrate text following an element through a minify/prettify round trip', () => {
    // Whitespace a formatter adds *between tags* is still skipped, by the element branch and at
    // junctions. Whitespace invented next to text content is not supported: nothing distinguishes
    // it from a child whose own content is whitespace, which must survive (see below).
    const s = state({ n: 1 })
    const myApp = component(() => div(span('x'), ' items', s.n))
    const container = asServedMarkup(renderToString(myApp()))
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('x items1')
    s.n.set(2)
    flush()
    expect(container.textContent).toBe('x items2')
  })

  it('should throw when the next hydratable node is not an element', () => {
    const myApp = component(() => div(span('x')))
    const html = renderToString(myApp())
    const container = document.createElement('div')
    container.innerHTML = html.replace(/<span[^>]*>.*?<\/span>/, 'not a span')
    expect(() => {
      SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
      flush()
    }).toThrow()
  })

  it('should throw the DOM-mismatch error directly for a childless element '
    + 'whose next hydratable node is not an element', () => {
    // The test above also mismatches, but its span has a child ('x'), so the mismatch is
    // actually caught downstream (a native HierarchyRequestError from trying to insert into
    // the wrongly-assigned #text node), never exercising this guard itself. A childless
    // element has nothing further to insert, so nothing else would ever notice the mismatch --
    // without this guard, hydration would silently continue with a corrupted `el` reference.
    const myApp = component(() => div(span()))
    const html = renderToString(myApp())
    const container = document.createElement('div')
    container.innerHTML = html.replace(/<span[^>]*>.*?<\/span>/, 'not a span')
    expect(() => {
      SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
      flush()
    }).toThrow()
  })

  // A nested root is never part of its ancestor's server-rendered markup, so on hydration there
  // is nothing for it to attach to and it builds itself fresh instead, as 'csr'.
  it('should build a nested root with its own target client-side while its ancestor hydrates',
    () => {
      const s = state({ count: 41 })
      const portalContainer = document.createElement('div')
      const portal = component(() => SnapseRoot({ root: portalContainer }, div(s.count, ' items')))
      const myApp = component(() => div('outer:', portal()))
      const container = asServedMarkup(renderToString(myApp()))
      SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
      flush()

      expect(container.textContent).toBe('outer:')
      expect(portalContainer.textContent).toBe('41 items')
      s.count.set(42)
      flush()
      expect(portalContainer.textContent).toBe('42 items')
      // The portal's update must land in the portal, not in the hydrated tree
      expect(container.textContent).toBe('outer:')
    })

  it('should build a nested root with no target of its own into the body while hydrating', () => {
    // The main tree is hydrated from the served markup; the portal, which has no target, is built
    // fresh at the end of document.body - and its updates must not reach the hydrated tree.
    const s = state({ count: 41 })
    const portal = component(() => SnapseRoot(div(s.count, ' items')))
    const myApp = component(() => div('outer:', portal()))
    const container = asServedMarkup(renderToString(myApp()))
    document.body.appendChild(container)
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()

    expect(container.textContent).toBe('outer:')
    expect(document.body.lastElementChild!.textContent).toBe('41 items')
    s.count.set(42)
    flush()
    expect(document.body.lastElementChild!.textContent).toBe('42 items')
    expect(container.textContent).toBe('outer:')
  })

  it('should not render a nested root that names its own target, leaving the target untouched',
    () => {
      // `render` produces markup rather than installing DOM, so there is no way to reach a named
      // element - on a server that element doesn't exist at all. Its content is simply absent,
      // and the rest of the page still renders.
      const portalContainer = document.createElement('div')
      const s = state({ count: 41 })
      const portal = component(() => SnapseRoot({ root: portalContainer }, div(s.count, ' items')))
      const myApp = component(() => div('outer:', portal()))
      const html = renderToString(myApp())
      expect(portalContainer.innerHTML).toBe('')
      expect(html).toContain('outer:')
      expect(html).not.toContain('items')
    })

  it('should render nothing for a nested root with no target of its own', () => {
    // It installs at the end of document.body in a browser, which is outside this markup, so it
    // is left for the client to build (see above).
    const s = state({ count: 41 })
    const portal = component(() => SnapseRoot(div(s.count, ' items')))
    const myApp = component(() => div('outer:', portal()))
    expect(renderToString(myApp()))
      .toBe(`<div>outer:<!--${HYDRATE_MARKER_TEXT}--></div>`)
  })

  it('should classify a plain-text sibling among elements during unsafe-junction analysis', () => {
    const myApp = component(() => [span('a'), 'plain text', span('b')])
    const html = renderToString(myApp())
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    SnapseRoot({ root: container, mode: 'hydrate' }, myApp())
    flush()
    expect(container.textContent).toBe('aplain textb')
  })

  it('should not need a hydration marker around a directly-passed raw DOM element', () => {
    const raw = document.createElement('span')
    raw.textContent = 'a'
    const myApp = component(() => div(raw, span('b')))
    const html = renderToString(myApp())
    expect(html).not.toContain('<!--')
    expect(html).toBe('<div><span>a</span><span>b</span></div>')
  })

  it('should not emit a marker between two adjacent static text arguments', () => {
    const myApp = component(() => div('a', 'b'))
    const html = renderToString(myApp())
    expect(html).not.toContain('<!--')
    expect(html).toBe('<div>ab</div>')
  })

  it('should not need a marker when a reactive slot resolves to nothing (empty is transparent)', () => {
    const s = state({ flag: true })
    const myApp = component(() => div('x', s.flag.opt(null, 'y'), 'z'))
    const html = renderToString(myApp())
    expect(html).not.toContain('<!--')
    expect(html).toBe('<div>xz</div>')
  })

  it('should need a marker when a reactive slot resolves to dynamic text between static text', () => {
    const s = state({ flag: false })
    const myApp = component(() => div('x', s.flag.opt(null, 'y'), 'z'))
    const html = renderToString(myApp())
    expect(html).toContain(HYDRATE_MARKER_TEXT)
  })

  it('should not need a marker when a reactive slot resolves to an element (an unambiguous boundary)', () => {
    const s = state({ flag: true })
    const myApp = component(() => div('x', s.flag.opt(span('y'), 'y'), 'z'))
    const html = renderToString(myApp())
    expect(html).not.toContain('<!--')
    expect(html).toBe('<div>x<span>y</span>z</div>')
  })
})

// Each child must come out of hydration owning exactly one text node, in the right position -
// that mapping, not the text, is what a later update indexes by. Adjacent static children come
// back merged into a single node (nothing separates them in the markup), and whitespace-only
// children are indistinguishable from formatter noise, so both used to be mis-assigned while
// textContent still read correctly.
describe('hydration maps text nodes to the children that own them', () => {
  beforeEach(() => {
    setupDOM()
  })

  const hydrated = (make: () => ChildProp) => {
    const markup = renderToString(make())
    const container = document.createElement('div')
    container.innerHTML = markup
    SnapseRoot({ root: container, mode: 'hydrate' }, make())
    flush()
    const target = container.firstElementChild ?? container
    return {
      markup,
      container,
      nodes: () => [...target.childNodes].map(n => n.textContent),
      text: () => container.textContent,
    }
  }

  it('should give a merged static its own node and leave the reactive one alone', () => {
    const s = state('X')
    const h = hydrated(() => component(() => div('a', 'b', s))())
    expect(h.nodes()).toEqual(['ab', '', 'X'])
    expect(h.text()).toBe('abX')
    s.set('Z')
    flush()
    expect(h.text()).toBe('abZ')
  })

  it('should hydrate two adjacent statics with nothing following them', () => {
    // Benign on its own - the merged node is claimed whole and the second child gets an empty
    // node at the end, where there is nothing to displace. Pinned so it stays that way.
    const h = hydrated(() => component(() => div('a', 'b'))())
    expect(h.markup).toBe('<div>ab</div>')
    expect(h.nodes()).toEqual(['ab', ''])
    expect(h.text()).toBe('ab')
  })

  it('should keep a non-blank static between two reactive values', () => {
    // The counterpart to the whitespace case below: this one always worked, because a non-blank
    // node is never mistaken for formatter whitespace. Guards against crossJunction or the text
    // branch becoming too eager.
    const s = state('A')
    const t = state('B')
    const h = hydrated(() => component(() => div(s, '.', t))())
    expect(h.nodes()).toEqual(['A', '.', 'B'])
    t.set('C')
    flush()
    expect(h.text()).toBe('A.C')
  })

  it('should keep a whitespace child between two reactive values', () => {
    const s = state('A')
    const t = state('B')
    const h = hydrated(() => component(() => div(s, ' ', t))())
    expect(h.nodes()).toEqual(['A', ' ', 'B'])
    expect(h.text()).toBe('A B')
    t.set('C')
    flush()
    expect(h.text()).toBe('A C')
  })

  it('should keep a leading whitespace child', () => {
    const s = state('X')
    const h = hydrated(() => component(() => div(' ', s))())
    expect(h.text()).toBe(' X')
    s.set('Z')
    flush()
    expect(h.text()).toBe(' Z')
  })

  it('should keep a whitespace child that merged into the static before it', () => {
    const s = state('X')
    const h = hydrated(() => component(() => div('a', ' ', s))())
    expect(h.text()).toBe('a X')
    s.set('Z')
    flush()
    expect(h.text()).toBe('a Z')
  })

  it('should preserve doubled whitespace exactly as rendered', () => {
    const s = state('A')
    const t = state('B')
    const h = hydrated(() => component(() => div(s, '  ', t))())
    expect(h.text()).toBe('A  B')
    t.set('C')
    flush()
    expect(h.text()).toBe('A  C')
  })

  it('should keep a non-breaking space child, which also reads as blank', () => {
    const s = state('X')
    const h = hydrated(() => component(() => div(' ', s))())
    expect(h.text()).toBe(' X')
    s.set('Z')
    flush()
    expect(h.text()).toBe(' Z')
  })

  it('should handle an empty static child, which renders no text at all', () => {
    const s = state('X')
    const h = hydrated(() => component(() => div('', s))())
    expect(h.text()).toBe('X')
    s.set('Z')
    flush()
    expect(h.text()).toBe('Z')
  })

  it('should keep a whitespace child between two elements', () => {
    const h = hydrated(() => component(() => div(span('a'), ' ', span('b')))())
    expect(h.markup).toBe('<div><span>a</span> <span>b</span></div>')
    expect(h.text()).toBe('a b')
  })
})
