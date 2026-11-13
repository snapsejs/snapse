import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush } from '@/index.js'
import { a, circle, script, style, svg, title } from '@/DOM/elements/SVGElements.js'
import * as singleFileBundle from '@/snapseAll.js'
import type { ChildProp } from '@/DOM/types.js'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'

const namespaceOfRendered = (child: ChildProp) => {
  const root = document.getElementById('app')!
  root.replaceChildren()
  SnapseRoot({ root }, child)
  flush()
  return root.firstElementChild!.namespaceURI
}

describe('svg elements', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
  })

  it('creates namespaced SVG elements via createElementNS', () => {
    const myApp = component(() => {
      return svg({ id: 'my-svg' }, circle({ id: 'my-circle', r: '5', cx: '10', cy: '10' }))
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()

    const svgEl = document.getElementById('my-svg')!
    const circleEl = document.getElementById('my-circle')!

    expect(svgEl).toBeInstanceOf(SVGElement)
    expect(svgEl.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(circleEl).toBeInstanceOf(SVGElement)
    expect(circleEl.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })

  it('sets plain attributes via setAttribute, same as HTML elements', () => {
    const myApp = component(() => {
      return svg(circle({ id: 'my-circle', r: '5', cx: '10', cy: '10' }))
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()

    const circleEl = document.getElementById('my-circle')!
    expect(circleEl.getAttribute('r')).toBe('5')
    expect(circleEl.getAttribute('cx')).toBe('10')
    expect(circleEl.getAttribute('cy')).toBe('10')
  })

  it('creates SVG elements for the names that clash with HTML elements', () => {
    for (const element of [a, script, style, title]) {
      expect(namespaceOfRendered(element())).toBe(SVG_NAMESPACE)
    }
  })

  it('exports the clashing SVG elements with an svg_ prefix from the single-file bundle', () => {
    const { svg_a, svg_script, svg_style, svg_title } = singleFileBundle
    for (const element of [svg_a, svg_script, svg_style, svg_title]) {
      expect(namespaceOfRendered(element())).toBe(SVG_NAMESPACE)
    }
    const { a: htmlA, script: htmlScript, style: htmlStyle, title: htmlTitle } = singleFileBundle
    for (const element of [htmlA, htmlScript, htmlStyle, htmlTitle]) {
      expect(namespaceOfRendered(element())).toBe(HTML_NAMESPACE)
    }
  })

  it('exports the custom element factories from the single-file bundle', () => {
    expect(namespaceOfRendered(singleFileBundle.domElement('my-widget')())).toBe(HTML_NAMESPACE)
    expect(namespaceOfRendered(singleFileBundle.svgElement('my-shape')())).toBe(SVG_NAMESPACE)
  })
})
