import { describe, expect, it } from 'vitest'
import { reported as reportedBy } from './lintTesting.ts'

const reported = (code: string) => reportedBy('no-state-truthiness', code)

describe('no-state-truthiness', () => {
  it('reports a State of any value type where it is tested for truthiness', async () => {
    expect(await reported('if (s.flag) x = 1')).toEqual(['s.flag'])
    expect(await reported('if (s.count) x = 1')).toEqual(['s.count'])
    expect(await reported('if (s.name) x = 1')).toEqual(['s.name'])
    expect(await reported('if (s.obj) x = 1')).toEqual(['s.obj'])
    expect(await reported('while (s.flag) x = 1')).toEqual(['s.flag'])
    expect(await reported('x = s.flag ? 1 : 2')).toEqual(['s.flag'])
    expect(await reported('x = !s.flag')).toEqual(['s.flag'])
    expect(await reported('x = Boolean(s.count)')).toEqual(['s.count'])
  })

  it('reports a State returned by a state method, such as `is` or `not`', async () => {
    expect(await reported('const oneWay = s.name.is(\'one-way\')\nx = oneWay || s.count')).toEqual(['oneWay'])
    expect(await reported('x = s.flag.not() ? 1 : 2')).toEqual(['s.flag.not()'])
  })

  it('reports the left operand of && and ||, and the right one where the whole is tested', async () => {
    expect(await reported('x = s.flag && 1')).toEqual(['s.flag'])
    expect(await reported('x = 1 || (s.flag && 2)')).toEqual(['s.flag'])
    expect(await reported('if (x && s.flag) x = 1')).toEqual(['s.flag'])
    expect(await reported('if (s.flag || s.count) x = 1')).toEqual(['s.flag', 's.count'])
  })

  it('reports a State returned from a plain array predicate', async () => {
    expect(await reported('x = [1].filter(() => s.flag)')).toEqual(['s.flag'])
    expect(await reported('x = [1].some(() => { return s.flag })')).toEqual(['s.flag'])
  })

  it('allows a tested State value and a State used as a value', async () => {
    expect(await reported([
      'if (+s.flag) x = 1',
      'x = { disabled: s.flag.not() }',
      'x = +s.flag || 1',
      'const i = 1',
      'x = i > 0 && s.flag',
      'x = s.flag ?? true',
      'if (x) x = s.flag',
    ].join('\n'))).toEqual([])
  })

  it('allows a presence check on an optional State', async () => {
    expect(await reported('if (s.maybe) x = 1')).toEqual([])
  })

  it('allows a State result in a State array\'s own predicate methods', async () => {
    expect(await reported('x = s.people.filter(p => p.name.startsWith(\'a\'))')).toEqual([])
  })
})
