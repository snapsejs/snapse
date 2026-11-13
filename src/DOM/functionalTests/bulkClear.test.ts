import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, state, subscribe } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'

describe('clearing a list', () => {
  let records: MutationRecord[]
  let observer: MutationObserver
  const observe = (target: Node) => {
    records = []
    observer = new MutationObserver(list => records.push(...list))
    observer.observe(target, { childList: true, subtree: true })
  }
  const takeRecords = () => {
    records.push(...observer.takeRecords())
    observer.disconnect()
    return records
  }
  const removedNodeCount = (rs: MutationRecord[]) => rs.reduce((n, r) => n + r.removedNodes.length, 0)

  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = 'b<div id="app"></div>e'
  })

  it('removes all items of a list inside an element in a single mutation', () => {
    const s = state({ arr: [1, 2, 3, 4] })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, component(() => div(s.arr.map(n => div(n))))())
    flush()
    expect(document.body.textContent).toBe('b1234e')
    observe(root)
    s.arr.set([])
    flush()
    expect(document.body.textContent).toBe('be')
    const rs = takeRecords()
    expect(rs.length).toBe(1)
    expect(removedNodeCount(rs)).toBe(4)
  })

  it('removes all items of a list rendered directly into the root in a single mutation', () => {
    const s = state({ arr: [1, 2, 3, 4] })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, s.arr.map(n => div(n)))
    flush()
    expect(document.body.textContent).toBe('b1234e')
    observe(root)
    s.arr.set([])
    flush()
    expect(document.body.textContent).toBe('be')
    const rs = takeRecords()
    expect(rs.length).toBe(1)
    expect(removedNodeCount(rs)).toBe(4)
  })

  it('removes all items of a list held by an outer state array in a single mutation', () => {
    const s = state({ arr: [1, 2, 3, 4] })
    const root = document.getElementById('app')!
    const outer = state([s.arr.map(n => div(n))])
    SnapseRoot({ root }, div(outer))
    flush()
    expect(document.body.textContent).toBe('b1234e')
    observe(root)
    s.arr.set([])
    flush()
    expect(document.body.textContent).toBe('be')
    const rs = takeRecords()
    expect(rs.length).toBe(1)
    expect(removedNodeCount(rs)).toBe(4)
    s.arr.set([5])
    flush()
    expect(document.body.textContent).toBe('b5e')
  })

  it('renders items added again before the end of the flush', () => {
    const s = state({ arr: ['a', 'b'] })
    const clearTrigger = state(0)
    const refillTrigger = state(0)
    const root = document.getElementById('app')!
    SnapseRoot({ root }, component(() => {
      subscribe(clearTrigger, () => {
        s.arr.set([])
        refillTrigger.set(1)
      })
      subscribe(refillTrigger, () => s.arr.push('z'))
      return div(s.arr)
    })())
    flush()
    expect(root.textContent).toBe('ab')
    observe(root)
    clearTrigger.set(1)
    flush()
    expect(root.textContent).toBe('z')
    const removals = takeRecords().filter(r => r.removedNodes.length)
    expect(removals.length).toBe(1)
    expect(removedNodeCount(removals)).toBe(2)
  })

  it('keeps content rendered in the same flush beside a list that renders nothing', () => {
    const s = state({ arr: ['a', 'b'], extra: [] as string[] })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, div(s.arr, s.extra))
    flush()
    expect(root.textContent).toBe('ab')
    s.arr.set([])
    s.extra.set(['x'])
    flush()
    expect(root.textContent).toBe('x')
  })

  it.each([false, true])('moves items to a sibling list emptied in the same flush (gaining list first: %s)',
    gainingFirst => {
      const s = state({ rows: [1, 2, 3].map(id => ({ id, done: false })) })
      const items = s.rows.map(row => div(row.id))
      const todo = items.filter((_: unknown, i: number) => s.rows[i]!.done == false)
      const done = items.filter((_: unknown, i: number) => s.rows[i]!.done == true)
      const todoList = div({ class: 'todo' }, todo)
      const doneList = div({ class: 'done' }, done)
      SnapseRoot(div(gainingFirst ? [doneList, todoList] : [todoList, doneList]))
      flush()
      const before = Array.from(document.querySelector('.todo')!.children)
      expect(before.map(e => e.textContent)).toEqual(['1', '2', '3'])
      for (let i = 0; i < s.rows.length; i++) s.rows[i]!.done.set(true)
      flush()
      expect(document.querySelector('.todo')!.children.length).toBe(0)
      const after = Array.from(document.querySelector('.done')!.children)
      expect(after.map(e => e.textContent)).toEqual(['1', '2', '3'])
      expect(after).toEqual(before)
      after.forEach((e, i) => expect(e).toBe(before[i]))
    })
})
