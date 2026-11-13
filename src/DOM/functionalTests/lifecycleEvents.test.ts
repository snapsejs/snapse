import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { renderToString } from '@/server.js'
import { div } from '@/DOM/elements/DOMElements.js'
import type { DOMEventListener } from '@/DOM/types.js'

describe('test lifecycle events', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should ignore an undefined nodeInserted callback', () => {
    SnapseRoot(div({ id: 'test', nodeInserted: undefined }, 'hello!'))
    flush()
    expect(document.body.textContent).toBe('hello!')
  })

  it('should call lifecycle events', () => {
    const s = state({
      show: false,
    })

    const updates: string[] = []

    const nodeCreated: DOMEventListener = ev => {
      const targetElement = ev?.target as Element
      updates.push(targetElement.parentNode ? 'inserted' : targetElement?.getAttribute('id') ?? 'failed')
    }

    const nodeInserted: DOMEventListener = ev => {
      const targetElement = ev?.target as Element
      updates.push(targetElement.parentNode ? 'inserted' : targetElement?.getAttribute('id') ?? 'failed')
    }

    const nodeRemoved = () => {
      updates.push('removed')
    }

    const myApp = component(() => {
      return s.show.opt(div({ id: 'test', nodeCreated, nodeRemoved, nodeInserted }, 'hello!'))
    })
    SnapseRoot(myApp())
    flush()
    expect(document.body.textContent).toBe('')
    s.show.set(true)
    flush()
    expect(document.body.textContent).toBe('hello!')
    expect(updates).toStrictEqual(['test', 'inserted'])
    s.show.set(false)
    flush()
    expect(document.body.textContent).toBe('')
    expect(updates).toStrictEqual(['test', 'inserted', 'removed'])
  })

  it('should not crash when nodeCreated is explicitly undefined', () => {
    const myApp = component(() => div({ id: 'test', nodeCreated: undefined }, 'hello'))
    expect(() => {
      SnapseRoot(myApp())
      flush()
    }).not.toThrow()
  })

  it('should throw when nodeRemoved is given a reactive State', () => {
    const s = state({ cleanup: undefined as DOMEventListener | undefined })
    // nodeRemoved doesn't accept a State (unlike e.g. `part`) -- cast past the type to
    // exercise the runtime guard.
    const myApp = component(() => div({ id: 'test', nodeRemoved: s.cleanup } as never, 'hello'))
    expect(() => {
      SnapseRoot(myApp())
      flush()
    }).toThrow()
  })

  it('should fire nodeCreated and nodeInserted on the client (csr)', () => {
    const counts = { created: 0, inserted: 0 }
    const myApp = component(() => div({
      nodeCreated: () => counts.created++,
      nodeInserted: () => counts.inserted++,
    }, 'x'))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('x')
    expect(counts).toStrictEqual({ created: 1, inserted: 1 })
  })

  it('should fire both nodeCreated and nodeInserted during hydration', () => {
    const counts = { created: 0, inserted: 0 }
    const myApp = component(() => div({
      nodeCreated: () => counts.created++,
      nodeInserted: () => counts.inserted++,
    }, 'x'))

    document.body.innerHTML = renderToString(myApp())
    expect(document.body.textContent).toBe('x')
    // No lifecycle callback fires while rendering to markup: there is no interaction, and
    // nothing is inserted into a document. Both fire on the client, below.
    expect(counts).toStrictEqual({ created: 0, inserted: 0 })
    counts.created = 0
    counts.inserted = 0
    SnapseRoot({ root: document.body, mode: 'hydrate' }, myApp())
    flush()
    expect(document.body.textContent).toBe('x')
    expect(counts).toStrictEqual({ created: 1, inserted: 1 })
  })
})
