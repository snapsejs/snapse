import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, flush, peek, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'

// Rendering the result of a chained method that is not special-cased (e.g. filter/slice, which go
// through ChainFunctionTransform rather than MapArrayTransform) and updating its source array.
describe('chained function child controllers', () => {
  beforeEach(() => setupDOM())

  it('renders and updates a filtered list of mapped controllers', () => {
    const s = state({ arr: [1, 2, 3, 4] })
    SnapseRoot(component(() =>
      div(s.arr.map(n => div(n)).filter((_: unknown, i: number) => i % 2 === 0)))())
    flush()
    expect(document.body.textContent).toBe('13')
    s.arr.push(5)
    flush()
    expect(document.body.textContent).toBe('135')
    s.arr.splice(0, 1)
    flush()
    expect(document.body.textContent).toBe('24')
  })

  it('renders and updates a sliced list of mapped controllers', () => {
    const s = state({ arr: [1, 2, 3] })
    SnapseRoot(component(() =>
      div(s.arr.map(n => div(n)).slice(0, 2)))())
    flush()
    expect(document.body.textContent).toBe('12')
    s.arr.push(4)
    flush()
    expect(document.body.textContent).toBe('12')
    s.arr.splice(0, 1)
    flush()
    expect(document.body.textContent).toBe('23')
  })

  it('re-renders a mapped controller that is filtered out and back in', () => {
    const s = state({ arr: [{ n: 1, on: true }, { n: 2, on: true }, { n: 3, on: true }] })
    SnapseRoot(component(() =>
      div(s.arr.map(row => div(row.n)).filter((_: unknown, i: number) => s.arr[i]!.on == true)))())
    flush()
    expect(document.body.textContent).toBe('123')
    s.arr[1]!.on.set(false)
    flush()
    expect(document.body.textContent).toBe('13')
    s.arr[1]!.on.set(true)
    flush()
    expect(document.body.textContent).toBe('123')
  })
  it('re-renders a mapped controller that reads no state when it is filtered out and back in', () => {
    const s = state({ arr: ['a', 'b', 'c'], on: [true, true, true] })
    const rows = s.arr.map(row => div(String(peek(row))))
    SnapseRoot(component(() => div(rows.filter((_: unknown, i: number) => s.on[i] == true)))())
    flush()
    expect(document.body.textContent).toBe('abc')
    s.on[1]!.set(false)
    flush()
    expect(document.body.textContent).toBe('ac')
    s.on[1]!.set(true)
    flush()
    expect(document.body.textContent).toBe('abc')
  })

  it('re-renders a controller created outside a compute when the compute returns it again', () => {
    const s = state({ show: true })
    const d = div('X')
    SnapseRoot(component(() => div(compute(() => s.show == true ? d : null)))())
    flush()
    expect(document.body.textContent).toBe('X')
    s.show.set(false)
    flush()
    expect(document.body.textContent).toBe('')
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('X')
  })

  it('re-renders a mapped row that a compute selects again', () => {
    const s = state({ arr: [{ n: 1 }, { n: 2 }], idx: 0 })
    const rows = s.arr.map(row => div(row.n))
    SnapseRoot(component(() => div(compute(() => rows[Number(s.idx)])))())
    flush()
    expect(document.body.textContent).toBe('1')
    s.idx.set(1)
    flush()
    expect(document.body.textContent).toBe('2')
    s.idx.set(0)
    flush()
    expect(document.body.textContent).toBe('1')
  })
})
