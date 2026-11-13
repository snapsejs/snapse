import { describe, expect, it } from 'vitest'
import { createPoisonedValue, getPoisonCause, isPoisoned } from '@/state/stateInternals/poison.js'
import { isPOJO } from '@/common/util.js'

describe.skipIf(process.env.CC_BUILD === 'true')('poison', () => {
  it('is recognized by isPoisoned and exposes its cause via getPoisonCause', () => {
    const cause = new Error('boom')
    const marker = createPoisonedValue(cause)
    expect(isPoisoned(marker)).toBe(true)
    expect(getPoisonCause(marker as object)).toBe(cause)
  })

  it('does not recognize ordinary values as poisoned', () => {
    expect(isPoisoned(1)).toBe(false)
    expect(isPoisoned('x')).toBe(false)
    expect(isPoisoned(null)).toBe(false)
    expect(isPoisoned(undefined)).toBe(false)
    expect(isPoisoned({})).toBe(false)
    expect(isPoisoned([])).toBe(false)
  })

  it('throws the cause via Symbol.toPrimitive for any coercion hint', () => {
    const cause = new Error('boom')
    const marker = createPoisonedValue(cause)
    expect(() => String(marker)).toThrow(cause)
    expect(() => `${marker}`).toThrow(cause)
    expect(() => +(marker as unknown as number)).toThrow(cause)
    expect(() => (marker as unknown as number) + 1).toThrow(cause)
  })

  it('throws the cause on arbitrary property/method access', () => {
    const cause = new Error('boom')
    const marker = createPoisonedValue(cause) as Record<string, unknown> & { map?: unknown }
    expect(() => marker.someProp).toThrow(cause)
    expect(() => (marker.map as (fn: unknown) => unknown)?.(() => {})).toThrow(cause)
  })

  it('throws the cause on the `in` operator', () => {
    const cause = new Error('boom')
    const marker = createPoisonedValue(cause)
    expect(() => 'someProp' in (marker as object)).toThrow(cause)
  })

  it('is not classified as a POJO or an array', () => {
    const marker = createPoisonedValue(new Error('boom'))
    expect(isPOJO(marker)).toBe(false)
    expect(Array.isArray(marker)).toBe(false)
  })
})
