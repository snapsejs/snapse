import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, flush, state } from '@/index.js'
import { div, span } from '@/DOM/elements/DOMElements.js'
import { NodeController } from '@/DOM/nodeControllers/NodeController.js'
import type { ChildProp } from '@/DOM/types.js'

const cc = process.env.CC_BUILD === 'true'

const trackCreatedElements = () => {
  const created: NodeController[] = []
  const proto = NodeController.prototype as unknown as { build: (...a: unknown[]) => unknown }
  const orig = proto.build
  proto.build = function (this: NodeController, ...args: unknown[]) {
    const result = orig.apply(this, args)
    if (this.constructor.name === 'ElementController') created.push(this)
    return result
  }
  return { created, restore: () => (proto.build = orig) }
}

const retainsArgs = (c: NodeController) => (c as unknown as { args?: unknown }).args !== undefined

describe('promoted array element args', () => {
  beforeEach(() => {
    setupDOM()
  })

  it.skipIf(cc)('does not retain the args of elements rendered by a mapped list', () => {
    const s = state({ rows: ['a', 'b'] })
    const { created, restore } = trackCreatedElements()
    SnapseRoot(div(s.rows.map(row => div(span(row)))))
    flush()
    restore()
    expect(document.body.textContent).toBe('ab')
    const rowElements = created.filter(c => {
      const el = (c as unknown as { el: Element }).el
      return el.nodeName === 'DIV' && el.parentElement?.nodeName === 'DIV'
    })
    expect(rowElements.length).toBe(2)
    expect(rowElements.filter(retainsArgs).length).toBe(0)
  })

  it.skipIf(cc)('does not retain the args of mapped rows that read no state, nor of rows added later', () => {
    const s = state({ rows: ['a', 'b'] })
    const { created, restore } = trackCreatedElements()
    SnapseRoot(div(s.rows.map(() => div(span('x')))))
    flush()
    s.rows.push('c')
    flush()
    restore()
    expect(document.body.textContent).toBe('xxx')
    const rowElements = created.filter(c => {
      const el = (c as unknown as { el: Element }).el
      return el.nodeName === 'DIV' && el.parentElement?.nodeName === 'DIV'
    })
    expect(rowElements.length).toBe(3)
    expect(rowElements.filter(retainsArgs).length).toBe(0)
  })

  it.skipIf(cc)('re-renders an element reinstated into a directly rendered array', () => {
    const el = div(span('x'))
    const items = state<ChildProp[]>([el])
    SnapseRoot(div(items))
    flush()
    expect(document.body.textContent).toBe('x')
    items.set([])
    flush()
    expect(document.body.textContent).toBe('')
    items.set([el])
    flush()
    expect(document.body.textContent).toBe('x')
  })
})
