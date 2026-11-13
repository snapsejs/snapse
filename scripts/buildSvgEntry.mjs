// Writes dist/snapse.SVG.js, the `snapse/SVG` import target, as a re-export from the single compiled
// dist/snapse.js so that all imports share one instance of the library. Where an SVG element name clashes
// with an HTML element, snapse.js exports the SVG one as `svg_<name>`; this entry maps it back.
// It imports the core by its package name rather than './snapse.js', so it resolves through the consumer's
// bundler or import map (and Node's package self-reference) - including where the file runs from a URL
// that relative imports can't resolve against, such as a blob module.

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

const svgNames = Object.keys(require(resolve(root, 'dist/snapse.SVG.cjs')))
const domNames = new Set(Object.keys(require(resolve(root, 'dist/snapse.DOM.cjs'))))

const bundle = readFileSync(resolve(root, 'dist/snapse.js'), 'utf8')
const exportMatch = bundle.match(/export\s*\{([^}]+)\}\s*;?\s*$/)
if (!exportMatch) throw new Error('No export statement found in dist/snapse.js')
const bundleNames = new Set(exportMatch[1].split(',').map(part => part.trim().split(/\s+as\s+/).pop()))

const specifiers = svgNames.map(name => {
  const bundleName = domNames.has(name) ? `svg_${name}` : name
  if (!bundleNames.has(bundleName)) {
    throw new Error(`dist/snapse.js lacks "${bundleName}" for snapse/SVG's "${name}"; see src/snapseAll.ts`)
  }
  return bundleName === name ? name : `${bundleName} as ${name}`
})

writeFileSync(resolve(root, 'dist/snapse.SVG.js'), `export{${specifiers.join(',')}}from'snapse';\n`)
