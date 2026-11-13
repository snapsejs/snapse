import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'

// Memoization is an internal optimization: across an array-state update, the controller for an
// unchanged state is reused rather than rebuilt. Observable proxy = DOM node identity is preserved.

const findText = (root: Node, content: string): Node | null => {
  for (const n of Array.from(root.childNodes)) {
    if (n.nodeType === 3 && n.textContent === content) return n
    const found = findText(n, content)
    if (found) return found
  }
  return null
}

describe('nested-array state memoization', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
  })

  it('reuses the node for a state nested inside an array across an outer update', () => {
    const app = document.getElementById('app')!
    const inner = state('B')
    const outer = state(['x', [inner]] as unknown[])
    SnapseRoot({ root: app }, div({}, outer as never))
    flush()

    const before = findText(app, 'B')
    expect(before).not.toBeNull()

    // change the sibling but keep the nested `inner` state; a memoized controller keeps its node.
    outer.set(['y', [inner]])
    flush()

    expect(findText(app, 'y')).not.toBeNull()
    expect(findText(app, 'B')).toBe(before)

    // the reused controller's subscription is still live.
    inner.set('C')
    flush()
    expect((before as Node).textContent).toBe('C')
  })
})
