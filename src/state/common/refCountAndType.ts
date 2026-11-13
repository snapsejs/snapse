import type { StateType } from '@/state/types/types.js'
import { LightState } from '@/state/stateInternals/LightState.js'

const STATE_TYPE_BITS = 3
const STATE_TYPE_MASK = (2 ** STATE_TYPE_BITS) - 1
const PROMOTED_ELEMENT_FLAG = 2 ** STATE_TYPE_BITS
const REFCOUNT_SHIFT = STATE_TYPE_BITS + 1
const NON_REFCOUNT_MASK = STATE_TYPE_MASK | PROMOTED_ELEMENT_FLAG

export const getStateType = (s: LightState): StateType => (s.rct & STATE_TYPE_MASK) as StateType
export const setStateType = (s: LightState, stateType: StateType) =>
  s.rct = (s.rct & ~STATE_TYPE_MASK) | stateType

export const getRefCount = (s: LightState): number => s.rct >>> REFCOUNT_SHIFT
export const setRefCount = (s: LightState, refCount: number) =>
  s.rct = (s.rct & NON_REFCOUNT_MASK) | (refCount << REFCOUNT_SHIFT)

// A state created internally to make a rendered array element reactive, owned by that array
export const isPromotedElement = (s: LightState): boolean => !!(s.rct & PROMOTED_ELEMENT_FLAG)
export const markPromotedElement = (s: LightState) => s.rct |= PROMOTED_ELEMENT_FLAG
