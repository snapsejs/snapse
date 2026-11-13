// @vitest-environment jsdom
import { SnapseRoot, component, flush, state } from 'snapse'
import { button, div, span } from 'snapse/DOM'
import { renderToString } from 'snapse/server'
import { describe, expect, it } from 'vitest'

// Verified source for the README "Server-side rendering" section.

const counterExample = () => {
  // #region counter
  const Counter = component(() => {
    const s = state({ count: 41 })
    return div(span(s.count), button({ click: () => s.count++ }, 'Count'))
  })

  const html = renderToString(Counter())
  // #endregion
  return { Counter, html }
}

describe('README examples: server-side rendering', () => {
  it('renders the counter to an HTML string', () => {
    const { html } = counterExample()
    expect(html).toContain('41')
    expect(html).toContain('Count')
  })

  it('hydrates using the same tree that was rendered on the server', () => {
    const { Counter, html } = counterExample()
    document.body.innerHTML = html

    // #region hydrate
    SnapseRoot({ mode: 'hydrate' }, Counter())
    // #endregion
    flush()

    document.body.querySelector('button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    flush()
    expect(document.body.querySelector('span')!.textContent).toBe('42')
  })
})
