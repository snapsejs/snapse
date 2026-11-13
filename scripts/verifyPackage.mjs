// Packs the library with `npm pack`, installs the tarball into a throwaway ESM project, and type-checks
// a consumer that imports from `snapse`, `snapse/DOM` and `snapse/lint`. This guards that the shipped
// .d.ts actually resolve for a real consumer — catching things a source-only `tsc` cannot (e.g. wrong
// relative paths in the emitted declarations, or a missing `types`/`exports` entry).
//
// Assumes `npm run build` has already produced dist/. Run via `npm run verify:pack`.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, args, opts) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })
const installedVersion = name =>
  JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version

if (!existsSync(resolve(root, 'dist'))) throw new Error('dist/ not found - run `npm run build` first')

// `npm pack --json` builds the real publishable tarball (respecting the `files` field) and reports its name.
const packJson = execFileSync('npm', ['pack', '--json'], { cwd: root }).toString()
const tarball = resolve(root, JSON.parse(packJson)[0].filename)

const scratch = mkdtempSync(join(tmpdir(), 'snapse-verify-'))
try {
  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({ name: 'snapse-consumer', type: 'module', private: true }, null, 2),
  )
  // snapse/lint needs its optional peers, as any project using the lint rule has them
  const lintPeers = ['typescript', '@typescript-eslint/utils']
    .map(name => `${name}@${installedVersion(name)}`)
  run('npm', ['install', tarball, ...lintPeers], { cwd: scratch })

  writeFileSync(join(scratch, 'index.ts'), [
    "import { state, compute, TrackHistory } from 'snapse'",
    "import { div, button } from 'snapse/DOM'",
    "import { svg, circle } from 'snapse/SVG'",
    "import { renderToString } from 'snapse/server'",
    "import type { State } from 'snapse'",
    "import lintPlugin from 'snapse/lint'",
    'const s = state({ count: 0 })',
    'const doubled: State<number> = compute(() => s.count * 2)',
    "const el = div({ class: 'x' }, button('hi'), doubled)",
    "const shape = svg({ viewBox: '0 0 10 10' }, circle({ r: '5' }))",
    'const history = new TrackHistory(s)',
    "const markup: string = renderToString(div('hi'))",
    'void markup',
    'void el',
    'void shape',
    'void history',
    "void lintPlugin.rules['no-state-truthiness']",
  ].join('\n'))

  writeFileSync(join(scratch, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      strict: true,
      moduleResolution: 'node16',
      module: 'node16',
      target: 'es2021',
      lib: ['es2021', 'dom'],
      noEmit: true,
      skipLibCheck: false,
    },
  }, null, 2))

  run(resolve(root, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], { cwd: scratch })

  // snapse/SVG imports the core by package name; check that it resolves (package self-reference) and that
  // its elements render with the same library instance as snapse/server.
  writeFileSync(join(scratch, 'svg.mjs'), [
    "import { svg, circle } from 'snapse/SVG'",
    "import { renderToString } from 'snapse/server'",
    "const markup = renderToString(svg({ viewBox: '0 0 10 10' }, circle({ r: '5' })))",
    "if (!markup.includes('<circle r=\"5\"')) throw new Error(`Unexpected SVG markup: ${markup}`)",
  ].join('\n'))
  run('node', ['svg.mjs'], { cwd: scratch })

  writeFileSync(join(scratch, 'lint.mjs'), [
    "import plugin from 'snapse/lint'",
    "for (const name of ['no-state-truthiness', 'no-boolean-state-argument']) {",
    "  if (typeof plugin.rules[name]?.create !== 'function')",
    '    throw new Error(`snapse/lint has no ${name} rule`)',
    '}',
  ].join('\n'))
  run('node', ['lint.mjs'], { cwd: scratch })
  console.log('\nPackage verified: a consumer type-checks against the packed tarball, and snapse/SVG and'
    + ' snapse/lint run.')
} finally {
  rmSync(scratch, { recursive: true, force: true })
  rmSync(tarball, { force: true })
}
