import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'

describe('test state in the dom', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should only update the textcontent when a primitive state changes', () => {
    const p = state('sill')
    const myApp = component(() => {
      return div(
        { id: 'primitive-test' },
        'Primitive: ',
        p,
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const targetNode = document.getElementById('primitive-test') as HTMLElement
    flush()
    const primitiveChild = targetNode.childNodes[1] as Text
    expect(document.body.textContent).toBe('Primitive: sill')
    p.set('lax')
    flush()
    const updatedPrimitiveChild = targetNode.childNodes[1] as Text
    expect(document.body.textContent).toBe('Primitive: lax')
    expect(primitiveChild === updatedPrimitiveChild).toBe(true)
  })

  it('renders a static bigint child as text', () => {
    SnapseRoot({ root: document.body }, div('n=', 10n))
    flush()
    expect(document.body.textContent).toBe('n=10')
  })

  it('should update a state that was undefined and becomes a string', () => {
    const p = state<string | undefined>(undefined)
    const myApp = component(() => {
      return div(
        'Primitive: ',
        p,
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('Primitive: ')
    p.set('lax')
    flush()
    expect(document.body.textContent).toBe('Primitive: lax')
  })
})
