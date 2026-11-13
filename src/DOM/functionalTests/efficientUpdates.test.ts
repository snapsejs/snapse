import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'
import type { ChildProp } from '@/DOM/types.js'

describe('test state in the dom', () => {
  let mutations = 0
  let deletions = 0
  const handleMutations = (mutationList: MutationRecord[]) => {
    mutations += mutationList.reduce((acc, r) => acc + r.addedNodes.length, 0)
    deletions += mutationList.reduce((acc, r) => acc + r.removedNodes.length, 0)
  }
  let observer: MutationObserver

  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = 'b<div id="app"></div>e'
    mutations = 0
    deletions = 0
    observer = new MutationObserver(handleMutations)
  })

  it('should not update elements that will be removed', () => {
    const s = state({
      showParent: true,
      showChild: true,
    })

    let parentCreateCount = 0
    let childCreateCount = 0

    const Parent = component(({ children }) => {
      parentCreateCount++
      return div('parent:', children, '!')
    })

    const Child = component(({ children }) => {
      childCreateCount++
      return div('child:', children, '?')
    })

    const myApp = component(() => {
      return s.showParent.opt(Parent(
        s.showChild.opt(
          Child('a'),
          Child('b')),
      ))
    })

    SnapseRoot(myApp())
    flush()
    expect(document.body.textContent).toBe('beparent:child:a?!')
    expect(parentCreateCount).toBe(1)
    expect(childCreateCount).toBe(1)
    s.showChild.set(false)
    s.showParent.set(false)
    flush()
    expect(document.body.textContent).toBe('be')
    expect(parentCreateCount).toBe(1)
    expect(childCreateCount).toBe(1)
  })

  it('should not create a new array element that will be removed in the same flush '
    + '(StateController.level / CallbackTransform priority ordering)', () => {
    // Same "don't do wasted work on a subtree about to be removed" guarantee as the test
    //   above, but exercised through the STATE_ARRAY reconciliation path (a brand-new element
    //   pushed into an array, via StateController's own `child.create(..., this.level + 1)`)
    //   rather than through .opt(). This relies on the ancestor's CallbackTransform (lower
    //   level = lower priority number = processed first in CallbackTransform.flush()'s
    //   priority-sorted queue) tearing the subtree down -- and dequeuing the new array
    //   element's own pending creation -- before that creation would otherwise run.
    let creates = 0
    const MyComponent = component(() => {
      creates++
      return div('x')
    })
    const s = state({ show: true, items: [] as ChildProp[] })
    const inner = component(() => div('inner:', s.items))
    const outer = component(() => s.show.opt(div('outer:', inner())))

    SnapseRoot(outer())
    flush()
    expect(creates).toBe(0)

    s.show.set(false)
    s.items.push(MyComponent())
    flush()
    expect(creates).toBe(0)
    expect(document.body.textContent).toBe('be')
  })

  it('should update the DOM efficiently for sorted chaotic array', () => {
    const s = state({
      arr: [4, 6, 2, 5, 1, 9, 8, 3, 7],
    })

    const myApp = component(() => {
      return div(
        s.arr.map(n => div(n)),
      )
    })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('b462519837e')
    observer.observe(root, { childList: true, subtree: true })
    s.arr.sort((a, b) => a - b)
    flush()
    expect(document.body.textContent).toBe('b123456789e')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(6)
    expect(deletions).toBe(6)
    observer.disconnect()
  })

  it('should update the DOM efficiently for sorted near sorted array', () => {
    const s = state({
      arr: [6, 1, 2, 3, 4, 7, 8, 5, 9],
    })

    const myApp = component(() => {
      return div(
        s.arr.map(n => div(n)),
      )
    })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('b612347859e')
    observer.observe(root, { childList: true, subtree: true })
    s.arr.sort((a, b) => a - b)
    flush()
    expect(document.body.textContent).toBe('b123456789e')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(2)
    expect(deletions).toBe(2)
    observer.disconnect()
  })

  it('should update the DOM efficiently for moved item', () => {
    const s = state({
      arr: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    })

    const myApp = component(() => {
      return div(
        s.arr.map(n => div(n)),
      )
    })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('b123456789e')
    observer.observe(root, { childList: true, subtree: true })
    const moved = s.arr.splice(6, 1)[0]!
    s.arr.splice(3, 0, moved)
    flush()
    expect(document.body.textContent).toBe('b123745689e')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(1)
    expect(deletions).toBe(1)
    observer.disconnect()
  })

  it('should update the DOM efficiently for deleted item', () => {
    const s = state({
      arr: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    })

    const myApp = component(() => {
      return div(
        s.arr.map(n => div(n)),
      )
    })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('b123456789e')
    observer.observe(root, { childList: true, subtree: true })
    s.arr.splice(0, 1)
    flush()
    expect(document.body.textContent).toBe('b23456789e')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(0)
    expect(deletions).toBe(1)
    observer.disconnect()
  })

  it('should update the DOM efficiently for inserted item', () => {
    const s = state({
      els: [] as string[],
    })

    const myApp = component(() => {
      return div(
        s.els,
      )
    })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('be')
    observer.observe(root, { childList: true, subtree: true })
    s.els.push('sill')
    flush()
    expect(document.body.textContent).toBe('bsille')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(1)
    expect(deletions).toBe(0)
    observer.disconnect()
  })

  it('should update the DOM efficiently for deleted items', () => {
    const s = state({
      els: [1, 2, 3, 4, 5],
    })

    const myApp = component(() => {
      return div(
        s.els,
      )
    })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('b12345e')
    observer.observe(root, { childList: true, subtree: true })
    s.els.set([])
    flush()
    expect(document.body.textContent).toBe('be')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(0)
    expect(deletions).toBe(5)
    observer.disconnect()
  })

  it('should update the DOM efficiently for deleted items in flat structure', () => {
    const s = state({
      els: [1, 2, 3, 4, 5],
    })

    const myApp = component(() => {
      return div(
        0,
        s.els,
      )
    })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('b012345e')
    observer.observe(root, { childList: true, subtree: true })
    s.els.set([])
    flush()
    expect(document.body.textContent).toBe('b0e')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(0)
    expect(deletions).toBe(5)
    observer.disconnect()
  })

  it('should update the DOM efficiently for deleted items in flat structure 2', () => {
    const s = state({
      els: [1, 2, 3, 4, 5],
    })

    const myApp = component(() => {
      return div(
        s.els,
        9,
      )
    })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('b123459e')
    observer.observe(root, { childList: true, subtree: true })
    s.els.set([])
    flush()
    expect(document.body.textContent).toBe('b9e')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(0)
    expect(deletions).toBe(5)
    observer.disconnect()
  })

  it('should update the DOM efficiently for inserted items', () => {
    const s = state({
      els: [] as number[],
    })

    const myApp = component(() => {
      return div(
        s.els,
      )
    })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('be')
    observer.observe(root, { childList: true, subtree: true })
    s.els.set([1, 2, 3, 4, 5])
    flush()
    expect(document.body.textContent).toBe('b12345e')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(5)
    expect(deletions).toBe(0)
    observer.disconnect()
  })

  it('should reorder a directly-rendered (non-mapped) array of raw values', () => {
    const s = state({ els: [1, 2, 3, 4, 5, 6, 7, 8, 9] })
    const myApp = component(() => div(s.els))
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('b123456789e')
    const moved = s.els.splice(6, 1)[0]!
    s.els.splice(3, 0, moved)
    flush()
    expect(document.body.textContent).toBe('b123745689e')
  })

  it('should update the DOM efficiently when adding, moving and deleting items', () => {
    const s = state({
      els: 'AEFGHIJKLMNOPQRST'.split(''),
    })

    const myApp = component(() => {
      return div(
        s.els.map(v => v),
      )
    })
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('bAEFGHIJKLMNOPQRSTe')
    observer.observe(root, { childList: true, subtree: true })
    s.els.splice(1, 0, ...s.els.splice(8, 4))
    s.els.splice(13, 3)
    s.els.splice(1, 0, ...'BCD'.split(''))
    flush()
    expect(document.body.textContent).toBe('bABCDLMNOEFGHIJKPTe')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(7)
    expect(deletions).toBe(7)
    observer.disconnect()
  })

  it('should insert appended mapped children exactly once', () => {
    const s = state<{ arr: number[] }>({ arr: [1, 2, 3] })
    const myApp = component(() => div(s.arr.map(n => div(n))))
    const root = document.getElementById('app')!
    SnapseRoot({ root }, myApp())
    flush()
    expect(document.body.textContent).toBe('b123e')
    observer.observe(root, { childList: true, subtree: true })
    s.arr.push(4, 5)
    flush()
    expect(document.body.textContent).toBe('b12345e')
    handleMutations(observer.takeRecords())
    expect(mutations).toBe(2)
    expect(deletions).toBe(0)
    observer.disconnect()
  })

  it('inserts before a sibling whose own leading child renders nothing', () => {
    // NodeController.getNode() used to only ever look at this.c[0] to find "the first real DOM
    //   node for this controller's content" -- if that leading child itself rendered zero nodes
    //   (e.g. a currently-false .opt() slot) it returned undefined instead of walking on to a
    //   later sibling that does have content. insertChild() then fell back to `this.nxt`, placing
    //   the new node at the very end of the whole array instead of before its intended sibling.
    const s = state({ mid: false })
    const nextComplex = state([s.mid.opt(div('hidden')), div('real')] as ChildProp[])
    const arr = state([div('A'), nextComplex, div('B')] as ChildProp[])
    SnapseRoot({ root: document.getElementById('app') }, div(arr))
    flush()
    expect(document.getElementById('app')!.textContent).toBe('ArealB')

    arr.splice(1, 0, div('C'))
    flush()
    expect(document.getElementById('app')!.textContent).toBe('ACrealB')
  })
})
