import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, flush, state } from '@/index.js'
import { div, input } from '@/DOM/elements/DOMElements.js'
import type { ChildProp } from '@/DOM/types.js'
import type { State } from '@/state/types/types.js'
import { sleep } from '@/common/test/testUtil.js'

describe('SnapseRoot', () => {
  beforeEach(() => {
    setupDOM()
  })

  describe('basic usage', () => {
    it('installs into document.body by default', () => {
      document.body.innerHTML = ''
      SnapseRoot(div('hello'))
      flush()
      expect(document.body.textContent).toBe('hello')
    })

    it('auto-renders a root without an explicit flush() call', async () => {
      // queueRoot() must call queueFlush() itself -- a self-bootstrapping root has no other
      // natural trigger, so without it the root just sits queued forever unless something else
      // happens to call flush() manually.
      document.body.innerHTML = ''
      SnapseRoot(div('hello'))
      await sleep(5)
      expect(document.body.textContent).toBe('hello')
    })

    it('installs into a specified root element', () => {
      document.body.innerHTML = 'before<div id="app"></div>after'
      SnapseRoot({ root: document.getElementById('app') }, div('hello'))
      flush()
      expect(document.body.textContent).toBe('beforehelloafter')
    })

    it('updates in place after content the default body target already holds', () => {
      document.body.innerHTML = '<script></script>'
      const s = state({ items: [2, 3], pow: 2 })
      SnapseRoot(
        'Exponent: ',
        input({ id: 'pow', value: s.pow }),
        s.items.map(v => div(Math.pow(v, s.pow))),
      )
      flush()
      s.pow.set(3)
      flush()
      expect(document.body.innerHTML)
        .toBe('<script></script>Exponent: <input id="pow"><div>8</div><div>27</div>')
    })

    it('updates in place after content a specified root already holds', () => {
      document.body.innerHTML = '<div id="app">pre<b></b></div>'
      const app = document.getElementById('app')!
      const items = state(['a', 'b'])
      SnapseRoot({ root: app }, 'start', items.map(v => [v, '-']), 'end')
      flush()
      items.set(['c', 'a', 'd'])
      flush()
      expect(app.innerHTML).toBe('pre<b></b>startc-a-d-end')
    })

    it('accepts multiple top-level children', () => {
      document.body.innerHTML = '<div id="app"></div>'
      SnapseRoot({ root: document.getElementById('app') }, div('a'), div('b'))
      flush()
      expect(document.getElementById('app')!.textContent).toBe('ab')
    })

    it('moves an element from one top-level array to a sibling one', () => {
      // `a` and `b` are two independent top-level arguments, each its own StateController
      // with no shared identity tracking -- the moved element is destroyed and a fresh
      // one created under `a`, not physically relocated. Content is still correct.
      document.body.innerHTML = '<div id="app"></div>'
      const a: State<ChildProp[]> = state([] as ChildProp[])
      const b = state([div('hello')])
      SnapseRoot({ root: document.getElementById('app') }, a, 'world', b)
      flush()
      expect(document.getElementById('app')!.textContent).toBe('worldhello')
      a.push(b.pop())
      flush()
      expect(document.getElementById('app')!.textContent).toBe('helloworld')
    })

    it('physically moves a single-child-wrapper component between two last-child array slots', () => {
      // `x` and `y` here are each the last (only) child of their own element (`div('e', x)` /
      // `div(y)`), so StateController.hasMovableChildren() is true on BOTH the removal side (x)
      // and the insertion side (y) -- this takes the physical cross-container adoption path
      // (StateController.movableControllersByDef + detachFromDonor + insertChild's moveBefore/insertBefore),
      // not the destroy-and-recreate path exercised by the test above. The component's array
      // element is promoted to a per-element wrapper StateController, and the gaining container
      // adopts that wrapper by state identity.
      document.body.innerHTML = '<div id="app"></div>'
      let creates = 0
      const MyComponent = component(() => {
        creates++
        return div({ class: 'comp' }, 'comp')
      })
      const x = state([MyComponent()])
      const y = state([] as ChildProp[])
      SnapseRoot({ root: document.getElementById('app') }, div('e', x), div(y))
      flush()
      expect(creates).toBe(1)
      const before = document.querySelector('.comp')
      y.push(x.pop())
      flush()
      expect(creates).toBe(1) // not recreated
      expect(document.querySelector('.comp')).toBe(before) // physically moved, same DOM node
      expect(document.getElementById('app')!.textContent).toBe('ecomp')
    })

    it('physically moves an array item even when its source array has a trailing sibling', () => {
      // A trailing sibling (`div('e', x, 'trailing')`) means the source array is not the last
      // child of its element. It is still a movable container -- a removed item's node stays in
      // the DOM until flushPendingWork, and physical-index lookups skip it (liveChildAt) so the
      // trailing sibling is unaffected -- so the item is handed to the gaining container, not
      // destroyed and recreated.
      document.body.innerHTML = '<div id="app"></div>'
      let creates = 0
      const MyComponent = component(() => {
        creates++
        return div({ class: 'comp' }, 'comp')
      })
      const x = state([MyComponent()])
      const y = state([] as ChildProp[])
      SnapseRoot({ root: document.getElementById('app') }, div('e', x, 'trailing1'), div(y, 'trailing2'))
      flush()
      expect(creates).toBe(1)
      const before = document.querySelector('.comp')
      y.push(x.pop())
      flush()
      expect(creates).toBe(1)
      expect(document.querySelector('.comp')).toBe(before)
      expect(document.getElementById('app')!.textContent).toBe('etrailing1comptrailing2')
    })

    it('reacts to state changes after mounting', () => {
      document.body.innerHTML = '<div id="app"></div>'
      const s = state('start')
      const myApp = component(() => div('val:', s))
      SnapseRoot({ root: document.getElementById('app') }, myApp())
      flush()
      expect(document.getElementById('app')!.textContent).toBe('val:start')
      s.set('changed')
      flush()
      expect(document.getElementById('app')!.textContent).toBe('val:changed')
    })

    it('clears content but keeps the root element on .remove() (default body target)', () => {
      document.body.innerHTML = ''
      const app = SnapseRoot(div('hello'))
      flush()
      expect(document.body.textContent).toBe('hello')
      app.remove()
      expect(document.body.textContent).toBe('')
      expect(document.body.isConnected).toBe(true)
    })

    it('clears content but keeps the root element on .remove() (specified root target)', () => {
      document.body.innerHTML = '<div id="app"></div>'
      const el = document.getElementById('app')!
      const app = SnapseRoot({ root: el }, div('hello'))
      flush()
      expect(el.textContent).toBe('hello')
      app.remove()
      expect(el.textContent).toBe('')
      expect(document.getElementById('app')).toBe(el)
      expect(document.body.contains(el)).toBe(true)
    })

    it('tears down its own reactive subscriptions on .remove(), not just clearing the DOM once', () => {
      // A root-level recompute is only kept alive by the DOM subscription that reads its
      // output; if .remove() doesn't unsubscribe that, the compute keeps re-running (and
      // stays subscribed upstream) even though its output can no longer reach the (detached)
      // DOM, so we watch the recompute count itself rather than DOM content.
      document.body.innerHTML = ''
      const s = state({ label: 'hi' })
      let runs = 0
      const label = compute(() => {
        runs++
        return String(s.label)
      })
      const app = SnapseRoot(div('label:', label))
      flush()
      expect(runs).toBe(1)
      app.remove()
      s.label.set('leaked-update')
      flush()
      expect(runs).toBe(1)
    })
  })

  describe('used inside another component to render into a different part of the DOM (portal)', () => {
    it('updates in place when mounted while removed nodes in its root are still detaching', () => {
      document.body.innerHTML = '<div id="app"></div>'
      const removed = state([div('a'), div('b')])
      const portalItems = state(['x'])
      const portalHosts = state([] as ChildProp[])
      const host = div({ id: 'host' }, 'h', removed, portalHosts)
      const portal = component(() => SnapseRoot(
        { root: document.getElementById('host') }, 'p', portalItems.map(v => [v, '-']), 'q',
      ))
      SnapseRoot({ root: document.getElementById('app') }, host)
      flush()
      removed.set([])
      portalHosts.set([portal()])
      flush()
      portalItems.set(['y', 'x', 'z'])
      flush()
      expect(document.getElementById('host')!.innerHTML).toBe('hpy-x-z-q')
    })

    it('renders its content into the target root, not at the call site', () => {
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ show: true, label: 'hi' })

      const portal = component(() => SnapseRoot(
        { root: document.getElementById('portal') }, div('portal:', s.label),
      ))
      const outer = component(() => s.show.opt(div('outer:', portal())))

      SnapseRoot({ root: document.getElementById('app') }, outer())
      flush()

      expect(document.getElementById('app')!.textContent).toBe('outer:')
      expect(document.getElementById('portal')!.textContent).toBe('portal:hi')
    })

    it('keeps reacting to state changes in the portal content', () => {
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ show: true, label: 'hi' })

      const portal = component(() => SnapseRoot(
        { root: document.getElementById('portal') }, div('portal:', s.label),
      ))
      const outer = component(() => s.show.opt(div('outer:', portal())))

      SnapseRoot({ root: document.getElementById('app') }, outer())
      flush()
      s.label.set('bye')
      flush()
      expect(document.getElementById('portal')!.textContent).toBe('portal:bye')
    })

    it('should remove the portal content when the enclosing component is removed', () => {
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ show: true, label: 'hi' })

      const portal = component(() => SnapseRoot(
        { root: document.getElementById('portal') }, div('portal:', s.label),
      ))
      const outer = component(() => s.show.opt(div('outer:', portal())))

      SnapseRoot({ root: document.getElementById('app') }, outer())
      flush()

      const portalEl = document.getElementById('portal')!
      const portalParent = portalEl.parentNode

      s.show.set(false)
      flush()

      expect(document.getElementById('app')!.textContent).toBe('')
      expect(document.getElementById('portal')!.textContent).toBe('')
      // The target element itself must never be moved, replaced, or removed —
      // only its rendered content is torn down.
      expect(document.getElementById('portal')).toBe(portalEl)
      expect(portalEl.parentNode).toBe(portalParent)
      expect(document.body.contains(portalEl)).toBe(true)
    })

    it('should stop reacting to state changes once the enclosing component is removed', () => {
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ show: true, label: 'hi' })

      const portal = component(() => SnapseRoot(
        { root: document.getElementById('portal') }, div('portal:', s.label),
      ))
      const outer = component(() => s.show.opt(div('outer:', portal())))

      SnapseRoot({ root: document.getElementById('app') }, outer())
      flush()
      s.show.set(false)
      flush()
      s.label.set('leaked-update')
      flush()

      expect(document.getElementById('portal')!.textContent).toBe('')
    })

    it('does not physically move the portal target into the ambient tree', () => {
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ label: 'hi' })

      const portal = component(() => SnapseRoot(
        { root: document.getElementById('portal') }, div('portal:', s.label),
      ))
      const outer = component(() => div('outer:', portal()))

      SnapseRoot({ root: document.getElementById('app') }, outer())
      flush()

      const portalEl = document.getElementById('portal')!
      expect(portalEl.parentNode).toBe(document.body)
      expect(document.getElementById('app')!.contains(portalEl)).toBe(false)

      s.label.set('bye')
      flush()
      expect(portalEl.parentNode).toBe(document.body)
      expect(document.getElementById('app')!.contains(portalEl)).toBe(false)
    })

    it('throws when a nested portal explicitly requests hydrate mode against an unmatched target', () => {
      // RootController no longer forces a nested root to 'csr' -- a nested root now genuinely
      // attempts to hydrate against whatever's already there, same as any other root, whether it
      // inherited 'hydrate' from an ancestor or (as here) requested it explicitly itself. An
      // empty portal target has nothing to match against, so this must surface as the same
      // hydration-mismatch error a top-level root would throw, not silently succeed by
      // rendering fresh -- see hydrate.test.ts for the corresponding positive case, where the
      // portal target genuinely does have matching pre-rendered content to hydrate against.
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const portal = component(() => SnapseRoot(
        { root: document.getElementById('portal'), mode: 'hydrate' }, div('portal-content'),
      ))
      const outer = component(() => div('outer:', portal()))
      expect(() => {
        SnapseRoot({ root: document.getElementById('app') }, outer())
        flush()
      }).toThrow()
    })

    it('should not crash when the portal content is itself a component', () => {
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ label: 'hi' })

      const portalContent = component(() => div('portal:', s.label))
      const outer = component(() => SnapseRoot({ root: document.getElementById('portal') }, portalContent()))

      SnapseRoot({ root: document.getElementById('app') }, outer())
      expect(() => flush()).not.toThrow()

      expect(document.getElementById('portal')!.textContent).toBe('portal:hi')
    })

    it('removes a single-child wrapper element, not just its inner content', () => {
      // resolveChild()'s "sole NodeController child, no subs -> promote it,
      // discard the wrapper" optimization assumes some ancestor's `.el`
      // removal will cascade away the discarded wrapper's DOM node. A portal
      // root has no `.el` of its own to do that, so this shape (an outer
      // wrapper with exactly one child, which itself has a reactive/state
      // child keeping it from being flattened to a raw node first) must not
      // lose track of the outer wrapper.
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ show: true, label: 'radius' })

      const dialog = component(() => SnapseRoot(
        { root: document.getElementById('portal') },
        div({ class: 'dialogBackground' }, div({ class: 'dialog' }, div(s.label), div('button'))),
      ))
      const outer = component(() => s.show.opt(dialog()))

      SnapseRoot({ root: document.getElementById('app') }, outer())
      flush()
      expect(document.getElementById('portal')!.querySelector('.dialogBackground')).not.toBeNull()

      s.show.set(false)
      flush()

      expect(document.getElementById('portal')!.querySelector('.dialogBackground')).toBeNull()
      expect(document.getElementById('portal')!.textContent).toBe('')
    })

    it('should not crash when constructed in an async component before its first await', async () => {
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ label: 'hi' })

      const portalContent = component(() => div('portal:', s.label))
      const outer = component(async () => {
        const portal = SnapseRoot({ root: document.getElementById('portal') }, portalContent())
        await Promise.resolve()
        return [portal, div('outer')]
      })

      expect(() => {
        SnapseRoot({ root: document.getElementById('app') }, outer())
      }).not.toThrow()
      flush()
      await sleep(2)
      flush()

      expect(document.getElementById('portal')!.textContent).toBe('portal:hi')
      expect(document.getElementById('app')!.textContent).toBe('outer')
    })
  })

  describe('self-bootstrapping vs. tree-cascade creation', () => {
    // Unlike every other controller, a RootController queues its own creation (it has no natural
    //   parent to trigger it). If the same instance also ends up placed inside the normal render tree
    //   (nested directly as an argument to another SnapseRoot call, or fed into a reactive slot before
    //   that tree exists), the tree-cascade creation must win and the self-bootstrap must become a no-op
    //   -- not run a second, corrupting create() pass over an already-built root.

    it('still self-bootstraps two independent, unrelated SnapseRoot trees', () => {
      document.body.innerHTML = '<div id="a"></div><div id="b"></div>'
      SnapseRoot({ root: document.getElementById('a') }, 'first')
      SnapseRoot({ root: document.getElementById('b') }, 'second')
      flush()
      expect(document.getElementById('a')!.textContent).toBe('first')
      expect(document.getElementById('b')!.textContent).toBe('second')
    })

    it('renders and removes a SnapseRoot nested directly in another SnapseRoot', () => {
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ label: 'hi' })
      const inner = SnapseRoot({ root: document.getElementById('portal') }, div('b:', s.label))
      SnapseRoot({ root: document.getElementById('app') }, 'a:', inner)
      flush()
      expect(document.getElementById('app')!.textContent).toBe('a:')
      expect(document.getElementById('portal')!.textContent).toBe('b:hi')

      s.label.set('bye')
      flush()
      expect(document.getElementById('portal')!.textContent).toBe('b:bye')

      inner.remove()
      expect(document.getElementById('portal')!.textContent).toBe('')
    })

    it('renders and removes a SnapseRoot passed directly as an .opt() argument', () => {
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ show: true, label: 'hi' })

      const outer = s.show.opt(
        SnapseRoot({ root: document.getElementById('portal') }, div('portal:', s.label)),
      )
      SnapseRoot({ root: document.getElementById('app') }, div('outer:', outer))
      flush()
      expect(document.getElementById('portal')!.textContent).toBe('portal:hi')

      s.show.set(false)
      flush()
      expect(document.getElementById('portal')!.textContent).toBe('')
    })

    it('does not self-bootstrap a SnapseRoot .opt() branch while its condition starts false', () => {
      document.body.innerHTML = '<div id="app"></div><div id="portal"></div>'
      const s = state({ show: false })

      const Menu = component(() => s.show.opt(
        SnapseRoot({ root: document.getElementById('portal') }, div({ class: 'menu' }, 'menu')),
      ))
      SnapseRoot({ root: document.getElementById('app') }, Menu())
      flush()
      // The .opt() condition is false -- the root must not mount itself into #portal anyway.
      expect(document.getElementById('portal')!.textContent).toBe('')
    })

    it('mounts, removes and re-mounts a SnapseRoot .opt() branch as its condition toggles', () => {
      document.body.innerHTML = '<div id="app"></div>'
      const s = state({ show: false })

      const Menu = component(() => s.show.opt(SnapseRoot(div({ class: 'menu' }, 'menu'))))
      SnapseRoot({ root: document.getElementById('app') }, Menu())
      flush()

      const seen: string[] = []
      const record = () => seen.push(
        [...document.body.querySelectorAll('.menu')].map(e => e.textContent).join('|'),
      )
      record()
      s.show.set(true)
      flush()
      record()
      s.show.set(false)
      flush()
      record()
      s.show.set(true)
      flush()
      record()

      expect(seen).toEqual(['', 'menu', '', 'menu'])
    })

    it('a throwing component body does not leave later standalone roots unable to mount', () => {
      // The body throws before stopCapturingStateCalls() would run; without a finally guard the
      //   capture flag stays set and every later RootController mistakes itself for one created
      //   inside a component, so it never self-bootstraps.
      document.body.innerHTML = '<div id="thrower"></div><div id="after"></div>'
      const Boom = component(() => {
        throw new Error('boom')
      })
      expect(() => {
        SnapseRoot({ root: document.getElementById('thrower') }, Boom())
        flush()
      }).toThrow('boom')

      SnapseRoot({ root: document.getElementById('after') }, div('after'))
      flush()
      expect(document.getElementById('after')!.textContent).toBe('after')
    })

    it('schedules an automatic flush for a standalone SnapseRoot', async () => {
      document.body.innerHTML = ''
      SnapseRoot(div('hello'))
      await new Promise(resolve => {
        setTimeout(resolve, 10)
      })
      expect(document.body.textContent).toBe('hello')
    })
  })
})
