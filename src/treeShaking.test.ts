// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import type { Rolldown } from 'vite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bundlePath = path.resolve(__dirname, '../dist/snapse.js')
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapse-treeshake-'))

// What an application bundler keeps of the compiled package when the entry re-exports only _names_
const bundleExports = async (names: string[]) => {
  const entry = path.join(workDir, `${names.join('-')}.js`)
  fs.writeFileSync(entry, `export { ${names.join(', ')} } from ${JSON.stringify(bundlePath)}\n`)
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    root: workDir,
    build: { write: false, lib: { entry, formats: ['es'], fileName: 'out' } },
  }) as Rolldown.RolldownOutput[]
  return output[0]!.output[0].code
}

const CLIENT_EXPORTS = [
  'SnapseRoot', 'component', 'compute', 'flush', 'findState', 'isState', 'peek', 'state', 'subscribe',
  'CircularDependencyError', 'div', 'svg',
]
const serverNodeCode = /get nodeType\(\)/
const serializerCode = /&amp;/
const changeTrackingCode = /addedValues/

describe.skipIf(process.env.CC_BUILD !== 'true')('tree shaking of the compiled bundle', () => {
  afterAll(() => fs.rmSync(workDir, { recursive: true, force: true }))

  it('should leave server rendering and change tracking out of a client application', async () => {
    const code = await bundleExports(CLIENT_EXPORTS)
    expect(code).toMatch(/createElement/)
    expect(code).not.toMatch(serverNodeCode)
    expect(code).not.toMatch(serializerCode)
    expect(code).not.toMatch(changeTrackingCode)
  }, 60_000)

  it('should keep server rendering when renderToString is used', async () => {
    const code = await bundleExports(['renderToString'])
    expect(code).toMatch(serverNodeCode)
    expect(code).toMatch(serializerCode)
  }, 60_000)

  it('should keep change tracking when TrackHistory is used', async () => {
    const code = await bundleExports(['TrackHistory'])
    expect(code).toMatch(changeTrackingCode)
  }, 60_000)
})
