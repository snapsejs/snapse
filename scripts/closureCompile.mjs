import { execFileSync } from 'child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Read vite's single-file bundle and extract its export statement
const inputJs = readFileSync(resolve(root, 'dist/snapse.cc.input.js'), 'utf8')
const exportMatch = inputJs.match(/export\s*\{([^}]+)\}\s*;?\s*$/)
if (!exportMatch) throw new Error('No export statement found in dist/snapse.cc.input.js')

// Parse "localName as publicName" pairs from the export statement
const exportPairs = exportMatch[1].split(',').map(part => {
  const [local, pub] = part.trim().split(/\s+as\s+/)
  return [local.trim(), (pub ?? local).trim()]
})

// Replace the export with globalThis keep-alive assignments.
// CC ADVANCED cannot DCE string-key property assignments on external objects,
// so each symbol stays alive even though nothing inside the compilation consumes it.
const keepAlives = exportPairs.map(([local, pub]) => `globalThis['__snapse_${pub}']=${local};`).join('')
const tmpInput = resolve(root, 'dist/_snapse.cc.tmp.js')
writeFileSync(tmpInput, inputJs.slice(0, exportMatch.index) + keepAlives)

try {
  execFileSync(
    resolve(root, 'node_modules/.bin/google-closure-compiler'),
    [
      '--compilation_level=ADVANCED',
      '--jscomp_off=checkTypes',
      '--language_in=ECMASCRIPT_NEXT',
      '--language_out=ECMASCRIPT_NEXT',
      '--env=BROWSER',
      '--rewrite_polyfills=false',
      '--chunk_output_type=ES_MODULES',
      '--chunk_output_path_prefix=dist/',
      '--externs=scripts/closureExterns.js',
      '--js=dist/_snapse.cc.tmp.js',
      '--chunk=snapse:1',
    ],
    { stdio: 'inherit', cwd: root },
  )

  // Post-process: CC converts globalThis['__snapse_X'] to globalThis.__snapse_X
  // and renames internal identifiers. Tokenize to extract the renamed value for each
  // public name, strip the keep-alive assignments, and emit a real ES export.
  const ccOutput = readFileSync(resolve(root, 'dist/snapse.js'), 'utf8')
  const exportMap = {} // publicName -> ccIdentifier (or temp var)
  const extraDecls = []
  const removals = []

  let i = 0
  let shortNameCount = 0
  while (i < ccOutput.length) {
    const start = ccOutput.indexOf('globalThis.__snapse_', i)
    if (start === -1) break

    const nameStart = start + 'globalThis.__snapse_'.length
    let nameEnd = nameStart
    while (nameEnd < ccOutput.length && /[A-Za-z0-9_$]/.test(ccOutput[nameEnd])) nameEnd++

    if (ccOutput[nameEnd] !== '=') {
      i = nameEnd
      continue
    }
    const pubName = ccOutput.slice(nameStart, nameEnd)
    const valStart = nameEnd + 1

    // Tokenize: stop at ';' at bracket depth 0, skip string contents
    let depth = 0
    let j = valStart
    while (j < ccOutput.length) {
      const ch = ccOutput[j]
      if (ch === '"' || ch === "'" || ch === '`') {
        const q = ch
        j++
        while (j < ccOutput.length && ccOutput[j] !== q) {
          if (ccOutput[j] === '\\') j++
          j++
        }
      } else if ('([{'.includes(ch)) {
        depth++
      } else if (')]}'.includes(ch)) {
        depth--
      } else if (ch === ';' && depth === 0) {
        break
      }
      j++
    }

    const value = ccOutput.slice(valStart, j).trim()
    if (!exportMap[pubName]) {
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) {
        exportMap[pubName] = value
      } else {
        const shortNames = 'abcdefghijklmnopqrstuvwxyz'
        const shortName = shortNames[shortNameCount++]
        if (shortNameCount === shortNames.length) throw Error('Not enough names')
        const tmp = `_${shortName}`
        extraDecls.push(`${tmp}=${value}`)
        exportMap[pubName] = tmp
      }
    }
    removals.push({ start, end: j + 1 })
    i = j + 1
  }

  if (Object.keys(exportMap).length === 0) {
    throw new Error('No globalThis.__snapse_ assignments found in CC output')
  }

  // Rebuild output without keep-alive assignments and with real ES exports
  let cleaned = ''
  let lastEnd = 0
  for (const { start, end } of removals) {
    cleaned += ccOutput.slice(lastEnd, start)
    lastEnd = end
  }
  cleaned += ccOutput.slice(lastEnd)
  cleaned = cleaned.replace(/export\s*\{[^}]*\}\s*;?\s*$/, '').trimEnd()

  const exportSpecs = Object.entries(exportMap).map(([pub, cc]) => `${cc} as ${pub}`).join(',')
  const declsBlock = extraDecls.length ? 'var ' + extraDecls.join(',') + ';' : ''
  writeFileSync(
    resolve(root, 'dist/snapse.js'),
    cleaned + declsBlock + '\nexport{' + exportSpecs + '};\n',
  )
} finally {
  unlinkSync(tmpInput)
  // The vite CC-prebuild bundle is a build intermediate; drop it so it does not ship in the package.
  unlinkSync(resolve(root, 'dist/snapse.cc.input.js'))
}
