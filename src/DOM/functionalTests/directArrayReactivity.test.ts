import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, flush, peek, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'

// A state array rendered directly (no .map()/.filter()) must make each element independently
// reactive: `arr[i].set(v)` should update the DOM, just as it does for a `.map()`-derived list or
// an object property. Today only `arr[i] = v` (which notifies the whole array) works.

/* eslint-disable @typescript-eslint/no-explicit-any */

// skipIf(cc): the pre-built Closure bundle won't carry the element-promotion change until rebuilt.
describe.skipIf(process.env.CC_BUILD === 'true')('directly-rendered array element reactivity', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
  })
  const app = () => document.getElementById('app')!

  it('a primitive element is reactive to .set()', () => {
    const a = state<any[]>([])
    SnapseRoot({ root: app() }, a)
    flush()
    a.push('x')
    flush()
    expect(app().textContent).toBe('x')

    a[0].set('y')
    flush()
    expect(app().textContent).toBe('y')
  })

  it('still supports replacing an element via `arr[i] = v`', () => {
    const a = state<any[]>(['x'])
    SnapseRoot({ root: app() }, a)
    flush()
    expect(app().textContent).toBe('x')

    a[0] = 'y'
    flush()
    expect(app().textContent).toBe('y')
  })

  it('an element-controller element keeps identity and is independently reactive', () => {
    const s = state({ label: 'hi' })
    const a = state<any[]>([])
    SnapseRoot({ root: app() }, a)
    flush()
    a.push(div(s.label))
    flush()
    expect(app().textContent).toBe('hi')
    const node = app().querySelector('div')

    s.label.set('bye')
    flush()
    expect(app().textContent).toBe('bye')
    expect(app().querySelector('div')).toBe(node) // not rebuilt
  })

  it('reordering a direct array of controllers still produces moves, not rebuilds', () => {
    const x = div('x')
    const y = div('y')
    const z = div('z')
    const a = state<any[]>([x, y, z])
    SnapseRoot({ root: app() }, a)
    flush()
    const xNode = app().querySelector('div')
    expect(app().textContent).toBe('xyz')
    a.set([a[2], a[0], a[1]])
    flush()
    expect(app().textContent).toBe('zxy')
    expect([...app().querySelectorAll('div')].find(n => n.textContent === 'x')).toBe(xNode)
  })

  it('leaves nested arrays flattened (not promoted) and cleans them up', () => {
    const a = state<any[]>([['p'], ['q']])
    // a nested raw array stays raw (parseArgsRecursive flattens it) rather than being promoted to
    //   a per-element wrapper, so its primitives render as bare Text nodes
    SnapseRoot({ root: app() }, div(a, 'z'))
    flush()
    expect(app().textContent).toBe('pqz')

    a.set([['r']])
    flush()
    expect(app().textContent).toBe('rz')

    a.set([])
    flush()
    expect(app().textContent).toBe('z')
  })

  it('handles nested-array primitives in a movable container', () => {
    const a = state<any[]>([['p'], ['q']])
    SnapseRoot({ root: app() }, div(a)) // sole child -> movable container
    flush()
    expect(app().textContent).toBe('pq')

    a.set([['q'], ['p']])
    flush()
    expect(app().textContent).toBe('qp')

    a.set([])
    flush()
    expect(app().textContent).toBe('')
  })

  it('cleans up a nested-array primitive in a non-movable container', () => {
    // Root-mounted array -> parent is not an element -> not a movable container, so a removed
    // child is torn down immediately rather than deferred. The child here is a bare Text node
    // (a nested raw array is flattened, not promoted), exercising the non-movable removeChild path.
    const a = state<any[]>([['p'], ['q']])
    SnapseRoot({ root: app() }, a)
    flush()
    expect(app().textContent).toBe('pq')

    a.set([['p']])
    flush()
    expect(app().textContent).toBe('p')
  })

  // A movable container with a trailing sibling defers its removals to flushPendingWork, leaving
  //   nodes that are still in the DOM but no longer in the container's node count. A later sibling
  //   reconciling in the same flush must still position itself past them (liveChildAt skips the
  //   pending nodes when resolving physical indices).
  it('positions a trailing sibling list correctly when the preceding list defers a removal', () => {
    const listA = state<any[]>(['a1', 'a2', 'a3'])
    const listB = state<any[]>(['b1'])
    SnapseRoot({ root: app() }, div(listA, listB))
    flush()
    expect(app().textContent).toBe('a1a2a3b1')

    listA.set(['a1', 'a3'])
    listB.set(['b1', 'b2'])
    flush()
    expect(app().textContent).toBe('a1a3b1b2')
  })

  it('positions correctly when a trailing sibling list gains many items while the first defers', () => {
    const listA = state<any[]>(['a1', 'a2', 'a3', 'a4'])
    const listB = state<any[]>(['b1'])
    SnapseRoot({ root: app() }, div(listA, listB))
    flush()

    listA.set(['a1', 'a4'])
    listB.set(['b1', 'b2', 'b3', 'b4', 'b5'])
    flush()
    expect(app().textContent).toBe('a1a4b1b2b3b4b5')
  })

  it('unmounts an element that rendered nothing when it is removed', () => {
    const items = state<any[]>(['a', null, 'c'])
    SnapseRoot({ root: app() }, div(items).catch('failed'))
    flush()
    const removed = items[1]!
    items.splice(1, 1)
    flush()
    expect(app().textContent).toBe('ac')
    removed.set('x')
    flush()
    expect(app().textContent).toBe('ac')
  })

  it('inserts before an element that renders nothing at its own position', () => {
    const items = state<any[]>(['a', null, 'c'])
    SnapseRoot({ root: app() }, div(items, 'z'))
    flush()
    items.splice(1, 0, 'b')
    items.splice(4, 0, 'd')
    flush()
    expect(app().textContent).toBe('abcdz')
    items[2]!.set('n')
    flush()
    expect(app().textContent).toBe('abncdz')
  })

  it('reorders correctly when an item moves to the other end and the item it displaces is replaced', () => {
    const items = state<any[]>(['a', 'b', 'c'])
    SnapseRoot({ root: app() }, div(items, 'z'))
    flush()
    const [a, b] = [items[0]!, items[1]!]
    items.set(['x', b, a])
    flush()
    expect(app().textContent).toBe('xbaz')
    const x = items[0]!
    items.set([a, b, 'y'])
    flush()
    expect(app().textContent).toBe('abyz')
    items.set([x, b, a])
    flush()
    expect(app().textContent).toBe('xbaz')
  })

  it('swaps two distant items and two neighbouring items in place', () => {
    const items = state<any[]>(['a', 'b', 'c', 'd'])
    SnapseRoot({ root: app() }, div(items, 'z'))
    flush()
    const elements = () => Array.from(app().firstChild!.childNodes)
    const [nodeA, nodeD] = [elements()[0], elements()[3]]
    const [a, b, c, d] = [items[0]!, items[1]!, items[2]!, items[3]!]
    items.set([d, b, c, a])
    flush()
    expect(app().textContent).toBe('dbcaz')
    expect([elements()[0], elements()[3]]).toStrictEqual([nodeD, nodeA])
    items.set([d, c, b, a])
    flush()
    expect(app().textContent).toBe('dcbaz')
  })

  it('keeps the DOM in order and reuses kept nodes through random edits', () => {
    let seed = 11
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    let next = 0
    const newStates = (count: number) => Array.from({ length: count }, () => state(`v${next++},`))
    const items = state<any[]>(newStates(20))
    SnapseRoot({ root: app() }, div('a', items, 'z'))
    flush()
    const edits: ((elements: any[]) => void)[] = [
      elements => elements.splice(rand(elements.length + 1), 1),
      elements => elements.splice(rand(elements.length + 1), 1 + rand(4)),
      elements => elements.splice(rand(elements.length + 1), 0, ...newStates(1 + rand(3))),
      elements => elements.splice(rand(elements.length + 1), 0, ...elements.splice(rand(elements.length), 1)),
      elements => elements.splice(rand(elements.length + 1), 1, ...newStates(1)),
      elements => elements.reverse(),
      elements => elements.sort(() => rand(3) - 1),
    ]
    const nodeOf = new Map<unknown, ChildNode>()
    for (let round = 0; round < 300; round++) {
      const elements = Array.from({ length: items.length }, (_, i) => items[i]!)
      const textNodes = Array.from(app().firstChild!.childNodes).slice(1, -1)
      elements.forEach((element, i) => nodeOf.set(element, textNodes[i]!))
      edits[rand(edits.length)]!(elements)
      items.set(elements)
      flush()
      expect(app().textContent).toBe(`a${elements.map(e => peek(e)).join('')}z`)
      const after = Array.from(app().firstChild!.childNodes).slice(1, -1)
      elements.forEach((element, i) => {
        if (nodeOf.has(element)) expect(after[i]).toBe(nodeOf.get(element))
      })
    }
  })
})
