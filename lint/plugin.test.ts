import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('snapse lint plugin', () => {
  // Type flag values differ between TypeScript versions, so a rule reading them from its own copy
  // of TypeScript misjudges types created by the linted project's (older or newer) compiler.
  it('uses TypeScript only for types, inspecting types through the linted program', () => {
    const sources = readdirSync(import.meta.dirname).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    for (const file of sources) {
      const source = readFileSync(`${import.meta.dirname}/${file}`, 'utf8')
      expect(source, file).not.toMatch(/^import (?!type )[^\n]*from 'typescript'/m)
    }
  })
})
