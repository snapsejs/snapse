import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, flush, peek, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'

// Array items here are typed `any[]` (not the more precise ChildProp[]) deliberately: with
// several state()-typed array declarations in one file, TypeScript's overload resolution against
// ChildProp's large mapped/conditional type blows up (observed: reliable OOM on `tsc --noEmit`
// with 4+ such declarations in a single file, independent of how the values are later consumed).
// `any[]` sidesteps that cost entirely and is fine here since these tests exercise internal
// reconciliation mechanics, not the public typed API surface.
/* eslint-disable @typescript-eslint/no-explicit-any */

// Skipped under the closure-compiled build: these tests reach into a controller's internal .el
// property directly (there's no public API for asserting DOM-identity preservation), and
// property names don't survive Closure's ADVANCED-mode renaming.
const cc = process.env.CC_BUILD === 'true'

describe.skipIf(cc)('true DOM-identity-preserving moves between array containers', () => {
  let app: HTMLElement

  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
    app = document.getElementById('app')!
  })

  it('preserves DOM identity when the source array flushes before the destination', () => {
    // b.pop() is evaluated (and so queued) before a.push(...) receives its argument -- this is
    // the literal order the motivating example produces.
    const helloController = div('hello') as unknown as { el?: HTMLElement }
    const a = state<any[]>([])
    const b = state<any[]>([helloController])
    SnapseRoot({ root: app }, div(div(a), 'world', div(b)))
    flush()
    const elBefore = helloController.el
    ;(elBefore as unknown as Record<string, unknown>)._probe = 'identity'

    a.push(b.pop())
    flush()

    expect(helloController.el).toBe(elBefore)
    expect((helloController.el as unknown as Record<string, unknown>)._probe).toBe('identity')
    expect(app.textContent).toBe('helloworld')
  })

  it('preserves DOM identity when the destination array flushes before the source', () => {
    const helloController = div('hello') as unknown as { el?: HTMLElement }
    const a = state<any[]>([])
    const b = state<any[]>([helloController])
    SnapseRoot({ root: app }, div(div(a), 'world', div(b)))
    flush()
    const elBefore = helloController.el

    const item = peek(b)[0]
    a.push(item) // a's update is queued first
    b.pop() // b's update is queued second
    flush()

    expect(helloController.el).toBe(elBefore)
    expect(app.textContent).toBe('helloworld')
  })

  it('still fully removes an item that is popped but never reclaimed', () => {
    const b = state<any[]>([div('gone')])
    SnapseRoot({ root: app }, div(b))
    flush()
    expect(app.textContent).toBe('gone')

    b.pop()
    flush()

    expect(app.textContent).toBe('')
  })

  it('handles a genuinely new item pushed alongside a reclaimed one', () => {
    const firstController = div('first') as unknown as { el?: HTMLElement }
    const secondController = div('second') as unknown as { el?: HTMLElement }
    const a = state<any[]>([firstController])
    const b = state<any[]>([secondController])
    SnapseRoot({ root: app }, div(div(a), div(b)))
    flush()
    const firstBefore = firstController.el
    const secondBefore = secondController.el

    a.push(div('third'), b.pop())
    flush()

    expect(firstController.el).toBe(firstBefore)
    expect(secondController.el).toBe(secondBefore)
    expect(app.textContent).toBe('firstthirdsecond')
  })

  it('does not recreate an unrelated static sibling on a later unrelated array mutation', () => {
    // The standalone bug found while tracing this feature: resolveChild's collapse used to null
    // .par unconditionally, so any later sighting of an already-rendered static sibling -- even
    // from an unrelated mutation of the very same array -- looked like "never created" and was
    // destructively recreated.
    const keepController = div('keep') as unknown as { el?: HTMLElement }
    const s = state({ arr: [keepController, 'x'] as any[] })
    SnapseRoot({ root: app }, div(s.arr))
    flush()
    const elBefore = keepController.el

    s.arr.push('y')
    flush()

    expect(keepController.el).toBe(elBefore)
    expect(app.textContent).toBe('keepxy')
  })

  it('does not preserve identity for the unwrapped (non-isolated) topology', () => {
    // Documented scope boundary: true moves only apply when each array is the sole child of its
    // own wrapping element. Bare SnapseRoot(a, 'world', b) keeps today's destroy-and-recreate
    // behavior, since a/b share Root's mount element directly with 'world' as a literal sibling.
    const helloController = div('hello') as unknown as { el?: HTMLElement }
    const a = state<any[]>([])
    const b = state<any[]>([helloController])
    SnapseRoot({ root: app }, a, 'world', b)
    flush()
    const elBefore = helloController.el

    a.push(b.pop())
    flush()

    expect(helloController.el).not.toBe(elBefore)
    expect(app.textContent).toBe('helloworld')
  })
})

describe.skipIf(cc)('identity-preserving moves for array containers with trailing siblings', () => {
  let app: HTMLElement

  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
    app = document.getElementById('app')!
  })

  it('moves an item out of a list that has a trailing static sibling', () => {
    const helloController = div('hello') as unknown as { el?: HTMLElement }
    const a = state<any[]>([helloController])
    const b = state<any[]>([])
    // a is NOT the last child of its element -- 'tail' follows it
    SnapseRoot({ root: app }, div(a, 'tail'), div(b))
    flush()
    const elBefore = helloController.el

    b.push(a.pop())
    flush()

    expect(helloController.el).toBe(elBefore)
    expect(app.textContent).toBe('tailhello')
  })

  it('moves an item into a list that has a trailing static sibling', () => {
    const helloController = div('hello') as unknown as { el?: HTMLElement }
    const a = state<any[]>([helloController])
    const b = state<any[]>([])
    SnapseRoot({ root: app }, div(a), div(b, 'tail'))
    flush()
    const elBefore = helloController.el

    b.push(a.pop())
    flush()

    expect(helloController.el).toBe(elBefore)
    expect(app.textContent).toBe('hellotail')
  })

  it('moves an item between two lists sharing one element, with a literal sibling between them', () => {
    const helloController = div('hello') as unknown as { el?: HTMLElement }
    const a = state<any[]>([])
    const b = state<any[]>([helloController])
    SnapseRoot({ root: app }, div(a, 'world', b))
    flush()
    const elBefore = helloController.el

    a.push(b.pop())
    flush()

    expect(helloController.el).toBe(elBefore)
    expect(app.textContent).toBe('helloworld')
  })

  it('moves an item A->B while a trailing dynamic sibling of A also changes in the same flush', () => {
    const helloController = div('hello') as unknown as { el?: HTMLElement }
    const a = state<any[]>([helloController])
    const c = state<any[]>(['c1'])
    const b = state<any[]>([])
    SnapseRoot({ root: app }, div(a, c), div(b))
    flush()
    const elBefore = helloController.el

    b.push(a.pop())
    c.set(['c1', 'c2'])
    flush()

    expect(helloController.el).toBe(elBefore)
    expect(app.textContent).toBe('c1c2hello')
  })

  it('moves items both ways in one flush between two lists that each have a trailing sibling', () => {
    const xController = div('x') as unknown as { el?: HTMLElement }
    const yController = div('y') as unknown as { el?: HTMLElement }
    const a = state<any[]>([xController])
    const b = state<any[]>([yController])
    SnapseRoot({ root: app }, div(a, 'ta'), div(b, 'tb'))
    flush()
    const xBefore = xController.el
    const yBefore = yController.el

    a.push(b.pop())
    b.push(a.shift())
    flush()

    expect(xController.el).toBe(xBefore)
    expect(yController.el).toBe(yBefore)
    expect(app.textContent).toBe('ytaxtb')
  })
})
