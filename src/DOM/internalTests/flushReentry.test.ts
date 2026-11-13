import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { button, div, input, span } from '@/DOM/elements/DOMElements.js'

// Detaching a focused subtree makes the browser fire a synchronous `blur`; if that handler mutates
// state, the Snapse event wrapper runs a nested fastFlush -> a nested flushPendingWork. That must
// not re-process entries the outer flushPendingWork is still tearing down (Chrome throws
// NotFoundError from remove() when a node is detached re-entrantly mid-operation).

/* eslint-disable @typescript-eslint/no-explicit-any */
const cc = process.env.CC_BUILD === 'true'

describe.skipIf(cc)('flushPendingWork re-entrancy', () => {
  let restore: () => void
  let itemRemovals: number

  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
    itemRemovals = 0
    const proto = Element.prototype as unknown as { remove: () => void }
    const orig = proto.remove
    proto.remove = function (this: Element) {
      if (this.classList.contains('item')) itemRemovals++
      const active = document.activeElement
      if (active && active !== document.body && this.parentNode && this.contains(active)) {
        active.dispatchEvent(new Event('blur')) // what Chrome does when a focused node is detached
      }
      return orig.call(this)
    }
    restore = () => {
      proto.remove = orig
    }
  })
  afterEach(() => restore())

  it('deleting an item while its input is focused tears it down exactly once', () => {
    const s = state({
      items: [{ id: 1, text: 'a' }, { id: 2, text: 'b' }] as any[],
      editing: 1,
    })
    const Item = component(({ item }: any) => {
      const onBlur = () => s.editing.set(0)
      const del = () => s.items.splice(s.items.findIndex((x: any) => x === item), 1)
      return div({ class: 'item' },
        s.editing.is(item.id).opt(
          [input({ class: 'edit', blur: onBlur }), button({ class: 'del', mousedown: del }, 'x')],
          span(item.text),
        )) as any
    })
    const app = document.getElementById('app')!
    SnapseRoot({ root: app }, div(s.items.map((item: any) => Item({ item }))))
    flush()
    ;(app.querySelector('.edit') as HTMLInputElement).focus()

    expect(() => {
      app.querySelector('.del')!.dispatchEvent(new Event('mousedown'))
      flush()
    }).not.toThrow()

    expect(itemRemovals).toBe(1)
    expect(app.textContent).toBe('b')
  })

  // The nested fastFlush the blur handler triggers runs a full reconcile, which resolves physical
  // positions with liveChildNodeAt. That reconcile happens while the outer flushPendingWork is
  // mid-drain, so nodes from its batch are still in the document -- liveChildNodeAt must keep
  // skipping them. It does so via the `draining` set, which is only cleared *after* the drain loop;
  // fold that clear into swapDeferredNodes and the nested reconcile miscounts the lingering nodes.
  it('a sibling reconciled from a re-entrant blur flush positions past not-yet-drained nodes', () => {
    const s = state({
      rows: [{ id: 1 }, { id: 2 }] as any[], // both removed in one flush; row 1 holds focus
      tail: ['t0'] as any[], // a reactive region after the list, in the same element
    })
    const Row = component(({ row }: any) =>
      div({ class: `row${row.id}` },
        input({ class: `in${row.id}`, blur: () => s.tail.push('t1') }),
        span(row.id)) as any) // reactive child -> the row div isn't collapsed, so it removes via .el.remove()
    const App = component(() =>
      div(
        s.rows.map((row: any) => Row({ row })),
        s.tail.map((t: any) => span(t)),
      ) as any)

    const app = document.getElementById('app')!
    SnapseRoot({ root: app }, App())
    flush()
    ;(app.querySelector('.in1') as HTMLInputElement).focus()

    s.rows.set([]) // defer-remove both rows; the drain fires blur -> nested flush pushes 't1'
    flush()

    expect(app.querySelector('.row1')).toBeNull()
    expect(app.querySelector('.row2')).toBeNull()
    expect(app.textContent).toBe('t0t1') // not 't1t0'
  })
})
