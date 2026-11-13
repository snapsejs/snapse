import { execFileSync } from 'child_process'
import { existsSync, readFileSync, rmSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

if (!existsSync(resolve(root, 'dist'))) throw new Error('dist/ not found - run `npm run build` first')

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const outFile = resolve(root, `${pkg.name}-${pkg.version}.tar.gz`)

rmSync(outFile, { force: true })

// Mirror what `npm pack` ships: the whole dist/ (including the .d.ts that `types`/`exports` point to),
// plus README and LICENSE, and drop build intermediates (sourcemaps, the CC-prebuild bundle).
execFileSync(
  'tar',
  [
    '-czf', outFile,
    '--exclude=dist/snapse.cc.input.js',
    '--exclude=*.map',
    '-s', '|^|package/|',
    'dist', 'package.json', 'README.md', 'LICENSE',
  ],
  { cwd: root, stdio: 'inherit' },
)
