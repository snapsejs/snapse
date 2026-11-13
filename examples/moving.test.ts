// @vitest-environment jsdom
import { component, flush, state } from 'snapse'
import { button, div, input } from 'snapse/DOM'
import { describe, expect, it } from 'vitest'
import type { DOMChild } from 'snapse/DOM'
import { mount } from './testHelpers.js'

// Verified source for the README "Moving content" section.

const moveExample = () => {
  // #region move-between-arrays
  const Greeting = component(() => div({ class: 'greeting' }, 'Hello from a component'))

  const left = state<DOMChild[]>([input({ placeholder: 'Type here' }), Greeting()])
  const right = state<DOMChild[]>([])

  const moveRight = () => right.push(...left.splice(0))

  const page = div(
    div({ class: 'left' }, left),
    div({ class: 'right' }, right),
    button({ click: moveRight }, 'Move'),
  )
  // #endregion
  return page
}

describe('README examples: moving content', () => {
  it('moves an element and a component to another array, keeping their DOM nodes', () => {
    const root = mount(moveExample())
    const leftEl = root.querySelector('.left')!
    const rightEl = root.querySelector('.right')!
    const typedInput = leftEl.querySelector('input')!
    typedInput.value = 'typed text'
    const greeting = leftEl.querySelector('.greeting')!

    root.querySelector('button')!.click()
    flush()

    expect(leftEl.childNodes.length).toBe(0)
    expect(rightEl.children[0]).toBe(typedInput)
    expect(rightEl.children[1]).toBe(greeting)
    expect(typedInput.value).toBe('typed text')
  })
})
