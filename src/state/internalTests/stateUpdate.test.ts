import { describe, expect, it } from 'vitest'
import { LightState } from '@/state/stateInternals/LightState.js'
import { updateValue } from '@/state/stateInternals/stateUpdate.js'
import { isLightState } from '@/state/state.js'

describe.skipIf(process.env.CC_BUILD === 'true')('updateValue internals', () => {
  it('recurses into a POJO field that is already a raw LightState', () => {
    const inner = new LightState(1)
    const ls = new LightState<Record<string, unknown>>({ a: inner })
    updateValue(ls, { a: 2 })
    expect(inner.v).toBe(2)
  })

  it('detects raw LightState instances via isLightState', () => {
    const inner = new LightState(1)
    expect(isLightState(inner)).toBe(true)
    expect(isLightState({})).toBe(false)
    expect(isLightState(1)).toBe(false)
  })
})
