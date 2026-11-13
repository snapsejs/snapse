// Builds README.md from docs/README.template.md by injecting verified code snippets from the
// example sources. Editorial prose and API signatures live in the template; every runnable snippet is
// pulled from a //#region in examples/ so the documentation cannot drift from tested, compiling code.
//
// Placeholders in the template take the form:
//   <!-- snippet: stateBasics#state-def -->   inject a named region from an example file
//   <!-- snippet: todo -->                    inject a whole example file
//
// Run `node scripts/buildReadme.mjs` to regenerate README.md, or `--check` to verify it is current.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = resolve(root, 'docs/README.template.md')
const outputPath = resolve(root, 'README.md')

const exampleFiles = {
  stateBasics: 'examples/stateBasics.test.ts',
  components: 'examples/components.test.ts',
  trackHistory: 'examples/trackHistory.test.ts',
  server: 'examples/server.test.ts',
  moving: 'examples/moving.test.ts',
  todo: 'examples/todo/todo.ts',
  usage: 'examples/usage/main.ts',
  browser: 'examples/browser/index.html',
}

const regionStart = /^\s*\/\/\s*#region\s+(\S+)\s*$/
const regionEnd = /^\s*\/\/\s*#endregion\b/

const dedent = lines => {
  const indents = lines
    .filter(line => line.trim() !== '')
    .map(line => line.match(/^\s*/)[0].length)
  const common = indents.length ? Math.min(...indents) : 0
  return lines.map(line => line.slice(common))
}

const trimBlankEdges = lines => {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start++
  while (end > start && lines[end - 1].trim() === '') end--
  return lines.slice(start, end)
}

const extractRegion = (source, file, region) => {
  const lines = source.split('\n')
  const from = lines.findIndex(line => regionStart.test(line) && regionStart.exec(line)[1] === region)
  if (from === -1) throw new Error(`Region "${region}" not found in ${file}`)
  const rest = lines.slice(from + 1)
  const to = rest.findIndex(line => regionEnd.test(line))
  if (to === -1) throw new Error(`Region "${region}" in ${file} has no //#endregion`)
  return trimBlankEdges(dedent(rest.slice(0, to))).join('\n')
}

const resolveSnippet = key => {
  const [name, region] = key.split('#')
  const file = exampleFiles[name]
  if (!file) throw new Error(`Unknown example "${name}" in snippet "${key}"`)
  const source = readFileSync(resolve(root, file), 'utf8')
  const code = region ? extractRegion(source, file, region) : trimBlankEdges(source.split('\n')).join('\n')
  const language = file.endsWith('.html') ? 'html' : 'typescript'
  return '```' + language + '\n' + code + '\n```'
}

const build = () => {
  const template = readFileSync(templatePath, 'utf8')
  return template.replace(/^<!-- snippet: (.+?) -->$/gm, (_, key) => resolveSnippet(key.trim()))
}

const isCheck = process.argv.includes('--check')
const generated = build()

if (isCheck) {
  const current = readFileSync(outputPath, 'utf8')
  if (current !== generated) {
    console.error('README.md is out of date. Run `npm run build:readme` and commit the result.')
    process.exit(1)
  }
  console.log('README.md is up to date.')
} else {
  writeFileSync(outputPath, generated)
  console.log('Wrote README.md')
}
