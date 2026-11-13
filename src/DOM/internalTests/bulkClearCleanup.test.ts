import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, flush, state } from '@/index.js'
import { getLightState } from '@/state/state.js'
import { getRefCount } from '@/state/common/refCountAndType.js'
import { div, span } from '@/DOM/elements/DOMElements.js'

const cc = process.env.CC_BUILD === 'true'

describe('clearing a list', () => {
  beforeEach(() => {
    setupDOM()
  })

  it.skipIf(cc).each([
    ['inside an element', true],
    ['rendered directly into the root', false],
  ])('unsubscribes the removed items of a list %s', (_name, insideElement) => {
    const g = state('g')
    const s = state({ rows: [1, 2, 3] })
    const subscriberCount = () => getRefCount(getLightState(g)!)
    const base = subscriberCount()
    const list = s.rows.map(n => div(span(g), n))
    SnapseRoot(insideElement ? div(list) : list)
    flush()
    expect(subscriberCount()).toBe(base + 3)
    s.rows.set([])
    flush()
    expect(document.body.textContent).toBe('')
    expect(subscriberCount()).toBe(base)
  })
})
