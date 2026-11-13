import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { a, span, table, tbody, td, tr } from '@/DOM/elements/DOMElements.js'
import { NodeController } from '@/DOM/nodeControllers/NodeController.js'

const N = 1000

const proto = NodeController.prototype as unknown as Record<string, (...args: unknown[]) => unknown>

const spies = {
  build: vi.spyOn(proto, 'build'),
  addChildren: vi.spyOn(proto, 'addChildren'),
  parseArgsRecursive: vi.spyOn(proto, 'parseArgsRecursive'),
  getNodes: vi.spyOn(proto, 'getNodes'),
  getFirstNode: vi.spyOn(proto, 'getFirstNode'),
  remove: vi.spyOn(proto, 'remove'),
  removeChildren: vi.spyOn(proto, 'removeChildren'),
  findNode: vi.spyOn(proto, 'findNode'),
}

const makeRow = (id: number, label: string) => tr(
  { id: `row-${id}` },
  td({ class: 'cl-1' }, String(id)),
  td({ class: 'cl-4' }, a({ click: () => {} }, label)),
  td({ class: 'cl-1' }, a({ click: () => {} }, span({ class: 'klopp' }))),
  td({ class: 'cl-6' }),
)

// Spies cannot work in CC build mode because it will modify a different instance
describe.skipIf(process.env.CC_BUILD === 'true')('row creation recursion counts', () => {
  beforeEach(() => {
    setupDOM()
    Object.values(spies).forEach(sp => sp.mockClear())
  })

  it('counts recursive NodeController calls for empty -> 1000 rows', () => {
    const s = state({ rows: [] as string[] })
    const myApp = component(() => table(tbody(s.rows.map((label, i) => makeRow(i, label)))))
    SnapseRoot({ root: document.body }, myApp())
    flush()

    Object.values(spies).forEach(sp => sp.mockClear())
    s.rows.set(Array.from({ length: N }, (_, i) => `label-${i}`))
    flush()

    expect(document.body.querySelectorAll('tr').length).toBe(N)

    if (process.env.VERBOSE_BUILD === 'true') {
      const report = Object.entries(spies).map(([fn, sp]) => ({
        fn, calls: sp.mock.calls.length, perRow: (sp.mock.calls.length / N).toFixed(2),
      }))
      console.table(report)
    }

    // Each row's mapped value comes back from MapArrayTransform wrapped in its own StateController
    // (so a later single-row update, e.g. "Update every 10th row", can re-run just that row). That
    // wrapper has no .el, so reaching the row's real <tr> element means looking one level past it.
    // Callers (StateController's insertChild/moveChild) call getFirstNode() directly -- a dedicated
    // single-node recursive walk (NOT getNodes(), which collects every descendant node via flatMap
    // -- wasteful here since only the first is ever needed, and this is a hot path; there's also no
    // separate getNode() wrapper method anymore, its this.el fast-path folded into getFirstNode()
    // itself). getFirstNode() must be able to walk past a leading child that itself renders zero
    // nodes (e.g. a currently-false .opt() slot) to a later sibling, so it can't just peek at
    // this.c[0]. It costs 2x per post-initial-mount row (N-1 calls from insertChild/moveChild, one
    // frame for the wrapper, one recursing into the row's own <tr>). getNodes() is untouched by any
    // of this, so it stays at its original baseline (2x/row, from other callers). findNode still
    // recurses through a *different* controller (this.par) to locate a DOM anchor, so it still pays
    // ~2x/row.
    // build/addChildren scale with per-row node count (10 NodeControllers: the wrapper + tr + 4 td +
    // 2 a + span + the label's StateController). parseArgsRecursive skips the label's StateController,
    // whose string value becomes a text node directly, and adds one whole-batch call for the array.
    expect(spies.findNode.mock.calls.length).toBe(2 * N + 2)
    expect(spies.getFirstNode.mock.calls.length).toBe(2 * (N - 1))
    expect(spies.getNodes.mock.calls.length).toBe(2 * N)
    expect(spies.remove.mock.calls.length).toBe(0)
    expect(spies.removeChildren.mock.calls.length).toBe(0)
    expect(spies.build.mock.calls.length).toBe(10 * N)
    expect(spies.addChildren.mock.calls.length).toBe(10 * N)
    expect(spies.parseArgsRecursive.mock.calls.length).toBe(9 * N + 1)
  })
})
