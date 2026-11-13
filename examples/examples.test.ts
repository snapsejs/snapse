// @vitest-environment jsdom
import { flush } from 'snapse'
import { describe, expect, it } from 'vitest'
import browserPage from './browser/index.html?raw'
import { TodoList } from './todo/todo.js'
import { mount } from './testHelpers.js'

describe('README examples: todo', () => {
  it('renders the TodoList demo', () => {
    const root = mount(TodoList())
    expect(root.querySelector('input')).not.toBeNull()
  })
})

const expectWorkingCounter = (flush: () => void) => {
  flush()
  const counter = document.body.lastElementChild as HTMLButtonElement
  expect(counter.textContent).toBe('Clicked 0 times')
  counter.click()
  counter.click()
  flush()
  expect(counter.textContent).toBe('Clicked 2 times')
}

describe('README examples: usage', () => {
  it('renders a counter button at the end of the body and counts clicks', async () => {
    await import('./usage/main.js')
    expectWorkingCounter(flush)
  })

  it('runs the no-build page script against the single-file bundle', async () => {
    const [, pageScript]
      = browserPage.match(/<script type="module">([\s\S]*?)<\/script>/)!
    const runnableScript
      = pageScript!.replace(/import (\{[^}]*\}) from 'https:[^']+'/, 'const $1 = bundle')
    const bundle = await import('@/snapseAll.js')
    document.body.replaceChildren()
    new Function('bundle', runnableScript)(bundle)
    expectWorkingCounter(bundle.flush)
  })
})
