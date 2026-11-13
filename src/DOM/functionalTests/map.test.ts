import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, compute, flush, peek, state } from '@/index.js'
import { renderToString } from '@/server.js'
import { div, span } from '@/DOM/elements/DOMElements.js'
import type { State } from '@/state/types/types.js'
import type { ChildNode, ChildProp } from '@/DOM/types.js'

let s = state({
  arr: [1, 2, 3, 4],
  c: 2,
  d: 3,
  e: 'e' as string | ChildNode,
})

const miv = component(({ children }) => {
  return div('m', ...children)
})

describe('node arrays with some disabled elements', () => {
  beforeEach(() => {
    setupDOM()
    s = state({
      arr: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      c: 2,
      d: 3,
      e: 'e' as string | ChildNode,
    })
  })

  it('maps again an element re-added after an update that removed it and added another', () => {
    const rows = state(['a', 'b', 'c'])
    let mappedCount = 0
    SnapseRoot({ root: document.body }, div(rows.map(row => {
      mappedCount++
      return span(row)
    })))
    flush()
    const b = rows[1]!
    rows.splice(1, 1, 'd')
    flush()
    expect(document.body.innerHTML).toBe('<div><span>a</span><span>d</span><span>c</span></div>')
    rows.push(b)
    flush()
    expect(document.body.innerHTML)
      .toBe('<div><span>a</span><span>d</span><span>c</span><span>b</span></div>')
    expect(mappedCount).toBe(5)
  })

  it('creates new component and element items of a derived list in order', () => {
    const items = state<string[]>([])
    const item = component(({ children }) => children)
    SnapseRoot({ root: document.body }, div(compute(() =>
      peek(items).map(v => v.startsWith('c') ? item(v) : div(v)))))
    flush()
    items.set(['c1', 'e1', 'c2', 'e2'])
    flush()
    expect(document.body.innerHTML).toBe('<div>c1<div>e1</div>c2<div>e2</div></div>')
  })

  it('moves a multi-node component between derived lists, keeping its nodes', () => {
    const inA = state(true)
    const moved = component(() => ['x', span('y')])()
    SnapseRoot({ root: document.body }, div(
      div(compute(() => peek(inA) ? [moved] : [])),
      div(compute(() => peek(inA) ? [] : [moved])),
    ))
    flush()
    const spanBefore = document.querySelector('span')
    inA.set(false)
    flush()
    expect(document.body.innerHTML).toBe('<div><div></div><div>x<span>y</span></div></div>')
    expect(document.querySelector('span')).toBe(spanBefore)
  })

  it('maps elements that rendering the same array has promoted while the map was inactive', () => {
    const rows = state(['a'])
    const showMapped = state(false)
    SnapseRoot({ root: document.body }, div(rows), div(showMapped.opt(rows.map(r => span(r)))))
    flush()
    rows.push('b')
    flush()
    showMapped.set(true)
    flush()
    expect(document.body.innerHTML).toBe('<div>ab</div><div><span>a</span><span>b</span></div>')
  })

  it('should handle nodearrays with changing number of elements', () => {
    const myApp = component(() => {
      return div(
        'b',
        s.arr.map(n => n % s.c === 0 ? null : div(n)),
        s.e,
        s.arr.map(n => n % s.d === 0 ? null : div(n)),
        'd',
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('b13579e124578d')
    s.c.set(4)
    flush()
    expect(document.body.textContent).toBe('b1235679e124578d')
    s.e.set('f')
    flush()
    expect(document.body.textContent).toBe('b1235679f124578d')
    s.d.set(2)
    flush()
    expect(document.body.textContent).toBe('b1235679f13579d')
    s.c.set(5)
    flush()
    expect(document.body.textContent).toBe('b12346789f13579d')
  })

  it('should insert two separate, non-adjacent runs of new items in a single update', () => {
    const myApp = component(() => div(s.arr.map(n => div(n))))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('123456789')
    s.arr.splice(2, 0, 100)
    s.arr.splice(8, 0, 200)
    flush()
    expect(document.body.textContent).toBe('121003456720089')
  })

  it('should insert a multi-item run as the second of two separate runs in one update', () => {
    const myApp = component(() => div(s.arr.map(n => div(n))))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('123456789')
    s.arr.splice(2, 0, 100)
    s.arr.splice(9, 0, 200, 201)
    flush()
    expect(document.body.textContent).toBe('121003456782002019')
  })

  it('reorders existing items while inserting a single new item in the same update', () => {
    const arr = state([1, 2, 3, 4, 5, 6])
    const myApp = component(() => div(arr.map(n => div(n))))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('123456')
    // swaps the two halves (a single contiguous move) and appends a new item
    arr.set([4, 5, 6, 1, 2, 3, 100])
    flush()
    expect(document.body.textContent).toBe('456123100')
  })

  it('reorders existing items while inserting two separate new items in the same update', () => {
    const arr = state([1, 2, 3, 4, 5, 6, 7, 8])
    const myApp = component(() => div(arr.map(n => div(n))))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('12345678')
    // swaps the two halves (a single contiguous move) and inserts two isolated single items
    arr.set([5, 6, 7, 8, 100, 1, 2, 3, 4, 101])
    flush()
    expect(document.body.textContent).toBe('56781001234101')
  })

  it('reorders existing items while inserting two separate multi-item runs in the same update', () => {
    const arr = state([1, 2, 3, 4, 5, 6, 7, 8])
    const myApp = component(() => div(arr.map(n => div(n))))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('12345678')
    // swaps the two halves (a single contiguous move) and inserts two separate 2-item runs
    arr.set([5, 6, 7, 8, 200, 201, 1, 2, 3, 4, 300, 301])
    flush()
    expect(document.body.textContent).toBe('56782002011234300301')
  })

  it('removes two non-adjacent single items from an array in the same update', () => {
    const arr = state([1, 2, 3, 4, 5, 6, 7, 8])
    const myApp = component(() => div(arr.map(n => div(n))))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('12345678')
    arr.set([1, 2, 4, 5, 7, 8])
    flush()
    expect(document.body.textContent).toBe('124578')
  })

  it('should handle nodearrays with changing number and type of elements', () => {
    const myApp = component(() => {
      return div(
        'b',
        s.arr.map(n => n % s.c === 0 ? null : div(n)),
        s.e,
        s.arr.map(n => n % s.d === 0 ? null : div(n)),
        'd',
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('b13579e124578d')
    s.c.set(4)
    flush()
    expect(document.body.textContent).toBe('b1235679e124578d')
    s.e.set(div('f'))
    flush()
    expect(document.body.textContent).toBe('b1235679f124578d')
    s.d.set(2)
    flush()
    expect(document.body.textContent).toBe('b1235679f13579d')
    s.c.set(5)
    flush()
    expect(document.body.textContent).toBe('b12346789f13579d')
  })

  it('should handle nodearrays with changing number and type of nodes', () => {
    const myApp = component(() => {
      return div(
        'b',
        s.arr.map(n => n % s.c === 0 ? null : String(n)),
        s.e,
        s.arr.map(n => n % s.d === 0 ? null : String(n)),
        'd',
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('b13579e124578d')
    s.c.set(4)
    flush()
    expect(document.body.textContent).toBe('b1235679e124578d')
    s.e.set('f')
    flush()
    expect(document.body.textContent).toBe('b1235679f124578d')
    s.d.set(2)
    s.e.set('g')
    flush()
    expect(document.body.textContent).toBe('b1235679g13579d')
    s.c.set(5)
    s.e.set(div('h'))
    flush()
    expect(document.body.textContent).toBe('b12346789h13579d')
    s.c.set(2)
    s.e = 'i' as State<string>
    flush()
    expect(document.body.textContent).toBe('b13579i13579d')
  })

  it('should handle nodearray with custom element children', () => {
    const myApp = component(() => {
      return div(
        'b',
        s.arr.map(n => n % s.c === 0 ? null : miv(n)),
        s.e,
        s.arr.map(n => n % s.d === 0 ? null : div(n)),
        'd',
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('bm1m3m5m7m9e124578d')
    s.c.set(4)
    flush()
    expect(document.body.textContent).toBe('bm1m2m3m5m6m7m9e124578d')
    s.e.set('f')
    flush()
    expect(document.body.textContent).toBe('bm1m2m3m5m6m7m9f124578d')
    s.d.set(2)
    flush()
    expect(document.body.textContent).toBe('bm1m2m3m5m6m7m9f13579d')
    s.c.set(5)
    flush()
    expect(document.body.textContent).toBe('bm1m2m3m4m6m7m8m9f13579d')
  })

  it('should handle cascading nodearrays with changing number of elements', () => {
    const x = s.arr.map(n => {
      return n % s.c === 0
        ? null
        : s.arr.map(m => {
            return m % s.d === 0
              ? div(n, m)
              : null
          })
    })

    const myApp = component(() => {
      return div(
        'b',
        x,
        'e',
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('b131619333639535659737679939699e')
  })

  it('should handle array updates efficiently', () => {
    const as = state(['anana', 'banana', 'canana'])
    const myApp = component(() => {
      return as.map((t, i) => div({ id: `test-${i}` }, t))
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    const oldDiv = document.getElementById('test-1') as HTMLElement
    expect(document.body.textContent).toBe('ananabananacanana')
    as[1]!.set('plum')
    flush()
    const newDiv = document.getElementById('test-1') as HTMLElement
    expect(document.body.textContent).toBe('ananaplumcanana')
    expect(oldDiv).toBe(newDiv)
  })

  it('should position a reactive sibling correctly after the preceding array is resized', () => {
    const arr = state([1, 2, 3])
    const t = state<string | null>('t')
    const myApp = component(() => {
      return [arr.map(v => div(v)), t]
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('123t')
    arr.push(4, 5)
    flush()
    expect(document.body.textContent).toBe('12345t')
    t.set(null)
    flush()
    expect(document.body.textContent).toBe('12345')
    t.set('u')
    flush()
    expect(document.body.textContent).toBe('12345u')
  })

  it('should handle elements returning arrays', () => {
    const myEl = component(({ children }) => {
      return [miv('a'), children, miv('b')]
    })
    const myApp = component(() => {
      return myEl('c')
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('macmb')
  })

  it('should render cascading nodearrays with changing number of elements', () => {
    const s = state({
      arr: [1, 2, 3, 4, 5, 6, 7, 8],
      c: 2,
      d: 3,
      e: 'e',
    })
    const x = s.arr.map(n => {
      return n % s.c === 0
        ? null
        : s.arr.map(m => {
            return m % s.d === 0
              ? div('>', n, m)
              : null
          })
    })

    const myApp = component(() => {
      return div(
        'b',
        x,
        'e',
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('b>13>16>33>36>53>56>73>76e')
    s.c.set(3)
    flush()
    expect(document.body.textContent).toBe('b>13>16>23>26>43>46>53>56>73>76>83>86e')
  })

  it('should render complex cascading nodearrays with changing number of elements', () => {
    const s = state({
      arr: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      c: 2,
      d: 3,
      e: 'e',
    })

    const miv = component(({ children }) => {
      return ['-', ...children]
    })

    const x = s.arr.map(n => {
      return n % s.c === 0
        ? null
        : s.arr.map(m => {
            return m % s.d === 0
              ? miv('>', n, '/', m)
              : null
          })
    })

    const myApp = component(() => {
      return div(
        'b',
        x,
        'e',
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe(
      'b->1/3->1/6->1/9->1/12->3/3->3/6->3/9->3/12->5/3->5/6->5/9->5/12->7/3->7/6->7/9->7/12->9/3->9/6->9/9'
      + '->9/12->11/3->11/6->11/9->11/12e',
    )
    s.c.set(3)
    flush()
    expect(document.body.textContent).toBe(
      'b->1/3->1/6->1/9->1/12->2/3->2/6->2/9->2/12->4/3->4/6->4/9->4/12->5/3->5/6->5/9->5/12->7/3->7/6->7/9'
      + '->7/12->8/3->8/6->8/9->8/12->10/3->10/6->10/9->10/12->11/3->11/6->11/9->11/12e')
  })

  it('renders a directly-returned mapped array and keeps it reactive', () => {
    const s = state([1, 2, 3, 4])
    const t = s.map(v => div(v))
    const myApp = component(() => {
      return t
    })
    SnapseRoot(myApp())
    flush()
    expect(document.body.textContent).toBe('1234')
    s[1]!.set(9)
    flush()
    expect(document.body.textContent).toBe('1934')
    s.push(5)
    flush()
    expect(document.body.textContent).toBe('19345')
  })
})

const elementLessApp = () => {
  const s = state([...Array(100).keys()])
  const Gloot = component(({ n }: { n: number }) => {
    return [...Array(n).keys()]
  })
  const myApp = component(() => {
    return ['b',
      s.map(v => {
        return Gloot({ n: v & 11 })
      }), 'e']
  })
  return { s, myApp }
}

describe('element-less components with a variable number of children', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should render and hydrate them', () => {
    const { myApp } = elementLessApp()
    document.body.innerHTML = renderToString(myApp())
    SnapseRoot({ mode: 'hydrate' }, myApp())
    flush()
    expect(document.body.textContent).toBe('b00101200101201234567012345678012345678901234567891001234567012'
      + '345678012345678901234567891000101200101201234567012345678012345678901234567891001234567012345678012'
      + '345678901234567891000101200101201234567012345678012345678901234567891001234567012345678012345678901'
      + '234567891000101200101201234567012345678012345678901234567891001234567012345678012345678901234567891'
      + '000101200101201234567012345678012345678901234567891001234567012345678012345678901234567891000101200'
      + '1012012345670123456780123456789012345678910012345670123456780123456789012345678910001012e')
  })

  it('should update one mapped entry after hydrating served markup', () => {
    const { s, myApp } = elementLessApp()
    document.body.innerHTML = renderToString(myApp())
    SnapseRoot({ mode: 'hydrate' }, myApp())
    flush()
    s[62]!.set(63)
    flush()
    expect(document.body.textContent).toBe('b0010120010120123456701234567801234567890123456789100123456701234'
      + '567801234567890123456789100010120010120123456701234567801234567890123456789100123456701234567801234'
      + '567890123456789100010120010120123456701234567801234567890123456789100123456701234567801234567890123'
      + '456789100010120010120123456701234567801234567890123456789100123456701234567801234567891001234567891'
      + '000101200101201234567012345678012345678901234567891001234567012345678012345678901234567891000101200'
      + '1012012345670123456780123456789012345678910012345670123456780123456789012345678910001012e')
    for (let i = 100; i < 200; i++) {
      s.push(i)
    }
    flush()
    expect(document.body.textContent).toBe('b0010120010120123456701234567801234567890123456789100123456701234'
      + '567801234567890123456789100010120010120123456701234567801234567890123456789100123456701234567801234'
      + '567890123456789100010120010120123456701234567801234567890123456789100123456701234567801234567890123'
      + '456789100010120010120123456701234567801234567890123456789100123456701234567801234567891001234567891'
      + '000101200101201234567012345678012345678901234567891001234567012345678012345678901234567891000101200'
      + '101201234567012345678012345678901234567891001234567012345678012345678901234567891000101200101201234'
      + '567012345678012345678901234567891001234567012345678012345678901234567891000101200101201234567012345'
      + '678012345678901234567891001234567012345678012345678901234567891000101200101201234567012345678012345'
      + '678901234567891001234567012345678012345678901234567891000101200101201234567012345678012345678901234'
      + '567891001234567012345678012345678901234567891000101200101201234567012345678012345678901234567891001'
      + '234567012345678012345678901234567891000101200101201234567012345678012345678901234567891001234567012'
      + '3456780123456789012345678910001012001012e')
  })
})

describe('node arrays, continued', () => {
  beforeEach(() => {
    setupDOM()
    s = state({
      arr: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      c: 2,
      d: 3,
      e: 'e' as string | ChildNode,
    })
  })

  it('should clear and re-add mapped entries', () => {
    const s = state([1, 2, 3])
    const MyApp = component(() => {
      return s.map(v => div(v))
    })
    SnapseRoot(MyApp())
    flush()
    expect(document.body.textContent).toBe('123')
    s.set([])
    flush()
    expect(document.body.textContent).toBe('')
    s.set([1, 2])
    flush()
    expect(document.body.textContent).toBe('12')
  })

  it('should properly render updated mapped entries', () => {
    const s = state({
      a: ['a', 'b', 'c'],
      s: true,
    })
    const MyApp = component(() => {
      return s.a.map(v => s.s.opt(div(v), 'x'))
    })
    SnapseRoot(MyApp())
    flush()
    expect(document.body.textContent).toBe('abc')
    s.s.set(false)
    flush()
    expect(document.body.textContent).toBe('xxx')
    s.a[1]!.set('y')
    s.s.set(true)
    flush()
    expect(document.body.textContent).toBe('ayc')
  })
})

describe('interior transparent multi-child controller', () => {
  beforeEach(() => {
    setupDOM()
  })
  it('keeps a following reactive array addressable after the fragment', () => {
    const Frag = component(() => [div('X'), div('Y')])
    const s = state<{ arr: number[] }>({ arr: [1, 2] })
    const app = component(() => div(Frag(), s.arr.map(n => div(String(n)))))
    SnapseRoot({ root: document.body }, app())
    flush()
    expect(document.body.textContent).toBe('XY12')
    s.arr.set([1, 2, 3])
    flush()
    expect(document.body.textContent).toBe('XY123')
    s.arr.set([9])
    flush()
    expect(document.body.textContent).toBe('XY9')
  })

  it('inlines a multi-child fragment between two siblings in order', () => {
    const Frag = component(() => [div('X'), div('Y')])
    const app = component(() => div(div('A'), Frag(), div('C')))
    SnapseRoot({ root: document.body }, app())
    flush()
    const root = document.body.querySelector('div')!
    expect([...root.children].map(c => c.textContent)).toEqual(['A', 'X', 'Y', 'C'])
  })
})

describe('StateController reuse-matching map (update() across sibling array states)', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('does not reuse a stale StateController left behind by a different array\'s update', () => {
    // update() matches new array-item definitions against a shared, module-level
    // stateControllerMap to decide which existing StateController instances can be reused
    // rather than recreated. The map must be cleared at the start of every update() call --
    // otherwise a LightState removed from one array (leaving a stale entry mapping it to its
    // now-orphaned StateController) can get incorrectly "reused" by a completely unrelated
    // array's later update, resurrecting a controller whose internal tree no longer matches
    // where it's being reinserted.
    const shared = state(div('shared'))
    const other = state(div('other'))
    const arr1 = state([shared] as ChildProp[])
    const arr2 = state([other] as ChildProp[])
    const myApp = component(() => div('A:', arr1, ' B:', arr2))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('A:shared B:other')

    arr1.set([])
    flush()
    expect(document.body.textContent).toBe('A: B:other')

    arr2.set([other, shared])
    flush()
    expect(document.body.textContent).toBe('A: B:othershared')
  })

  it('keeps a zero-node-count array item subscribed across a sibling reorder', () => {
    // oldChildren only collects children with a nonzero node count -- a zero-count item (like
    // an empty nested array) contributes nothing to the DOM, so it must be excluded from the
    // diff computeMutation runs against, matching how newChildren is filtered the same way.
    // Including it anyway desyncs the two sides: computeMutation then sees it as absent from
    // newChildren and schedules its removal, even though it's still live in the new array (just
    // reused via stateControllerMap) -- tearing down its subscription so a later push into it
    // silently never reaches the DOM.
    const a = div('a')
    const b = div('b')
    const empty = state([] as ChildProp[])
    const arr = state([a, empty, b] as ChildProp[])
    const myApp = component(() => div(arr))
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe('ab')
    arr.set([b, empty, a])
    flush()
    expect(document.body.textContent).toBe('ba')
    empty.push(div('X'))
    flush()
    expect(document.body.textContent).toBe('bXa')
  })
})
