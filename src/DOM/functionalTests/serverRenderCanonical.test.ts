import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { renderToString } from '@/server.js'
import { component, state } from '@/index.js'
import { br, button, div, img, input, label, p, span, ul } from '@/DOM/elements/DOMElements.js'
import { circle, svg } from '@/DOM/elements/SVGElements.js'
import type { ChildProp } from '@/DOM/types.js'

// Our markup must be a fixed point of the browser's own parse-and-reserialize: feed it through
// innerHTML and the DOM hands back exactly the same string. That pins escaping, attribute order,
// void elements, style serialization and comment handling to what a browser actually does -
// which is what the subsequent hydrate pass walks. Each case is built twice, since rendering
// consumes the controller it is given.
const expectCanonical = (make: () => ChildProp) => {
  const markup = renderToString(make())
  const container = document.createElement('div')
  container.innerHTML = markup
  expect(container.innerHTML).toBe(renderToString(make()))
  return markup
}

describe('rendered markup is canonical HTML', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should round-trip a plain element tree', () => {
    expectCanonical(() => component(() => div(span('a'), span('b')))())
  })

  it('should round-trip attribute order and values', () => {
    expectCanonical(() => component(() => div({ id: 'x', title: 'y', lang: 'en' }, 'c'))())
  })

  it('should round-trip a style object', () => {
    expectCanonical(() => component(() =>
      div({ style: { color: 'red', marginTop: '1px' } }, 'c'))())
  })

  it('should round-trip a class object and a class array', () => {
    expectCanonical(() => component(() => div({ class: { on: true, off: false } }, 'c'))())
    expectCanonical(() => component(() => div({ class: ['a', 'b'] }, 'c'))())
  })

  it('should round-trip boolean, absent and numeric attributes', () => {
    expectCanonical(() => component(() => div(input({ disabled: true })))())
    expectCanonical(() => component(() => div(input({ disabled: false })))())
    expectCanonical(() => component(() => div(input({ disabled: undefined })))())
    expectCanonical(() => component(() => div(input({ size: 4 })))())
  })

  it('should round-trip void elements', () => {
    expectCanonical(() => component(() => div(br(), img({ src: 'a.png' })))())
  })

  it('should round-trip escaped text and attribute values', () => {
    expectCanonical(() => component(() => div('a < b & c > d'))())
    expectCanonical(() => component(() => div({ title: 'say "hi" & <bye>' }, 'c'))())
    expectCanonical(() => component(() => div('a b'))())
  })

  it('should round-trip a bound input value and a bound checkbox', () => {
    expectCanonical(() => component(() => input({ value: state('hello') }))())
    expectCanonical(() => component(() => input({ type: 'checkbox', checked: state(true) }))())
  })

  it('should round-trip current state values and array children', () => {
    expectCanonical(() => component(() => {
      const s = state({ count: 41, items: ['a', 'b'] })
      return div('Count: ', s.count, ul(s.items))
    })())
  })

  it('should round-trip hydration markers at ambiguous junctions', () => {
    const markup = expectCanonical(() => component(() => {
      const s = state({ flag: false })
      return div('x', s.flag.opt(null, 'y'), 'z')
    })())
    expect(markup).toContain('<!--')
  })

  it('should round-trip adjacent components', () => {
    const Inner = component(({ text }: { text: string }) => span(text))
    expectCanonical(() => component(() => div(Inner({ text: 'a' }), Inner({ text: 'b' })))())
  })

  it('should round-trip SVG elements', () => {
    expectCanonical(() => component(() =>
      svg({ viewBox: '0 0 10 10' }, circle({ cx: 5, cy: 5, r: 2 })))())
  })

  it('should round-trip innerHTML markup', () => {
    expectCanonical(() => component(() => div({ innerHTML: '<b>raw</b>' }))())
  })

  it('should round-trip raw DOM nodes passed straight through as children', () => {
    const rawElement = document.createElement('span')
    rawElement.textContent = 'a'
    expectCanonical(() => component(() => div(rawElement, span('b')))())
    expectCanonical(() => component(() => div(document.createComment('note')))())
    expectCanonical(() => component(() => div(document.createTextNode('b & c')))())
  })

  it('should round-trip a rendered .catch() fallback', () => {
    const Boom = component((): string => {
      throw Error('boom')
    })
    expectCanonical(() => component(() => div(Boom().catch(() => 'recovered')))())
  })

  it('should round-trip a deeper mixed tree', () => {
    expectCanonical(() => component(() => {
      const s = state({ name: 'snapse', rows: ['x', 'y', 'z'] })
      return div({ class: 'page' },
        p('hello ', s.name),
        ul(s.rows),
        label('name'),
        input({ id: 'f', value: s.name }),
        button({ click: () => undefined }, 'go'),
      )
    })())
  })
})
