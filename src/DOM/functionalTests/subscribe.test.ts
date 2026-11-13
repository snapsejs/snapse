import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, peek, state, subscribe } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'
import { sleep } from '@/common/test/testUtil.js'

describe('test subscribe in elements', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should unsubscribe component subscriptions when component has only static content', () => {
    const s = state({ a: 1, show: true })
    const updates: number[] = []
    const myEl = component(() => {
      subscribe(s.a, () => {
        updates.push(peek(s.a))
      })
      return div('static')
    })
    const myApp = component(() => s.show.opt(myEl()))
    SnapseRoot(myApp())
    flush()
    expect(document.body.textContent).toBe('static')
    s.a.set(2)
    flush()
    expect(updates).toStrictEqual([2])
    s.show.set(false)
    flush()
    expect(document.body.textContent).toBe('')
    s.a.set(3)
    flush()
    expect(updates).toStrictEqual([2])
  })

  it('should unsubscribe component subscriptions when component is wrapped in a static element', () => {
    const s = state({ a: 1, show: true })
    const updates: number[] = []
    const myEl = component(() => {
      subscribe(s.a, () => {
        updates.push(peek(s.a))
      })
      return div('static')
    })
    const myApp = component(() => s.show.opt(div(myEl())))
    SnapseRoot(myApp())
    flush()
    s.a.set(2)
    flush()
    expect(updates).toStrictEqual([2])
    s.show.set(false)
    flush()
    s.a.set(3)
    flush()
    expect(updates).toStrictEqual([2])
  })

  it('should automatically unsubscribe when element is removed', () => {
    const s = state({
      a: 1,
      showEl: true,

    })
    const updates: number[] = []

    const myEl = component(() => {
      subscribe(s.a, () => {
        updates.push(peek(s.a))
      })
      return s.a
    })

    const myApp = component(() => {
      return s.showEl.opt(myEl())
    })
    SnapseRoot(myApp())
    flush()
    expect(document.body.textContent).toBe('1')
    s.a.set(2)
    flush()
    expect(document.body.textContent).toBe('2')
    s.a.set(3)
    flush()
    expect(document.body.textContent).toBe('3')
    s.showEl.set(false)
    flush()
    expect(document.body.textContent).toBe('')
    s.a.set(4)
    flush()
    expect(document.body.textContent).toBe('')
    expect(updates).toStrictEqual([2, 3])
  })

  it('should automatically unsubscribe a deep subscription when element is removed', () => {
    const s = state({ a: 1, showEl: true })
    const updates: number[] = []

    const myEl = component(() => {
      subscribe(s, () => {
        updates.push(peek(s.a))
      }, { deep: true })
      return s.a
    })

    const myApp = component(() => {
      return s.showEl.opt(myEl())
    })
    SnapseRoot(myApp())
    flush()
    expect(document.body.textContent).toBe('1')
    s.a.set(2)
    flush()
    expect(document.body.textContent).toBe('2')
    s.showEl.set(false)
    flush()
    expect(document.body.textContent).toBe('')
    s.a.set(3)
    flush()
    expect(document.body.textContent).toBe('')
    expect(updates).toStrictEqual([2])
  })

  it('should throw when calling subscribe after await', async () => {
    let caught = 0
    const myApp = component(async () => {
      const s = state(42)
      await sleep(1)
      try {
        subscribe(s)
      } catch {
        caught++
      }
      return div(
        'ok',
        s,
      )
    })
    SnapseRoot(myApp())
    flush()
    await sleep(2)
    expect(caught).toBe(1)
  })
})
