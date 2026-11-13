// @vitest-environment jsdom
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Node's own require, so the shipped CommonJS files are loaded as a CommonJS consumer would load them
const nodeRequire = createRequire(import.meta.url)
const distDir = path.resolve(__dirname, '../dist')

const loadEntryPoints = (variant: string) => ({
  snapse: nodeRequire(path.join(distDir, `snapse${variant}.cjs`)),
  DOM: nodeRequire(path.join(distDir, `snapse.DOM${variant}.cjs`)),
  SVG: nodeRequire(path.join(distDir, `snapse.SVG${variant}.cjs`)),
  server: nodeRequire(path.join(distDir, `snapse.server${variant}.cjs`)),
})

describe.skipIf(process.env.CC_BUILD !== 'true').each(['', '.development'])('CommonJS bundle%s', variant => {
  it('renders and reactively updates a tree built from all entry points', () => {
    const { snapse, DOM, SVG } = loadEntryPoints(variant)
    const s = snapse.state({ count: 0 })
    const root = document.createElement('div')
    const counter = DOM.button({ click: () => s.count++ }, 'Clicked ', s.count)
    snapse.SnapseRoot({ root }, counter, SVG.svg(SVG.a()))
    snapse.flush()
    root.querySelector('button')!.click()
    snapse.flush()

    expect(root.querySelector('button')!.textContent).toBe('Clicked 1')
    expect(root.querySelector('svg > a')!.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })

  it('renders state to a string on the server', () => {
    const { snapse, DOM, server } = loadEntryPoints(variant)
    const s = snapse.state({ name: 'world' })
    expect(server.renderToString(DOM.div('Hello ', s.name))).toBe('<div>Hello <!--𝒮-->world</div>')
  })
})
