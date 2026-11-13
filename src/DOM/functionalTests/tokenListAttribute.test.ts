import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from './common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { iframe, link, p } from '@/DOM/elements/DOMElements.js'
import { renderToString } from '@/server.js'

describe('token-list attributes', () => {
  beforeEach(() => {
    setupDOM()
  })

  it('should set iframe sandbox and link sizes as plain string attributes', () => {
    const permissions = state('allow-scripts')
    const myApp = component(() => p(
      iframe({ id: 'frame', sandbox: permissions }),
      link({ id: 'icon', rel: 'icon', sizes: '32x32' }),
    ))
    SnapseRoot({ root: document.getElementById('app') }, myApp())
    flush()
    const frame = document.getElementById('frame') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(document.getElementById('icon')!.getAttribute('sizes')).toBe('32x32')
    permissions.set('allow-scripts allow-forms')
    flush()
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms')
  })

  it('should render a token-list attribute on the server', () => {
    const html = renderToString(iframe({ sandbox: 'allow-scripts', part: 'preview' }))
    expect(html).toContain('sandbox="allow-scripts" part="preview"')
  })

  it('should not accept the classList and relList mirrors as attributes', () => {
    // @ts-expect-error classList is not an attribute; use class
    p({ classList: 'x' })
    // @ts-expect-error relList is not an attribute; use rel
    link({ relList: 'icon' })
  })
})
