// @vitest-environment jsdom
import {
  SnapseRoot, component, compute, findState, flush, isState, peek, state,
  subscribe,
} from 'snapse'
import { div, input } from 'snapse/DOM'
import { describe, expect, it } from 'vitest'
import type { State } from 'snapse'
import type { DOMChild } from 'snapse/DOM'
import { mount, sleep } from './testHelpers.js'

// Verified source for the README "Documentation" section.
// Each //#region is injected into the docs.
// The primary example lives inside a component so the named state is valid; illustrative
//  fragments that reference application-specific fields take the shopping-list state as
//  a parameter so they compile and read exactly as documented.

type ShoppingListType = {
  listName: string
  toBuy: string[]
  alreadyBought: string[]
  locked: boolean
  sortFunction: (a: string, b: string) => number
  selectedRowId: string | null
  selectedIndex: number | null
  data: string[]
  listItems: string[]
  confirmDialogOpen: boolean
  confirmDialogResponse: string
}

const Child = component(() => {
  //#region findState
  const shoppingListState = findState<ShoppingListType>('shoppingListState')
  //#endregion
  return div(String(shoppingListState.listName))
})

const ShoppingList = component(() => {
  //#region state-def
  const s = state({
    listName: 'Groceries',
    toBuy: ['milk', 'tinfoil'],
    alreadyBought: ['jam', 'elephant'],
    locked: false,
    sortFunction: (a: string, b: string) => a.localeCompare(b),
  }, 'shoppingListState')
  //#endregion

  //#region compute
  s.allItems = compute(() => [...s.toBuy, ...s.alreadyBought])
  //#endregion

  //#region subscribe
  subscribe(s.allItems, () => {
    localStorage.setItem('shoppingListItems', JSON.stringify(s.allItems))
  })
  //#endregion

  return Child()
})

const peekExamples = (s: State<ShoppingListType>) => {
  //#region peek
  if (typeof peek(s.sortFunction) === 'function') doSomething()
  //#endregion
}

const isStateExample = (propA: unknown) => {
  //#region isState
  if (isState(propA)) console.log('Received propA as a State')
  //#endregion
}

const flushExample = () => {
  const s = state({ toBuy: ['milk', 'tinfoil'], alreadyBought: ['jam', 'elephant'] })
  const allItems = compute(() => [...s.toBuy, ...s.alreadyBought])
  s.allItems = allItems
  // Render allItems so the derived state stays live, as it would in a real app.
  SnapseRoot({ root: document.createElement('div') },
    component(() => div(allItems.join(', ')))())
  //#region flush
  s.toBuy.push('snakes')
  flush()
  expect(String(s.allItems)).toBe('milk,tinfoil,snakes,jam,elephant')
  //#endregion
}

const computedPropertyExample = () => {
  //#region computed-property
  const s = state({
    p: {
      priceBeforeTax: 5,
      taxRate: 0.2,
    },
  })
  s.p.priceAfterTax = compute(() => s.p.priceBeforeTax * (1 + s.p.taxRate))
  // Assigning an object literal can only be done on a property of another object literal.
  // It upserts: the existing values are updated in place (not replaced), so priceAfterTax
  // stays connected and recomputes. New values are added.
  s.p = { priceBeforeTax: 8, taxRate: 0.25, campaign: true } as State<{
    priceBeforeTax: number
    taxRate: number
    campaign: boolean
  }>
  //#endregion
  return s
}

const newObjectPropertyExample = () => {
  //#region new-object-property
  const s = state({
    dogs: 17,
  })
  s.cats = 19 // s.cats is now also a State
  //#endregion

  return s
}

const referencedPropertyExample1 = () => {
  //#region state-reference
  const s = state({
    productIds: [37, 42, 55],
  })
  s.selectedProduct = s.productIds[2] // Create a reference to a state
  //#endregion

  return s
}

const referencedPropertyExample2 = () => {
  const s = state({
    productIds: [37, 42, 55],
  })
  s.selectedProduct = s.productIds[2] // Create a reference to a state
  //#region replace-state-reference
  delete s.selectedProduct
  s.selectedProduct = s.productIds[1]

  //#endregion
  return s
}

const chainFunctionExample = () => {
  //#region chain-filter
  const s = state({
    fruits: ['banana', 'mango', 'blueberry', 'melon'],
    filterString: 'a',
    customFilter: (value: string) => value.includes('go'),
  })
  s.filteredFruits = s.fruits.filter(fruit => fruit.indexOf(s.filterString) >= 0)
  s.customFilteredFruits = s.fruits.filter(s.customFilter)
  //#endregion
  return s
}

const isExample = (s: State<ShoppingListType>, currentRow: { id: string }) => {
  //#region is
  const isSelected = s.selectedRowId.is(currentRow.id)
  //#endregion
  return isSelected
}

const optExample = (s: State<ShoppingListType>) => {
  //#region opt
  s.locked.opt(LockIcon())
  s.selectedIndex.opt(s.data, 'Nothing selected')
  //#endregion
}

const orExample = (s: State<ShoppingListType>) => {
  //#region or
  return s.listItems.or('List is empty')
  //#endregion
}

const orChildExample = () => {
  //#region or-child
  const selected = state<DOMChild>(null)
  const display = selected.or(div('Nothing selected'))
  //#endregion
  return { selected, display }
}

const optChildExample = () => {
  //#region opt-child
  const selected = state<DOMChild>(null)
  const checkmark = selected.opt(CheckIcon())
  //#endregion
  return { selected, checkmark }
}

const awaitExample = async (s: State<ShoppingListType>) => {
  //#region await
  s.confirmDialogOpen.set(true)
  await s.confirmDialogResponse
  if (String(s.confirmDialogResponse) !== 'confirmed') return
  //#endregion
}

const functionStateExample = () => {
  //#region function-state
  const s = state({
    width: 4,
    area: (height: number): number => s.width * height,
  })

  // Calling the function state produces a chained state that tracks width.
  // It is not recalculated until it is rendered or subscribed to.
  const area = s.area(7)
  //#endregion
  return { s, area }
}

const circularExample = () => {
  //#region circular
  const s = state<number[]>([])
  const next = compute(() => s[0]! + 1)
  s.push(next)

  const display = div(next).catch('circular dependency')
  //#endregion
  return { display }
}

const tryCatchExample = () => {
  const s = state({ locked: true, price: 5, quantity: 3 })
  //#region try-catch
  const total = compute(() => {
    if (+s.locked) throw new Error('order total unavailable while locked')
    return s.price * s.quantity
  })

  let message = ''
  try {
    String(total)
  } catch (e) {
    message = (e as Error).message
  }
  //#endregion
  return message
}

const promiseExample = () => {
  //#region promise
  const s = state({ user: fetchUser() })
  //#endregion
  return s
}

const customObjectExample = () => {
  //#region custom-object
  // The root reference can't be reassigned in place, so a state to be replaced wholesale
  // is held as a property of a root state instead of being a root state itself.
  const s = state({ v: { selection: new Set<string>(['a']) } })
  const hasB = compute(() => s.v.selection.has('b'))

  s.v.selection.add('b') // Does not update hasB
  s.v = { selection: new Set(['b', 'c']) } as unknown as typeof s.v // Updates hasB
  //#endregion
  return { s, hasB }
}

const notExample = (s: State<ShoppingListType>) => {
  //#region not
  input({ disabled: s.locked.not() })
  //#endregion
}

const viewTransitionExample = (s: State<ShoppingListType>) => {
  //#region view-transition
  startViewTransition(() => {
    s.locked.set(true)
    flush()
  })
  //#endregion
}

// Documented fragments with no dedicated test: illustrative only, exported so they
//  compile and are checked by the type checker without being flagged as unused.
export {
  peekExamples, isStateExample, isExample, optExample, orExample,
  awaitExample, notExample, viewTransitionExample,
}

// Minimal stubs so the documented fragments above compile and run.
const doSomething = () => {}
const LockIcon = () => div('🔒')
const CheckIcon = () => div('✓')
const fetchUser = async (): Promise<{ name: string }> => ({ name: 'Ada' })
// `startViewTransition` is `document.startViewTransition`; stubbed so the fragment
//   type-checks under the test runner, which has no view-transition support.
const startViewTransition = (callback: () => void) => callback()

describe('README examples: state basics', () => {
  it('computes a derived property and upserts the base state in place', () => {
    const s = computedPropertyExample()
    expect(peek(s.p.priceBeforeTax)).toBe(8)
    expect(peek(s.p.taxRate)).toBe(0.25)
  })

  it('creates a new state for an added value', () => {
    const s = newObjectPropertyExample()
    expect(Number(s.cats)).toBe(19)
  })

  it('creates a reference to an existing state', () => {
    const s = referencedPropertyExample1()
    expect(peek(s.selectedProduct)).toBe(55)
    expect(s.selectedProduct).toBe(s.productIds[2])
  })

  it('replaces a reference by deleting it first', () => {
    const s = referencedPropertyExample2()
    expect(peek(s.selectedProduct)).toBe(42)
    expect(s.selectedProduct).toBe(s.productIds[1])
  })

  it('filters an array with a reactive and a custom predicate', () => {
    const s = chainFunctionExample()
    // peek unwraps one layer, so the element states are unwrapped individually.
    const filteredFruits = peek(s.filteredFruits) as State<string>[]
    const customFilteredFruits = peek(s.customFilteredFruits) as State<string>[]
    expect(filteredFruits.map(peek)).toEqual(['banana', 'mango'])
    expect(customFilteredFruits.map(peek)).toEqual(['mango'])
  })

  it('creates a chained state by calling a function held in a state', () => {
    const { s, area } = functionStateExample()
    const root = mount(component(() => div('area:', area))())
    expect(root.textContent).toBe('area:28')
    s.width.set(6)
    flush()
    expect(root.textContent).toBe('area:42')
  })

  it('reports a chained-state error via try/catch', () => {
    expect(tryCatchExample()).toBe('order total unavailable while locked')
  })

  it('catches a self-referential computed state with .catch()', () => {
    const { display } = circularExample()
    const root = mount(display)
    expect(root.textContent).toBe('circular dependency')
  })

  it('treats a custom object in a state as an opaque leaf', () => {
    const { s, hasB } = customObjectExample()
    // The whole-value replace is what a derived state reacts to; the earlier
    // in-place .add('b') left no trace.
    const root = mount(component(() => div([...peek(s.v.selection)].sort().join(''),
      hasB.opt('yes')))())
    expect(root.textContent).toBe('bcyes')
  })

  it('exposes a promise state as undefined until it resolves', async () => {
    const s = promiseExample()
    expect(peek(s.user)).toBeUndefined()
    await sleep(5)
    expect((peek(s.user) as unknown as { name: string }).name).toBe('Ada')
  })

  it('flushes a pending push into the derived list', () => {
    // flushExample asserts synchronously via vitest's expect after flush().
    flushExample()
  })

  it('resolves a named state from a descendant with findState', () => {
    const root = mount(ShoppingList())
    expect(root.textContent).toContain('Groceries')
  })

  it('falls back via .or() on a state that may hold a rendered element', () => {
    const { selected, display } = orChildExample()
    const root = mount(component(() => div(display))())
    expect(root.textContent).toBe('Nothing selected')
    selected.set(div('Milk'))
    flush()
    expect(root.textContent).toBe('Milk')
  })

  it('selects via .opt() on a state that may hold a rendered element', () => {
    const { selected, checkmark } = optChildExample()
    const root = mount(component(() => div(checkmark))())
    expect(root.textContent).toBe('')
    selected.set(div('Milk'))
    flush()
    expect(root.textContent).toBe('✓')
  })
})
