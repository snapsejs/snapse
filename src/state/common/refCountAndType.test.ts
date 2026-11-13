import { describe, expect, it } from 'vitest'
import {
  getRefCount, getStateType,
  setRefCount,
  setStateType,
} from './refCountAndType.js'
import { LightState } from '../stateInternals/LightState.js'
import type { StateType } from '@/state/types/types.js'

const makeTarget = (): LightState => new LightState(null)
const REFCOUNT_MAX = (2 ** 27) - 1

describe('getRefcount / setRefcount', () => {
  it('stores and retrieves inline values', () => {
    const s = makeTarget()
    setRefCount(s, 0)
    expect(getRefCount(s)).toBe(0)
    setRefCount(s, 1)
    expect(getRefCount(s)).toBe(1)
    setRefCount(s, 100)
    expect(getRefCount(s)).toBe(100)
    setRefCount(s, REFCOUNT_MAX)
    expect(getRefCount(s)).toBe(REFCOUNT_MAX)
  })

  it('overwrites previously set refcount', () => {
    const s = makeTarget()
    setRefCount(s, 10)
    setRefCount(s, 99)
    expect(getRefCount(s)).toBe(99)
  })

  it('uses LONG_REFCOUNT for values >= REFCOUNT_MAX', () => {
    const s = makeTarget()
    setRefCount(s, REFCOUNT_MAX - 1)
    expect(getRefCount(s)).toBe(REFCOUNT_MAX - 1)

    setRefCount(s, REFCOUNT_MAX)
    expect(getRefCount(s)).toBe(REFCOUNT_MAX)

    setRefCount(s, REFCOUNT_MAX + 1)
    expect(getRefCount(s)).toBe(REFCOUNT_MAX + 1)

    setRefCount(s, 50000)
    expect(getRefCount(s)).toBe(50000)
  })
})

describe('getStateType / setStateType', () => {
  it('stores and retrieves all 3-bit type values', () => {
    for (let type = 0; type <= 7; type++) {
      const s = makeTarget()
      setStateType(s, type as StateType)
      expect(getStateType(s)).toBe(type)
    }
  })

  it('overwrites previously set state type', () => {
    const s = makeTarget()
    setStateType(s, 5 as StateType)
    setStateType(s, 2)
    expect(getStateType(s)).toBe(2)
  })
})

describe('combined fields', () => {
  it('state type and refcount are independent', () => {
    const s = makeTarget()
    setRefCount(s, 5)
    setStateType(s, 3)
    expect(getRefCount(s)).toBe(5)
    expect(getStateType(s)).toBe(3)
  })

  it('updating state type does not affect refcount', () => {
    const s = makeTarget()
    setRefCount(s, 42)
    setStateType(s, 2)
    setStateType(s, 6 as StateType)
    expect(getRefCount(s)).toBe(42)
  })

  it('shrinking state type does not affect refcount', () => {
    const s = makeTarget()
    setRefCount(s, 42)
    setStateType(s, 6 as StateType)
    setStateType(s, 1 as StateType)
    expect(getStateType(s)).toBe(1)
    expect(getRefCount(s)).toBe(42)
  })

  it('updating refcount does not affect state type', () => {
    const s = makeTarget()
    setStateType(s, 4)
    setRefCount(s, 99)
    setRefCount(s, 200)
    expect(getStateType(s)).toBe(4)
  })
})
