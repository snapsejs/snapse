// @vitest-environment jsdom
import { SnapseRoot, component, flush, state } from 'snapse'
import { button, div, domElement, input, option, select, table, tbody, td, tfoot, tr }
  from 'snapse/DOM'
import { circle, svg } from 'snapse/SVG'
import { describe, expect, it } from 'vitest'
import type { State } from 'snapse'
import type { ChildProp, DOMChild } from 'snapse/DOM'
import { mount, sleep } from './testHelpers.js'

// Verified source for the README "Components" section.
// Shared setup lives outside the //#region markers;
//   snippets that need their own state or props are scoped in small functions.

const compositionExample = () => {
  // #region composition
  const MainComponent = component(() => div({ class: 'main' }, 'Main content'))
  type FooterProps = { size: string, children: ChildProp[] }
  const Footer = component(({ size, children }: FooterProps) =>
    div({ class: `footer-${size}` }, children))

  const page = div({ class: 'page' },
    MainComponent,
    Footer({ size: 'large' },
      'Snapse example',
    ),
  )
  // #endregion
  return page
}

const functionComponentExample = () => {
  // #region function-component
  const simpleComponent = () => div('example text')
  const page = div(simpleComponent)
  // #endregion
  return page
}

const functionComponentArgsExample = () => {
  // #region function-component-args
  const argumentComponent = (n: number) => div('the answer is ', n)
  const page = div(() => argumentComponent(42))
  // #endregion
  return page
}

const catchBasicExample = () => {
  // #region catch-basic
  const Weather = component(() => {
    throw new Error('forecast service unavailable')
  })

  const page = div(Weather().catch('Unable to load weather'))
  // #endregion
  return page
}

const renderErrorResetExample = () => {
  // #region render-error-reset
  let widgetBroken = true
  const FlakyWidget = component(() => {
    if (widgetBroken) throw new Error('widget crashed')
    return div('widget ok')
  })

  const Fallback = component(({ renderError }) => div(
    'Failed: ',
    (renderError!.cause as Error).message,
    ' ',
    button({ click: () => renderError!.reset() }, 'Retry'),
  ))

  const page = div(FlakyWidget().catch(Fallback()))
  // #endregion
  return {
    page,
    fix: () => {
      widgetBroken = false
    },
  }
}

const renderErrorStopPropagationExample = () => {
  // #region render-error-stop-propagation
  let outerNotified = false
  const Throwing = component(() => {
    throw new Error('boom')
  })

  const Inner = component(() => Throwing().catch(e => {
    e.stopPropagation() // Prevents the outer .catch() below from also being notified.
    return 'inner handled'
  }))

  const page = div(Inner().catch(() => {
    outerNotified = true
    return 'outer handled'
  }))
  // #endregion
  return { page, outerNotified: () => outerNotified }
}

const classNestingExample = (content: string) => {
  const s = state({ customClass: 'blue', isSpecial: true })
  // #region class-nesting
  div(
    {
      class: [
        'standard-div',
        s.customClass,
        {
          'special-div': s.isSpecial,
        },
      ],
    },
    content,
  )
  // #endregion
}

const reactiveChildrenExample = () => {
  // #region reactive-children
  const s = state({
    background: 'red',
    buttonText: 'Ok',
  })
  div({ style: { background: s.background } },
    button({ click: () => alert('Clicked') }, s.buttonText))
  // #endregion
}

const clickEventExample = () => {
  // #region click-event
  const s = state({ clicks: 0 })
  // const countClick = () => s.clicks++
  const counter = button({ click: () => s.clicks++ }, 'Clicked ', s.clicks, ' times')
  // #endregion
  return counter
}

const swappableChildExample = () => {
  // #region swappable-child
  const view = state<DOMChild>(null)
  const showWelcome = () => view.set(div('Welcome!'))
  const showProfile = () => view.set(div({ class: 'profile' }, 'Your profile'))
  const app = div({ id: 'app' }, view)
  // #endregion
  return { app, showWelcome, showProfile }
}

// #region dom-element
const specialElement = domElement('special-element')

specialElement({ excel: true, prevaricate: 'maybe' },
  div('Excellent child'))
// #endregion

// #region component
const SearchableTable = component(({ rowData }: { rowData: State<string[][]> }) => {
  const query = state('')
  const filterFunction = (row: State<string[]>) => row.some(cell => cell.includes(query))

  return div(
    table(
      tbody(
        rowData.filter(filterFunction)
          .map((row: string[]) => tr(
            row.map((cellData: string) => td(cellData)),
          )),
      ),
      tfoot(
        tr(td(input({ change: query }))),
      ),
    ),
  )
})
// #endregion

const snapseRootExample = () => {
  const MyComponent = component(() => div('app'))
  // #region snapse-root
  SnapseRoot(MyComponent)
  // #endregion
}

const elementBasicExample = (s: State<{ name: string }>) => {
  // #region element-basic
  div({ id: 'greeting', class: 'banner' }, 'Hello, ', s.name, '!')
  // #endregion
}

const elementAttributesExample = (s: State<{ busy: boolean }>) => {
  // #region element-attributes
  // A boolean attribute is rendered when truthy and omitted when falsy; both plain
  // and reactive values are accepted, as is any custom attribute.
  input({ type: 'text', required: true, disabled: s.busy, 'data-role': 'title' })
  // #endregion
}

const interpolationExample = () => {
  const s = state({ width: 4 })
  // #region attribute-interpolation
  // Arrays are joined into one value; a State among them keeps it reactive.
  const box = div({ id: 'sidebar', style: { width: [s.width, 'px'] } })
  // #endregion
  return { s, box }
}

const outputBindingExample = () => {
  // #region output-binding
  const s = state({ name: '', agreed: false, size: 'M' })
  // Passing s.name (a State) is equivalent to `ev => s.name.set(ev.target.value)`.
  div(
    input({ value: s.name, input: s.name }),
    input({ type: 'checkbox', checked: s.agreed, change: s.agreed }),
    select({ value: s.size, change: s.size },
      option({ value: 'S' }, 'Small'),
      option({ value: 'M' }, 'Medium')),
  )
  // #endregion
}

const svgExample = () => {
  // #region svg
  // SVG element functions come from snapse/SVG; they work like DOM elements.
  svg({ viewBox: '0 0 100 100', width: 100 },
    circle({ cx: 50, cy: 50, r: 40, fill: 'tomato' }))
  // #endregion
}

// Minimal stub so the async-component fragment compiles and runs under the test.
const loadUser = async (): Promise<{ name: string }> => ({ name: 'Ada Lovelace' })

// #region async-component
const UserCard = component(async () => {
  const user = await loadUser()
  return div({ class: 'card' }, user.name)
})
// #endregion

const componentOrExample = () => {
  // #region component-or
  const page = div(UserCard().or('Loading...'))
  // #endregion
  return page
}

const componentOrViaStateExample = () => {
  // #region component-or-via-state
  const view = state(UserCard()).or('Loading...')
  const page = div(view)
  // #endregion
  return page
}

const portalExample = () => {
  const s = state({ dialogOpen: true })
  // #region portal
  const Dialog = component(() => SnapseRoot(
    { root: document.getElementById('modal-root') },
    div({ class: 'dialog' }, 'Saved!'),
  ))

  const Page = component(() => div('Page content', s.dialogOpen.opt(Dialog)))
  // #endregion
  return { s, Page }
}

const customAttributeExamples = () => {
  // #region node-created
  div({ nodeCreated: (element: { target?: HTMLElement }) => console.log(element) })
  // #endregion
  // #region node-inserted
  div({ nodeInserted: (element: { target?: HTMLElement }) => console.log(element) })
  // #endregion
  // #region node-removed
  div({ nodeRemoved: () => console.log('Element was removed') })
  // #endregion
  // #region inner-html
  div({ innerHTML: 'Some text with <em>markup</em>.' })
  // #endregion
}

// Documented fragments with no dedicated test: illustrative only, exported so they
//  compile and are checked by the type checker without being flagged as unused.
export {
  classNestingExample, reactiveChildrenExample, snapseRootExample, elementBasicExample,
  elementAttributesExample, outputBindingExample as twoWayBindingExample, svgExample,
  customAttributeExamples,
}

// #region null-value
SnapseRoot(component(() => {
  const s = state({
    disabled: false,
    onClick: (() => {
      console.log('clicked, disabling')
      s.disabled.set(true)
      s.onClick.set(null)
    }) as (() => void) | null,
  })
  const onMouseOver = s.disabled.opt(() => console.log('mouse over'))

  return button({ disabled: s.disabled, click: s.onClick, mouseover: onMouseOver })
})())
// #endregion

describe('README examples: components', () => {
  it('composes elements and components into a page', () => {
    const root = mount(compositionExample())
    expect(root.querySelector('.main')!.textContent).toBe('Main content')
    expect(root.querySelector('.footer-large')!.textContent).toBe('Snapse example')
  })

  it('renders a niladic function as a lightweight component', () => {
    const root = mount(functionComponentExample())
    expect(root.textContent).toBe('example text')
  })

  it('invokes an argument-taking function component via an arrow function', () => {
    const root = mount(functionComponentArgsExample())
    expect(root.textContent).toBe('the answer is 42')
  })

  it('replaces a throwing component with a static .catch() fallback', () => {
    const root = mount(catchBasicExample())
    expect(root.textContent).toBe('Unable to load weather')
  })

  it('retries the original render when RenderError.reset() is called', () => {
    const { page, fix } = renderErrorResetExample()
    const root = mount(page)
    expect(root.textContent).toBe('Failed: widget crashed Retry')
    fix()
    root.querySelector('button')!.click()
    flush()
    expect(root.textContent).toBe('widget ok')
  })

  it('stops an error from reaching an outer .catch() via stopPropagation()', () => {
    const { page, outerNotified } = renderErrorStopPropagationExample()
    const root = mount(page)
    expect(root.textContent).toBe('inner handled')
    expect(outerNotified()).toBe(false)
  })

  it('renders and filters a SearchableTable component', () => {
    const rowData = state([['Ada', 'Lovelace'], ['Alan', 'Turing']]) as State<string[][]>
    const root = mount(SearchableTable({ rowData }))
    expect(root.querySelectorAll('tbody tr').length).toBe(2)
    expect(root.textContent).toContain('Lovelace')
  })

  it('interpolates a state into an attribute value via an array', () => {
    const { s, box } = interpolationExample()
    const root = mount(box)
    const el = root.querySelector('#sidebar') as HTMLElement
    expect(el.style.width).toBe('4px')
    s.width.set(9)
    flush()
    expect(el.style.width).toBe('9px')
  })

  it('shows an async component fallback, then its resolved content', async () => {
    const root = mount(componentOrExample())
    expect(root.textContent).toContain('Loading')
    await sleep(5)
    flush()
    expect(root.textContent).toContain('Ada Lovelace')
  })

  it('shows the same fallback when .or() is called through a State instead', async () => {
    const root = mount(componentOrViaStateExample())
    expect(root.textContent).toContain('Loading')
    await sleep(5)
    flush()
    expect(root.textContent).toContain('Ada Lovelace')
  })

  it('renders portal content into a separate root', () => {
    document.body.innerHTML = '<div id="app"></div><div id="modal-root"></div>'
    const { Page } = portalExample()
    SnapseRoot({ root: document.getElementById('app') }, Page())
    flush()
    expect(document.getElementById('app')!.textContent).toBe('Page content')
    expect(document.getElementById('modal-root')!.textContent).toContain('Saved!')
  })

  it('updates a State from a button click listener', () => {
    const root = mount(clickEventExample())
    root.querySelector('button')!.click()
    root.querySelector('button')!.click()
    flush()
    expect(root.textContent).toBe('Clicked 2 times')
  })

  it('swaps a held child by reassigning the state that holds it', () => {
    const { app, showWelcome, showProfile } = swappableChildExample()
    const root = mount(app)
    expect(root.textContent).toBe('')
    showWelcome()
    flush()
    expect(root.textContent).toBe('Welcome!')
    showProfile()
    flush()
    expect(root.textContent).toBe('Your profile')
  })
})
