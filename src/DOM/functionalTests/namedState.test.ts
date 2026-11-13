import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, findState, flush, peek, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'

type ParentState = {
  animal: string
}

const parentEl = component(({ children }) => {
  const rootState = state({
    animal: 'cat',
  }, 'rootState')
  const parentState = state({
    animal: 'bee',
  }, 'myState')
  return div('Root: ', rootState.animal, ' Parent: ', parentState.animal, ' ', children)
})

const sibling1El = component(({ children }) => {
  const parentState: ParentState = findState('myState')
  const myState = state({
    animal: 'snake',
  }, 'myState')
  return div('Sibling 1: ', parentState.animal, '/', myState.animal, ' ', children)
})

const sibling2El = component(({ children }) => {
  const parentState: ParentState = findState('myState')
  const myState = state({
    animal: 'pig',
  }, 'myState')
  return div('Sibling 2: ', parentState.animal, '/', myState.animal, ' ', children)
})

const grandchildEl = component(() => {
  const rootState: ParentState = findState('rootState')
  const parentState: ParentState = findState('myState')
  const myState = state({
    animal: 'crane',
  }, 'myState')
  return div('Grandchild: ', rootState.animal, '/', parentState.animal, '/', myState.animal)
})

describe('test state in the dom', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should create a state and render to DOM', () => {
    const myApp = component(() => {
      return parentEl(
        sibling1El(grandchildEl()),
        ' ',
        sibling2El(grandchildEl()),
      )
    })
    SnapseRoot({ root: document.body }, myApp())
    flush()
    expect(document.body.textContent).toBe(
      'Root: cat Parent: bee Sibling 1: bee/snake Grandchild: cat/snake/crane Sibling 2: bee/pig'
      + ' Grandchild: cat/pig/crane',
    )
  })

  it('returns the given default when a named state is not found', () => {
    let resolved: string | undefined
    const child = component(() => {
      const fallback = state('fallback')
      resolved = peek(findState<string>('missingState', fallback))
      return div('child')
    })
    SnapseRoot({ root: document.body }, child())
    flush()
    expect(resolved).toBe('fallback')
  })

  it('throws when a named state is not found and no default is given', () => {
    const child = component(() => {
      findState('missingState')
      return div('child')
    })
    SnapseRoot({ root: document.body }, child())
    expect(() => flush()).toThrow()
  })

  it('resolves a Symbol-keyed named state, isolating it from its description string', () => {
    const key = Symbol('shared')
    let bySymbol: string | undefined
    let byString: string | undefined
    const consumer = component(() => {
      bySymbol = peek(findState<{ animal: string }>(key).animal)
      // The Symbol's description string must not resolve the Symbol-keyed state.
      const fallback = state('none')
      byString = peek(findState<string>('shared', fallback))
      return div('consumer')
    })
    const provider = component(({ children }) => {
      state({ animal: 'owl' }, key)
      return div(children)
    })
    SnapseRoot({ root: document.body }, provider(consumer()))
    flush()
    expect(bySymbol).toBe('owl')
    expect(byString).toBe('none')
  })
})
