import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, component, flush, peek, state } from '@/index.js'
import { button, div, h2, input, output, span } from '@/DOM/elements/DOMElements.js'

// jsdom has no moveBefore, so the plain tests exercise the insertBefore fallback. Force it on and
// give it Chromium's pre-move validity check (throws if the node's parent is disconnected), so a
// stale/detached child slipping into reconciliation is caught the way a real browser catches it.
vi.mock('@/DOM/util/moveBeforeSupport.js', () => ({ supportsMoveBefore: true }))

/* eslint-disable @typescript-eslint/no-explicit-any */

const cc = process.env.CC_BUILD === 'true'
type MoveBeforeProto = { moveBefore?: (this: Element, node: Node, ref: Node | null) => void }

describe.skipIf(cc)('cross-container move with moveBefore enabled', () => {
  let restore: () => void
  const movedByMoveBefore: Node[] = []

  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
    movedByMoveBefore.length = 0
    const proto = Element.prototype as unknown as MoveBeforeProto
    const had = 'moveBefore' in Element.prototype
    const original = proto.moveBefore
    proto.moveBefore = function (this: Element, node: Node, ref: Node | null) {
      const np = (node as ChildNode).parentNode
      if (!this.isConnected || !np || !np.isConnected) {
        throw new DOMException(
          'State-preserving atomic move cannot be performed on nodes participating in an invalid hierarchy',
          'HierarchyRequestError',
        )
      }
      movedByMoveBefore.push(node)
      this.insertBefore(node, ref)
    }
    restore = () => {
      if (had) proto.moveBefore = original
      else delete proto.moveBefore
    }
  })
  afterEach(() => restore())

  it('toggles items across two .or()-wrapped lists, both directions, lists emptying', () => {
    const s = state({
      rows: [
        { id: 1, checked: false, text: 'a' },
        { id: 2, checked: true, text: 'b' },
      ] as any[],
      sel: 0,
      q: '',
    })
    const Item = component(({ row }: any) =>
      div({ class: 'item', style: { viewTransitionName: `i${row.id}` } },
        input({ type: 'checkbox', checked: row.checked }),
        s.sel.is(row.id).opt(
          [input({ value: row.text }), button('x')],
          span({ click: () => s.sel.set(row.id) }, row.text),
        )) as any)
    const fb = (m: string) => output(s.q.opt(['no ', s.q], m))
    const App = component(() => {
      const items = s.rows.map((r: any) => Item({ row: r }))
      const todo = items.filter((_c: any, i: number) => s.rows[i].checked == false)
      const done = items.filter((_c: any, i: number) => s.rows[i].checked == true)
      return div(
        div({ class: 'todo' }, h2('To do'), todo.or(fb('nothing to do'))),
        div({ class: 'done' }, h2('Done'), done.or(fb('nothing done'))),
      ) as any
    })
    SnapseRoot({ root: document.getElementById('app')! }, App())
    flush()

    const T = () => document.querySelector('.todo')!.textContent
    const D = () => document.querySelector('.done')!.textContent
    const set = (id: number, v: boolean) => {
      const i = peek(s.rows as any).findIndex((x: any) => Number(peek(x).id) === id)
      s.rows[i].checked.set(v)
      flush()
    }
    expect([T(), D()]).toEqual(['To doa', 'Doneb'])

    expect(() => {
      set(2, false) // b: done -> todo; done empties to its fallback
      set(1, true) // a: todo -> done
      set(1, false) // a: done -> todo (backward); done empties again (fallback reused)
      set(2, true) // b: todo -> done
      set(2, false) // b: back to todo
    }).not.toThrow()

    expect(T()).toContain('a')
    expect(T()).toContain('b')
    expect(D()).toContain('nothing done')
  })

  it('adopts the item across containers with a state-preserving moveBefore', () => {
    const s = state({
      rows: [{ id: 1, checked: false, text: 'a' }, { id: 2, checked: false, text: 'b' }] as any[],
    })
    const Item = component(({ row }: any) => div({ class: 'item' }, span(row.text)) as any)
    const App = component(() => {
      const items = s.rows.map((r: any) => Item({ row: r }))
      const todo = items.filter((_c: any, i: number) => s.rows[i].checked == false)
      const done = items.filter((_c: any, i: number) => s.rows[i].checked == true)
      return div(
        div({ class: 'todo' }, h2('To do'), todo.or(output('none'))),
        div({ class: 'done' }, h2('Done'), done.or(output('none'))),
      ) as any
    })
    SnapseRoot({ root: document.getElementById('app')! }, App())
    flush()
    const itemA = document.querySelector('.todo .item')!
    movedByMoveBefore.length = 0

    s.rows[0].checked.set(true)
    flush()

    // same DOM node, relocated via moveBefore (not detached + re-inserted)
    expect(document.querySelector('.done .item')).toBe(itemA)
    expect(movedByMoveBefore).toContain(itemA)
  })
})
