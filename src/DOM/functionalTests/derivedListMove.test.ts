import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, flush, peek, state } from '@/index.js'
import type { State } from '@/state/types/types.js'
import { div } from '@/DOM/elements/DOMElements.js'

type RowKind = 'with reactive content' | 'with static content' | 'rendered by a component'

// Both lists hold the very same row controllers, taken from one mapped array
const build = (kind: RowKind, swapped: boolean) => {
  const s = state({ rows: ['a', 'b', 'c'], done: [false, false, false] })
  const Row = component(({ row }: { row: State<string> }) => div({ class: 'row' }, row))
  const labels = ['a', 'b', 'c']
  let next = 0
  const rows = s.rows.map(row => kind === 'with reactive content'
    ? div({ class: 'row' }, row)
    : kind === 'with static content'
      ? div({ class: 'row' }, labels[next++]!)
      : Row({ row }))
  const todo = compute(() => peek(rows).filter((_r, i) => s.done[i] == false))
  const done = compute(() => peek(rows).filter((_r, i) => s.done[i] == true))
  const lists = [div({ class: 'todo' }, todo), div({ class: 'done' }, done)]
  const root = document.getElementById('app')!
  SnapseRoot({ root }, div(swapped ? lists.reverse() : lists))
  flush()
  return {
    s,
    todo: root.querySelector('.todo')!,
    done: root.querySelector('.done')!,
  }
}

describe('moving a row between lists derived from the same mapped array', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
  })

  it.each([
    ['with reactive content', false], ['with reactive content', true],
    ['with static content', false], ['with static content', true],
    ['rendered by a component', false], ['rendered by a component', true],
  ] as [RowKind, boolean][])('keeps the element of a row %s (lists swapped: %s)', (kind, swapped) => {
    const { s, todo, done } = build(kind, swapped)
    expect(todo.textContent).toBe('abc')
    const b = todo.children[1]!

    s.done[1]!.set(true)
    flush()
    expect(todo.textContent).toBe('ac')
    expect(done.textContent).toBe('b')
    expect(done.children[0]).toBe(b)

    s.done[1]!.set(false)
    flush()
    expect(todo.textContent).toBe('abc')
    expect(done.textContent).toBe('')
    expect(todo.children[1]).toBe(b)
  })

  it.each([false, true])('keeps the text node of a row a component renders as text (lists swapped: %s)',
    swapped => {
      const s = state({ rows: ['a', 'b', 'c'], done: [false, false, false] })
      const Label = component(({ label }: { label: string }) => label)
      const labels = ['a', 'b', 'c']
      let next = 0
      const rows = s.rows.map(() => Label({ label: labels[next++]! }))
      const todo = compute(() => peek(rows).filter((_r, i) => s.done[i] == false))
      const done = compute(() => peek(rows).filter((_r, i) => s.done[i] == true))
      const lists = [div({ class: 'todo' }, todo), div({ class: 'done' }, done)]
      const root = document.getElementById('app')!
      SnapseRoot({ root }, div(swapped ? lists.reverse() : lists))
      flush()
      const todoEl = root.querySelector('.todo')!
      const doneEl = root.querySelector('.done')!
      expect(todoEl.textContent).toBe('abc')
      const b = todoEl.childNodes[1]!

      s.done[1]!.set(true)
      flush()
      expect(todoEl.textContent).toBe('ac')
      expect(doneEl.childNodes[0]).toBe(b)

      s.done[1]!.set(false)
      flush()
      expect(todoEl.textContent).toBe('abc')
      expect(doneEl.textContent).toBe('')
      expect(todoEl.childNodes[1]).toBe(b)
    })
})
