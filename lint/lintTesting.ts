import { resolve } from 'node:path'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { expect } from 'vitest'
import plugin from './index.ts'

const root = resolve(import.meta.dirname, '..')

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // the linted snippets exist only in memory
        projectService: { allowDefaultProject: ['lint/fixture.ts'], defaultProject: 'tsconfig.json' },
        tsconfigRootDir: root,
      },
    },
    // typescript-eslint's rule type and ESLint's plugin type do not quite agree
    plugins: { snapse: plugin as unknown as ESLint.Plugin },
    rules: {
      'snapse/no-state-truthiness': 'error',
      'snapse/no-boolean-state-argument': 'error',
    },
  },
})

const header = `import { state } from 'snapse'
const s = state<{
  flag: boolean, count: number, name: string, obj: { a: number },
  maybe?: { a: number }, people: { name: string }[]
}>({ flag: true, count: 0, name: '', obj: { a: 1 }, people: [] })
let x: unknown
`

/** The source text of each node the given rule reports */
export const reported = async (rule: string, code: string): Promise<string[]> => {
  const [result] = await eslint.lintText(header + code, { filePath: resolve(root, 'lint/fixture.ts') })
  const source = header + code
  const lines = source.split('\n')
  const offset = (line: number, column: number) =>
    lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0) + column - 1
  return result!.messages
    .filter(m => {
      expect(m.ruleId, m.message).toMatch(/^snapse\//)
      return m.ruleId === `snapse/${rule}`
    })
    .map(m => source.slice(offset(m.line, m.column), offset(m.endLine!, m.endColumn!)))
}
