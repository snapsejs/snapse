import { describe, expect, it } from 'vitest'
import { reported as reportedBy } from './lintTesting.ts'

const reported = (code: string) => reportedBy('no-boolean-state-argument', code)

const functions = `
const f = (b: boolean) => b
const optional = (b?: boolean | null) => b
const rest = (...bs: boolean[]) => bs
class C { constructor(public b: boolean) {} }
`

describe('no-boolean-state-argument', () => {
  it('reports a boolean State passed where a plain boolean is expected', async () => {
    expect(await reported(functions + 'f(s.flag)')).toEqual(['s.flag'])
    expect(await reported(functions + 'optional(s.flag)')).toEqual(['s.flag'])
    expect(await reported(functions + 'rest(true, s.flag)')).toEqual(['s.flag'])
    expect(await reported(functions + 'x = new C(s.flag)')).toEqual(['s.flag'])
    expect(await reported('document.body.toggleAttribute(\'hidden\', s.flag)')).toEqual(['s.flag'])
  })

  it('reports a boolean State derived with a state method', async () => {
    expect(await reported(functions + 'f(s.flag.not())')).toEqual(['s.flag.not()'])
    expect(await reported(functions + 'f(s.name.is(\'a\'))')).toEqual(['s.name.is(\'a\')'])
  })

  it('allows the value of a boolean State', async () => {
    expect(await reported(functions + 'f(!!+s.flag)')).toEqual([])
  })

  it('allows a boolean State where a State is accepted', async () => {
    expect(await reported('const t = state({ other: false })\nt.other.set(s.flag)')).toEqual([])
  })

  it('allows a boolean State where any value or a generic is expected', async () => {
    expect(await reported([
      'const anything = (v: unknown) => v',
      'const same = <T>(v: T) => v',
      'anything(s.flag)',
      'same(s.flag)',
      'console.log(s.flag)',
    ].join('\n'))).toEqual([])
  })

  it('ignores number and string States, which are rarely only tested', async () => {
    expect(await reported([
      'const n = (v: number) => v',
      'const str = (v: string) => v',
      'n(s.count)',
      'str(s.name)',
    ].join('\n'))).toEqual([])
  })
})
