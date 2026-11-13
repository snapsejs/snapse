import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'

vi.mock('@/DOM/util/moveBeforeSupport.js', () => ({ supportsMoveBefore: true }))

const cc = process.env.CC_BUILD === 'true'

type MoveBeforeProto = { moveBefore?: (this: Element, node: Node, ref: Node | null) => void }

describe('moveBefore for kept-element relocations', () => {
  const moved: Node[] = []
  let restore: () => void

  beforeEach(() => {
    setupDOM()
    moved.length = 0
    const proto = Element.prototype as unknown as MoveBeforeProto
    const had = 'moveBefore' in Element.prototype
    const original = proto.moveBefore
    proto.moveBefore = function (this: Element, node: Node, ref: Node | null) {
      moved.push(node)
      this.insertBefore(node, ref)
    }
    restore = () => {
      if (had) proto.moveBefore = original
      else delete proto.moveBefore
    }
  })

  afterEach(() => restore())

  it.skipIf(cc)('relocates a moved element via moveBefore', () => {
    const s = state({ arr: [1, 2, 3, 4, 5, 6, 7, 8, 9] })
    const app = component(() => div(s.arr.map(n => div(n))))
    SnapseRoot({ root: document.body }, app())
    flush()
    expect(document.body.textContent).toBe('123456789')

    moved.length = 0
    const m = s.arr.splice(6, 1)[0]!
    s.arr.splice(3, 0, m)
    flush()
    expect(document.body.textContent).toBe('123745689')
    expect(moved.length).toBeGreaterThan(0)
  })

  it.skipIf(cc)('relocates multiple elements via moveBefore on a reversal', () => {
    const s = state({ arr: [1, 2, 3, 4, 5] })
    const app = component(() => div(s.arr.map(n => div(n))))
    SnapseRoot({ root: document.body }, app())
    flush()
    expect(document.body.textContent).toBe('12345')

    moved.length = 0
    s.arr.reverse()
    flush()
    expect(document.body.textContent).toBe('54321')
    expect(moved.length).toBeGreaterThan(0)
  })

  it('does not use moveBefore for pure appends', () => {
    const s = state({ arr: [1, 2, 3] })
    const app = component(() => div(s.arr.map(n => div(n))))
    SnapseRoot({ root: document.body }, app())
    flush()

    moved.length = 0
    s.arr.push(4, 5)
    flush()
    expect(document.body.textContent).toBe('12345')
    expect(moved.length).toBe(0)
  })

  it('does not use moveBefore for pure deletions', () => {
    const s = state({ arr: [1, 2, 3, 4, 5] })
    const app = component(() => div(s.arr.map(n => div(n))))
    SnapseRoot({ root: document.body }, app())
    flush()

    moved.length = 0
    s.arr.splice(1, 2)
    flush()
    expect(document.body.textContent).toBe('145')
    expect(moved.length).toBe(0)
  })

  it.skipIf(cc)(
    'relocates a directly-referenced (non-mapped) element',
    () => {
      // A state whose value is directly an array of element controllers: each element is promoted
      // to a per-element wrapper StateController (like a .map() row), and reordering the array
      // relocates the same DOM node via moveBefore.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = state({ arr: [div('a'), div('b'), div('c'), div('d')] as any[] })
      SnapseRoot({ root: document.body }, div(s.arr))
      flush()
      expect(document.body.textContent).toBe('abcd')

      moved.length = 0
      const item = s.arr.splice(0, 1)[0]
      s.arr.splice(2, 0, item)
      flush()
      expect(document.body.textContent).toBe('bcad')
      expect(moved.length).toBeGreaterThan(0)
    })
})

describe('moveBefore for cross-container moves', () => {
  const moved: Node[] = []
  let restore: () => void

  beforeEach(() => {
    setupDOM()
    moved.length = 0
    const proto = Element.prototype as unknown as MoveBeforeProto
    const had = 'moveBefore' in Element.prototype
    const original = proto.moveBefore
    proto.moveBefore = function (this: Element, node: Node, ref: Node | null) {
      moved.push(node)
      this.insertBefore(node, ref)
    }
    restore = () => {
      if (had) proto.moveBefore = original
      else delete proto.moveBefore
    }
  })

  afterEach(() => restore())

  it.skipIf(cc)('uses moveBefore for a cross-container reclaim, preserving identity', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.getElementById('app')!
    const helloController = div('hello') as unknown as { el?: HTMLElement }
    // any[] (not the more precise ChildProp[]) sidesteps a TypeScript overload-resolution cost
    // blowup observed when several state()-typed array declarations combine in one file (see
    // crossContainerMove.test.ts for the full explanation) -- fine here since this test exercises
    // internal reconciliation mechanics, not the public typed API surface.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const a = state<any[]>([])
    const b = state<any[]>([helloController])
    /* eslint-enable @typescript-eslint/no-explicit-any */
    SnapseRoot({ root: app }, div(div(a), 'world', div(b)))
    flush()

    const elBefore = helloController.el
    expect(elBefore?.isConnected).toBe(true)

    moved.length = 0
    a.push(b.pop())
    flush()

    // moveBefore (not insertBefore) was used for the relocation, on this exact node -- the whole
    // point being that it's an atomic reparent, never a disconnect+reconnect.
    expect(moved).toContain(elBefore)
    expect(helloController.el).toBe(elBefore)
    expect(helloController.el?.isConnected).toBe(true)
    expect(app.textContent).toBe('helloworld')
  })
})
