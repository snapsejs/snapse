import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'
import { NodeController } from '@/DOM/nodeControllers/NodeController.js'
import { StateController } from '@/DOM/nodeControllers/StateController.js'

const cc = process.env.CC_BUILD === 'true'

const trackCreatedStateControllers = () => {
  const created: StateController[] = []
  const proto = NodeController.prototype as unknown as { create: (...a: unknown[]) => unknown }
  const orig = proto.create
  proto.create = function (this: NodeController, ...args: unknown[]) {
    if (this instanceof StateController) created.push(this)
    return orig.apply(this, args)
  }
  return { created, restore: () => (proto.create = orig) }
}

describe('rows of a derived array', () => {
  beforeEach(() => {
    setupDOM()
  })

  it.skipIf(cc)('are rendered without a StateController of their own', () => {
    const s = state({ rows: ['a', 'b'] })
    const { created, restore } = trackCreatedStateControllers()
    try {
      SnapseRoot(div(s.rows.map(row => div(row))))
      flush()
      s.rows.set(['c', 'd', 'e'])
      flush()
    } finally {
      restore()
    }
    expect(document.body.textContent).toBe('cde')
    const wrappers = created.filter(sc => sc.par instanceof StateController)
    expect(wrappers.length).toBe(0)
  })
})
