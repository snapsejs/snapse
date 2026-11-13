import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'

let s = state({
  flag: true,
  num: 2,
  str: 'loading',
  arr: ['a1', 'a2', 'a3'],
  states: {
    loading: 'x1',
    new: 'x2',
  },
})

const miv = component(({ children }) => {
  return div('m', ...children)
})
const riv = component(({ children }) => {
  return div('r', ...children)
})

describe('test the state opt function in the dom', () => {
  beforeEach(() => {
    setupDOM()
    s = state({
      flag: true,
      num: 2,
      str: 'loading',
      arr: ['a1', 'a2', 'a3'],
      states: {
        loading: 'x1',
        new: 'x2',
      },
    })
  })

  it('should handle boolean state and two static values', () => {
    const myApp = component(() => {
      return miv(
        s.flag.opt(4, 5),
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('m4')
    s.flag.set(false)
    flush()
    expect(document.body.textContent).toBe('m5')
  })

  it('should handle boolean state and two state values', () => {
    const myApp = component(() => {
      return miv(
        s.flag.opt(s.num, s.str),
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('m2')
    s.num.set(3)
    flush()
    expect(document.body.textContent).toBe('m3')
    s.flag.set(false)
    flush()
    expect(document.body.textContent).toBe('mloading')
    s.str.set('new')
    flush()
    expect(document.body.textContent).toBe('mnew')
  })

  it('should handle boolean state and two state values, with change', () => {
    const myApp = component(() => {
      return miv(
        s.flag.opt(s.num, s.str),
      )
    })
    s.num.set(3)
    s.str.set('new')
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('m3')
    s.flag.set(false)
    flush()
    expect(document.body.textContent).toBe('mnew')
  })

  it('should handle boolean state and two static values in subelements', () => {
    const myApp = component(() => {
      return miv(
        s.flag.opt(riv(4), riv(5)),
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('mr4')
    s.flag.set(false)
    flush()
    expect(document.body.textContent).toBe('mr5')
  })

  it('should handle boolean state and two state values in subelements', () => {
    const myApp = component(() => {
      return miv(
        s.flag.opt(riv(s.num), riv(s.str)),
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('mr2')
    s.num.set(3)
    flush()
    expect(document.body.textContent).toBe('mr3')
    s.flag.set(false)
    flush()
    expect(document.body.textContent).toBe('mrloading')
    s.str.set('new')
    flush()
    expect(document.body.textContent).toBe('mrnew')
  })

  it('should handle boolean state and two state values in subelements, with change', () => {
    const myApp = component(() => {
      return miv(
        s.flag.opt(riv(s.num), riv(s.str)),
      )
    })
    s.num.set(3)
    s.str.set('new')
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('mr3')
    s.flag.set(false)
    flush()
    expect(document.body.textContent).toBe('mrnew')
  })

  it('should handle boolean state and two static values, first in subelement', () => {
    const myApp = component(() => {
      return miv(
        s.flag.opt(riv(4), 5),
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('mr4')
    s.flag.set(false)
    flush()
    expect(document.body.textContent).toBe('m5')
  })

  it('should handle boolean state and two static values, second in subelement', () => {
    const myApp = component(() => {
      return miv(
        s.flag.opt(4, riv(5)),
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('m4')
    s.flag.set(false)
    flush()
    expect(document.body.textContent).toBe('mr5')
  })

  it('should handle boolean state and two state values, first in subelement, with change', () => {
    const myApp = component(() => {
      return miv(
        s.flag.opt(riv(s.num), s.str),
      )
    })
    s.num.set(3)
    s.str.set('new')
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('mr3')
    s.flag.set(false)
    flush()
    expect(document.body.textContent).toBe('mnew')
  })

  it('should handle boolean state and two state values, second in subelement, with change', () => {
    const myApp = component(() => {
      return miv(
        s.flag.opt(s.num, riv(s.str)),
      )
    })
    s.num.set(3)
    s.str.set('new')
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('m3')
    s.flag.set(false)
    flush()
    expect(document.body.textContent).toBe('mrnew')
  })

  it('should re-run a component body when opt activates the component', () => {
    const s = state({ show: false })
    let count = 0
    const MyComp = component(() => {
      count++
      return div('run', count)
    })
    const MyApp = component(() => {
      return s.show.opt(MyComp(), 'nope')
    })
    SnapseRoot(MyApp())
    flush()
    expect(document.body.textContent).toBe('nope')
    expect(count).toBe(0)
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('run1')
    expect(count).toBe(1)
    s.show.set(false)
    flush()
    expect(document.body.textContent).toBe('nope')
    expect(count).toBe(1)
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('run2')
    expect(count).toBe(2)
  })

  it('should re-run a bare function child when opt activates the element', () => {
    const s = state({ show: false })
    let count = 0
    const childFunc = () => {
      count++
      return `run${count}`
    }
    SnapseRoot(s.show.opt(div(childFunc), 'nope'))
    flush()
    expect(document.body.textContent).toBe('nope')
    expect(count).toBe(0)
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('run1')
    expect(count).toBe(1)
    s.show.set(false)
    flush()
    expect(document.body.textContent).toBe('nope')
    expect(count).toBe(1)
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('run2')
    expect(count).toBe(2)
  })

  it('should re-run a bare function child returning an element when opt activates', () => {
    const s = state({ show: false })
    let count = 0
    const childFunc = () => {
      count++
      return div('run', count)
    }
    SnapseRoot(s.show.opt(div(childFunc), 'nope'))
    flush()
    expect(document.body.textContent).toBe('nope')
    expect(count).toBe(0)
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('run1')
    expect(count).toBe(1)
    s.show.set(false)
    flush()
    expect(document.body.textContent).toBe('nope')
    expect(count).toBe(1)
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('run2')
    expect(count).toBe(2)
  })

  // Regression test for a bug found in an app using Snapse: a child produced by calling a
  // method THROUGH a reactive state proxy (e.g. `s.widget.label()`, a class instance held by a
  // state, not a plain `label()` call) goes through ChainFunctionTransform, which -- like
  // ComputeTransform -- sets TRANSFORM_FLAG_REBUILDS_CHILDREN. NodeController.create() treats
  // that flag as "this child's parent transform re-renders it on state changes, so its args
  // don't need to be kept for a manual rebuild" and discards the child's args after first
  // render. But a RootController held by .opt() (CONTROLLER_FLAG_REBUILDS_FROM_ARGS) rebuilds
  // its whole subtree from retained args on each re-activation, NOT via a reactive update -- so
  // a chain-function child's now-args-less node rebuilds to empty, while sibling children
  // created by a plain, un-chained call (e.g. `div('static')`) rebuild fine.
  it('should keep a chain-function child\'s content across repeated opt (de)activations', () => {
    class Widget {
      label() {
        return div('label')
      }
    }
    const s = state({ show: false, widget: new Widget() })
    SnapseRoot(s.show.opt(div(s.widget.label(), div('static')), 'nope'))
    flush()
    expect(document.body.textContent).toBe('nope')
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('labelstatic')
    s.show.set(false)
    flush()
    expect(document.body.textContent).toBe('nope')
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('labelstatic')
  })

  // Same underlying bug as above, but via a plain compute() rather than a chain-function call --
  // confirming the fix is general to any TRANSFORM_FLAG_REBUILDS_CHILDREN transform nested inside
  // a .opt() toggle, not specific to ChainFunctionTransform.
  it('should keep a compute()-based child\'s content across repeated opt (de)activations', () => {
    const s = state({ show: false, name: 'fixed' })
    const label = compute(() => div(s.name))
    SnapseRoot(s.show.opt(div(label, div('static')), 'nope'))
    flush()
    expect(document.body.textContent).toBe('nope')
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('fixedstatic')
    s.show.set(false)
    flush()
    expect(document.body.textContent).toBe('nope')
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('fixedstatic')
  })

  // A related bug surfaced by the same fix: IsTransform is a singleton per reference state
  // (IsTransform.instances is a WeakMap keyed by the source LightState), and each `.is(value)`
  // call registers its *result* state once, permanently, in that shared instance's
  // targetToKey/compared maps (see IsTransform.new/addCompared) -- nothing ever re-populates
  // them later. Now that a RootController rebuild-from-args cycle reuses that SAME result state
  // across repeated .opt() (de)activations (rather than calling `.is()` again to mint a fresh
  // one), the first deactivation's IsTransform.uns() deletes its targetToKey entry as normal,
  // but the second deactivation's uns() no longer finds it, falls through to the generic
  // Transform.uns() path, and ends up trying to remove an already-removed subscription --
  // throwing "Cannot read properties of undefined (reading 'delete')" in removeStateProperty.
  it('should not throw when an .is() binding inside opt content is deactivated twice', () => {
    const s = state({ show: false, current: 'a' })
    SnapseRoot(s.show.opt(div({ class: { x: s.current.is('a') } }, 'x'), 'nope'))
    flush()
    s.show.set(true)
    flush()
    s.show.set(false)
    flush()
    s.show.set(true)
    flush()
    expect(() => {
      s.show.set(false)
      flush()
    }).not.toThrow()
  })

  // FIXED: a second, related bug -- not a crash but a stale value. StateController.createNode()
  // and ElementController.updateProperty() both call refresh() before reading a value, ahead of
  // subscribing to it, and that part is fine in general (a plain single-target Transform's rfr()
  // correctly recomputes on demand via its own dirty check regardless of subscription state). But
  // IsTransform is a singleton shared by every `.is()` result for one reference, and refresh(ls)
  // calls `ls.tf?.rfr()` with no argument -- so its old rfr() couldn't tell *which* result was
  // being asked about, and just ran its subscription-driven diff, which only touches results
  // currently tracked as active. A dormant result (reused across .opt() (de)activations) isn't
  // tracked again until it resubscribes, which happens *after* this read. Fixed by giving each
  // `.is()` result its own small delegate object (IsTransformTarget, in IsTransform.ts) as its
  // `.tf`, so refresh() can reach the right one directly, independent of subscription order.
  it('should reflect a reference change made while an .is() binding was deactivated', () => {
    // boolean/State<boolean> is deliberately not a valid ChildProp, so the .is() result is read
    // through a data-* attribute instead (typed MaybeState<..., boolean, ...>) -- this still goes
    // through ElementController.updateProperty()'s unconditional refresh(ls), the same code path
    // this test needs, unlike .opt() (see StateController.createNode()/updateProperty(), both of
    // which refresh unconditionally, vs. OptTransform's generic, isDirty-gated rfr(), which can
    // never see an .is() target as dirty since it's excluded from being its own dirty source).
    const s = state({ show: false, current: 'a' })
    SnapseRoot(s.show.opt(div({ 'data-flag': s.current.is('a') }), 'nope'))
    flush()
    s.show.set(true)
    flush()
    expect(document.body.querySelector('div')?.hasAttribute('data-flag')).toBe(true)
    s.show.set(false)
    flush()
    s.current.set('b')
    flush()
    s.show.set(true)
    flush()
    expect(document.body.querySelector('div')?.hasAttribute('data-flag')).toBe(false)
  })

  // FIXED: the same "stale value read before subscribing" shape, but in ElementController rather
  // than IsTransform. Its `class` handling computed the class string eagerly
  // (calculateClassString, via peek()) before ever subscribing to the reactive values it reads,
  // with no refresh() call at all in that path (unlike plain property handling in
  // updateProperty(), which does call refresh() first). Note this specifically needs a target with
  // no other live path to self-correct: an ordinary single-target transform (e.g. a plain
  // compute()) still ends up correct here even without this fix, because establishing the
  // subscription that follows the eager read cascades through nested subscribeSources() calls
  // that each end with their own refresh() -- which happens to recompute the whole chain once
  // more, using by-then-fresh values, before anything is committed to the DOM. IsTransform's
  // result states can't rely on that cascade: their `.srcs` is a self-loop (`target.srcs =
  // [target]`, see IsTransform.ts), which Transform.isDirty() deliberately treats as never dirty
  // (a source can't be dirty relative to itself), so nothing downstream ever recomputes on its
  // own. Fixed by refreshClass() in ElementController.ts, which walks the same string/array/POJO
  // shape as calculateClass and refreshes each reactive value it finds before
  // calculateClassString reads it -- a general fix at the ElementController level, even though
  // IsTransform is the only built-in transform that actually needs it today.
  it('should reflect a reference change made while a class binding was deactivated', () => {
    const s = state({ show: false, current: 'a' })
    SnapseRoot(s.show.opt(div({ class: { match: s.current.is('a') } }), 'nope'))
    flush()
    s.show.set(true)
    flush()
    expect(document.body.querySelector('div')?.className).toBe('match')
    s.show.set(false)
    flush()
    s.current.set('b')
    flush()
    s.show.set(true)
    flush()
    expect(document.body.querySelector('div')?.className).toBe('')
  })
})
