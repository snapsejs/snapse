import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { div, p } from '@/DOM/elements/DOMElements.js'
import type { ChildProp } from '@/DOM/types.js'
import type { State } from '@/state/types/types.js'

describe('test state in the dom', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = 'Test:<div id="app"></div>world'
  })

  it('should install without arguments', () => {
    const myApp = component(() => {
      return p(
        'Hello',
      )
    })
    SnapseRoot(myApp())
    flush()
    expect(document.body.textContent).toBe('Test:worldHello')
  })

  it('should install in specified container', () => {
    const myApp = component(() => {
      return p(
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(document.body.textContent).toBe('Test:Helloworld')
  })

  it('should handle components with props', () => {
    type MyElProps = {
      children: ChildProp[]
      isGreat: boolean
    }

    const MyEl = component(({ children, isGreat }: MyElProps) => {
      const size = isGreat ? 'big' : 'small'
      return p(' ', children, ' ', size, ' ')
    })

    const myApp = component(() => {
      return MyEl(
        { isGreat: true },
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(document.body.textContent).toBe('Test: Hello big world')
  })

  it('should handle components returning components returning elements', () => {
    const myEl = component(({ children }) => {
      return p('a', children, 'b')
    })

    const myApp = component(() => {
      return myEl(
        'Hello',
      )
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(document.body.textContent).toBe('Test:aHellobworld')
  })

  it('should handle elements returning array of elements', () => {
    const myEl = component(({ children }) => {
      return [p('a', children, 'b'), div('x')]
    })

    const myApp = component(() => {
      return [myEl(
        'Hello',
      ), div('z')]
    })
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(document.body.textContent).toBe('Test:aHellobxzworld')
  })

  it('should update state nested inside stateless components returning components', () => {
    const s = state('start')
    const inner = component(() => div('val:', s))
    const middle = component(() => inner())
    const outer = component(() => div('wrap:', middle(), ':end'))

    SnapseRoot({ root: document.getElementById('app') }, outer())
    flush()
    expect(document.body.textContent).toBe('Test:wrap:val:start:endworld')

    s.set('changed')
    flush()
    expect(document.body.textContent).toBe('Test:wrap:val:changed:endworld')
  })

  it('should update state nested inside stateless components with siblings', () => {
    const s = state('a')
    const leaf = component(() => div('x:', s, ':y'))
    const wrapper = component(() => [div('before'), leaf(), div('after')])
    const outer = component(() => div(wrapper()))

    SnapseRoot({ root: document.getElementById('app') }, outer())
    flush()
    expect(document.body.textContent).toBe('Test:beforex:a:yafterworld')

    s.set('b')
    flush()
    expect(document.body.textContent).toBe('Test:beforex:b:yafterworld')
  })

  it('should keep a deeply-nested, no-element, multi-child component stable as a raw array item', () => {
    const leaf = component(({ n }: { n: number }) => [...Array(n).keys()].map(i => `${i}`))
    const middle = component(({ n }: { n: number }) => leaf({ n }))
    const outer = component(({ n }: { n: number }) => middle({ n }))

    const list = state([outer({ n: 2 }), outer({ n: 0 }), outer({ n: 3 })])
    const myApp = component(() => div('[', list, ']'))

    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    expect(document.body.textContent).toBe('Test:[01012]world')

    list.set([outer({ n: 1 }), outer({ n: 3 })])
    flush()
    expect(document.body.textContent).toBe('Test:[0012]world')

    list.set([])
    flush()
    expect(document.body.textContent).toBe('Test:[]world')
  })

  it('should accept a state as props', () => {
    type LabelProps = State<{ text: string, count: number }>
    const Label = component<LabelProps>(({ text, count, children }) => p(text, ':', count, children))
    const s = state({ label: { text: 'a', count: 1 } })
    SnapseRoot({ root: document.getElementById('app') }, Label(s.label, '!'))
    flush()
    expect(document.body.textContent).toBe('Test:a:1!world')

    s.label.count.set(2)
    flush()
    expect(document.body.textContent).toBe('Test:a:2!world')

    s.label = { text: 'b', count: 3 } as typeof s.label
    flush()
    expect(document.body.textContent).toBe('Test:b:3!world')
  })
})
