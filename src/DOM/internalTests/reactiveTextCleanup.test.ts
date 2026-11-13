import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { getLightState } from '@/state/state.js'
import { a, div, span } from '@/DOM/elements/DOMElements.js'
import { getRefCount } from '@/state/common/refCountAndType.js'
import { NodeController } from '@/DOM/nodeControllers/NodeController.js'
import { RootController } from '@/DOM/nodeControllers/RootController.js'
import v8 from 'node:v8'
import vm from 'node:vm'

const subCount = (st: unknown) => getRefCount(getLightState(st)!)
const cc = process.env.CC_BUILD === 'true'

// Obtain a working gc() without requiring the --expose-gc CLI flag, so the GC-liveness test always
// runs its assertion (rather than silently no-opping). Async settling between calls is what lets
// young-generation WeakRef targets actually get collected.
const gc = vm.runInNewContext((v8.setFlagsFromString('--expose-gc'), 'gc')) as () => void
const collect = async () => {
  for (let i = 0; i < 4; i++) {
    gc()
    await new Promise(r => setTimeout(r, 5))
  }
}

describe('reactive text cleanup', () => {
  beforeEach(() => {
    setupDOM()
  })

  it.skipIf(cc)('unsubscribes reactive text nested in elements when the block is removed via opt', () => {
    const g = state('hello')
    const s = state({ show: true })
    const base = subCount(g)

    const block = component(() => s.show.opt(div(span(a(g)))))
    SnapseRoot(block())
    flush()
    expect(document.body.textContent).toBe('hello')
    expect(subCount(g)).toBe(base + 1)

    g.set('world')
    flush()
    expect(document.body.textContent).toBe('world')

    s.show.set(false)
    flush()
    expect(document.body.textContent).toBe('')
    expect(subCount(g)).toBe(base)
  })

  it.skipIf(cc)('retains and unsubscribes an element child element that has node and subscription', () => {
    const g = state('active')
    const s = state({ show: true })
    const base = subCount(g)

    const block = component(() => s.show.opt(div(div(a({ class: g })))))
    SnapseRoot(block())
    flush()
    expect(document.querySelector('a')?.getAttribute('class')).toBe('active')
    expect(subCount(g)).toBe(base + 1)

    g.set('inactive')
    flush()
    expect(document.querySelector('a')?.getAttribute('class')).toBe('inactive')

    s.show.set(false)
    flush()
    expect(document.body.textContent).toBe('')
    expect(subCount(g)).toBe(base)
  })

  it.skipIf(cc)('unsubscribes reactive text nested in elements when a mapped row is removed', () => {
    const g = state('x')
    const s = state<{ rows: number[] }>({ rows: [0, 1, 2] })
    const base = subCount(g)

    const app = component(() => div(s.rows.map(() => div(span(a(g))))))
    SnapseRoot(app())
    flush()
    expect(subCount(g)).toBe(base + 3)

    s.rows.splice(1, 1)
    flush()
    expect(subCount(g)).toBe(base + 2)

    s.rows.set([])
    flush()
    expect(subCount(g)).toBe(base)
  })

  it.skipIf(cc)(
    'does not retain the element hosting reactive text',
    async () => {
      const refs: WeakRef<object>[] = []
      const proto = NodeController.prototype as unknown as Record<string, unknown> & {
        build: (...a: unknown[]) => unknown
      }
      const orig = proto.build
      proto.build = function (this: { constructor: { name: string } }, ...args: unknown[]) {
        if (this.constructor.name === 'ElementController') refs.push(new WeakRef(this))
        return (orig as (...a: unknown[]) => unknown).apply(this, args)
      }
      const holder: unknown[] = []
      const s = state({ n: 1 })
      const root = new RootController('', [{ root: document.body }, div(a(s.n))] as never)
      const proot = root as unknown as { build: () => void }
      proot.build()
      flush()
      proto.build = orig
      holder.push(s, root)
      await collect()
      const liveElements = refs.filter(r => r.deref() !== undefined).length
      // The `div` wrapping the reactive `a` is a root's direct child, so it
      // must stay a real, retained controller (see resolveChild()'s opaque-
      // subtree guard in NodeController.ts) — a root has no `.el` of its own
      // to cascade-remove a discarded wrapper's DOM node on `.remove()`, so
      // only the `div` being flattened away here would silently orphan it.
      expect(liveElements).toBe(2)
      expect(holder.length).toBe(2)
    })
})
