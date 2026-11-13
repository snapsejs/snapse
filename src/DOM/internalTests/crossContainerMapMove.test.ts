import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, component, flush, peek, state } from '@/index.js'
import { div, h2, span } from '@/DOM/elements/DOMElements.js'
import { StateController } from '@/DOM/nodeControllers/StateController.js'

// A mapped array split into two filtered views, one per container. Toggling the field the filters
// key on moves an item from one container to the other; the item's component (and DOM) must survive
// the move rather than being torn down and rebuilt -- regardless of which container reconciles first.

/* eslint-disable @typescript-eslint/no-explicit-any */

const cc = process.env.CC_BUILD === 'true'

type Row = { id: number, checked: boolean, text: string }

const build = (
  opts: { swapLists?: boolean, useOr?: boolean, extraChecked?: boolean, sorted?: boolean } = {},
) => {
  let bodyRuns = 0
  const rows: Row[] = [
    { id: 1, checked: false, text: 'a' },
    { id: 2, checked: false, text: 'b' },
    { id: 3, checked: false, text: 'c' },
  ]
  if (opts.extraChecked) rows.push({ id: 4, checked: true, text: 'd' })
  const s = state({ rows: rows as any[] })

  const Item = component(({ row }: any) => {
    bodyRuns++
    return div({ class: 'item' }, span(row.text)) as any
  })

  const App = component(() => {
    const base = opts.sorted
      ? s.rows.toSorted((a: any, b: any) => Number(a.checked) - Number(b.checked))
      : s.rows
    const items = base.map((row: any) => Item({ row }))
    const todo = items.filter((_c: any, i: number) => base[i].checked == false)
    const done = items.filter((_c: any, i: number) => base[i].checked == true)
    const todoView = opts.useOr ? todo.or(div('none')) : todo
    const doneView = opts.useOr ? done.or(div('none')) : done
    const todoDiv = div({ class: 'todo' }, h2('To do'), todoView)
    const doneDiv = div({ class: 'done' }, h2('Done'), doneView)
    return div(opts.swapLists ? [doneDiv, todoDiv] : [todoDiv, doneDiv]) as any
  })

  const rootController = SnapseRoot({ root: document.getElementById('app')! }, App())
  flush()

  const root = document.getElementById('app')!
  return {
    get todo() {
      return root.querySelector('.todo')!
    },
    get done() {
      return root.querySelector('.done')!
    },
    unmount: () => (rootController as any).remove(),
    bodyRuns: () => bodyRuns,
    check: (id: number, value: boolean) => {
      const i = peek(s.rows as any).findIndex((x: any) => Number(peek(x).id) === id)
      s.rows[i].checked.set(value)
      flush()
    },
    checkMany: (changes: [number, boolean][]) => {
      for (const [id, value] of changes) {
        const i = peek(s.rows as any).findIndex((x: any) => Number(peek(x).id) === id)
        s.rows[i].checked.set(value)
      }
      flush()
    },
    span: (text: string, list: Element) =>
      [...list.querySelectorAll('span')].find(e => e.textContent === text),
    rows: s.rows,
  }
}

describe.skipIf(cc)('cross-container move through map().filter()', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
  })

  it('keeps the component and DOM node when an item moves (losing list first)', () => {
    const t = build()
    expect(t.todo.textContent).toBe('To doabc')
    expect(t.done.textContent).toBe('Done')
    const runs = t.bodyRuns()
    const aEl = [...t.todo.querySelectorAll('span')].find(e => e.textContent === 'a')!

    t.check(1, true)

    expect(t.todo.textContent).toBe('To dobc')
    expect(t.done.textContent).toBe('Donea')
    expect(t.bodyRuns()).toBe(runs)
    expect(t.done.querySelector('span')).toBe(aEl)
  })

  it('keeps the component and DOM node when an item moves (gaining list first)', () => {
    const t = build({ swapLists: true })
    const runs = t.bodyRuns()
    const aEl = [...t.todo.querySelectorAll('span')].find(e => e.textContent === 'a')!

    t.check(1, true)

    expect(t.todo.textContent).toBe('To dobc')
    expect(t.done.textContent).toBe('Donea')
    expect(t.bodyRuns()).toBe(runs)
    expect(t.done.querySelector('span')).toBe(aEl)
  })

  it('moves back and forth without rebuilding', () => {
    const t = build({ extraChecked: true })
    const runs = t.bodyRuns()
    const bEl = [...t.todo.querySelectorAll('span')].find(e => e.textContent === 'b')!

    t.check(2, true)
    expect(t.done.textContent).toBe('Donebd')
    expect(t.done.querySelectorAll('span')[0]).toBe(bEl)

    t.check(2, false)
    expect(t.todo.textContent).toBe('To doabc')
    expect([...t.todo.querySelectorAll('span')].find(e => e.textContent === 'b')).toBe(bEl)
    expect(t.bodyRuns()).toBe(runs)
  })

  it('works with an .or() fallback and a list that empties', () => {
    const t = build({ useOr: true })
    // move every item to done -> todo empties and shows the fallback
    const els = ['a', 'b', 'c'].map(x =>
      [...t.todo.querySelectorAll('span')].find(e => e.textContent === x)!)
    const runs = t.bodyRuns()

    t.check(1, true)
    t.check(2, true)
    t.check(3, true)

    expect(t.todo.textContent).toBe('To donone')
    expect(t.done.textContent).toBe('Doneabc')
    expect(t.bodyRuns()).toBe(runs)
    ;['a', 'b', 'c'].forEach((x, i) => {
      expect([...t.done.querySelectorAll('span')].find(e => e.textContent === x)).toBe(els[i])
    })

    // and back
    t.check(1, false)
    expect(t.todo.textContent).toBe('To doa')
    expect([...t.todo.querySelectorAll('span')][0]).toBe(els[0])
    expect(t.bodyRuns()).toBe(runs)
  })

  it('keeps the component when the move also reorders the source array (toSorted)', () => {
    const t = build({ sorted: true, useOr: true })
    const runs = t.bodyRuns()
    const aEl = [...t.todo.querySelectorAll('span')].find(e => e.textContent === 'a')!

    t.check(1, true)

    expect(t.todo.textContent).toBe('To dobc')
    expect(t.done.textContent).toBe('Donea')
    expect(t.bodyRuns()).toBe(runs)
    expect(t.done.querySelector('span')).toBe(aEl)

    t.check(2, true)
    expect(t.done.textContent).toBe('Doneab')
    expect(t.done.querySelector('span')).toBe(aEl)
    expect(t.bodyRuns()).toBe(runs)
  })

  it('handles several items moving into the same list in one flush', () => {
    const t = build({ useOr: true })
    const runs = t.bodyRuns()
    const els = ['a', 'b', 'c'].map(x => t.span(x, t.todo)!)

    t.checkMany([[1, true], [3, true]])

    expect(t.todo.textContent).toBe('To dob')
    expect(t.done.textContent).toBe('Doneac')
    expect(t.bodyRuns()).toBe(runs)
    expect(t.span('a', t.done)).toBe(els[0])
    expect(t.span('c', t.done)).toBe(els[2])
  })

  it('handles items crossing in both directions in one flush', () => {
    const t = build({ extraChecked: true }) // rows: a,b,c unchecked; d checked
    const runs = t.bodyRuns()
    const cEl = t.span('c', t.todo)!
    const dEl = t.span('d', t.done)!

    t.checkMany([[3, true], [4, false]]) // c -> done, d -> todo

    expect(t.todo.textContent).toBe('To doabd')
    expect(t.done.textContent).toBe('Donec')
    expect(t.span('c', t.done)).toBe(cEl)
    expect(t.span('d', t.todo)).toBe(dEl)
    expect(t.bodyRuns()).toBe(runs)
  })

  it('genuinely removed items are still torn down', () => {
    const t = build()
    expect(t.todo.textContent).toBe('To doabc')
    t.rows.splice(1, 1) // remove 'b'
    flush()
    expect(t.todo.textContent).toBe('To doac')
  })

  it('does not duplicate an item that satisfies two overlapping predicates (fan-out)', () => {
    // Overlapping predicates: an item can satisfy both. The single wrapper is *moved* into
    // whichever list reconciles it; a non-reconciling overlapping view loses the item rather than
    // showing a duplicate (the documented "duplicated controller" limitation).
    const s = state({
      rows: [{ id: 1, checked: false, text: 'a' }, { id: 2, checked: false, text: 'b' }] as any[],
    })
    const Item = component(({ row }: any) => div(span(row.text)) as any)
    const App = component(() => {
      const items = s.rows.map((row: any) => Item({ row }))
      const all = items.filter(() => true)
      const checked = items.filter((_c: any, i: number) => s.rows[i].checked == true)
      return div(
        div({ class: 'all' }, h2('All'), all),
        div({ class: 'checked' }, h2('Checked'), checked),
      ) as any
    })
    SnapseRoot({ root: document.getElementById('app')! }, App())
    flush()
    expect(document.querySelector('.all')!.textContent).toBe('Allab')

    expect(() => {
      s.rows[0].checked.set(true) // now satisfies both predicates; `.all` never re-renders
      flush()
    }).not.toThrow()

    expect(document.querySelector('.checked')!.textContent).toContain('a')
    expect(document.querySelector('.all')!.textContent).not.toContain('a')
  })

  it('keeps the DOM correct when an item moves out of a container torn down in the same flush', () => {
    const s = state({
      cond: true,
      rows: [{ id: 1, checked: false, text: 'a' }] as any[],
    })
    const Item = component(({ row }: any) => div({ class: 'row' }, span(row.text)) as any)
    const App = component(() => {
      const items = s.rows.map((row: any) => Item({ row }))
      const done = items.filter((_c: any, i: number) => s.rows[i].checked == true)
      const todo = items.filter((_c: any, i: number) => s.rows[i].checked == false)
      // The gaining list is shallow, so its StateController reconciles first.
      const doneBox = div({ class: 'done' }, done.or(div('none')))
      // The donor list is buried under an opt that closes in the same flush.
      const todoBox = div(div(div(s.cond.opt(div({ class: 'todo' }, todo.or(div('none')))))))
      return div(doneBox, todoBox) as any
    })
    SnapseRoot({ root: document.getElementById('app')! }, App())
    flush()
    expect(document.querySelector('.todo')!.textContent).toBe('a')
    expect(document.querySelector('.done')!.textContent).toBe('none')

    s.rows[0].checked.set(true) // a -> done
    s.cond.set(false) // ...and the todo list is unmounted
    flush()

    expect(document.querySelector('.todo')).toBeNull()
    expect(document.querySelector('.done')!.textContent).toBe('a')
  })

  it('does not leak wrapper registrations after unmount', () => {
    const registry: Map<unknown, unknown> = (StateController as any).movableControllersByDef
    const before = registry.size
    const t = build()
    t.check(1, true)
    t.check(2, true)
    expect(registry.size).toBeGreaterThan(before)
    t.unmount()
    expect(registry.size).toBe(before)
  })

  it('flushPendingWork tolerates an already-detached pending node and drains the set', () => {
    ;(StateController as any).pendingDestroy.add(document.createTextNode('')) // never attached
    expect(() => (StateController as any).flushPendingWork()).not.toThrow()
    expect((StateController as any).pendingDestroy.size).toBe(0)
  })

  // A directly-rendered `.map()` with a single consumer is still on the movable path (its parent is
  // an element), so a mass remove-and-replace goes through pendingDestroy / deferNode /
  // flushPendingWork even though nothing can adopt these children. That path must produce the
  // correct DOM and leave no registrations behind. (See movabilityOverhead.bench.test.ts for cost.)
  it('replaces every child of a single-consumer map list and leaves no wrapper registrations', () => {
    const registry: Map<unknown, unknown> = (StateController as any).movableControllersByDef
    const before = registry.size
    const N = 200
    const initial = Array.from({ length: N }, (_, i) => i)
    const replacement = Array.from({ length: N }, (_, i) => 1000 + i)
    const app = document.getElementById('app')!
    const a = state([...initial])
    const root = SnapseRoot({ root: app }, div(a.map((n: any) => div(n))))
    flush()
    expect(app.textContent).toBe(initial.join(''))
    expect(registry.size).toBe(before)

    a.set([...replacement]) // no identity overlap -> full teardown + rebuild
    flush()
    expect((StateController as any).pendingDestroy.size).toBe(0)
    expect(app.textContent).toBe(replacement.join(''))
    expect(registry.size).toBe(before)

    ;(root as any).remove()
    expect(registry.size).toBe(before)
  })
})
