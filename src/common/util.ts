import type { StateType } from '@/state/types/types.js'
import { STATE_ARRAY, STATE_DOMOBJECT, STATE_FUNCTION, STATE_OBJECT, STATE_POJO, STATE_PRIMITIVE }
  from '@/state/stateInternals/internalFunctions.js'
import { NodeController } from '@/DOM/nodeControllers/NodeController.js'
import { isArray } from '@/common/shorthands.js'

export const isPOJO = (v: unknown): v is object => {
  return typeof v === 'object'
    && v !== null
    && Object.getPrototypeOf(v) === Object.prototype
}

export const classifyStateType = (v: unknown): StateType => {
  if (isArray(v)) return STATE_ARRAY
  if (v) {
    if (typeof v === 'object') {
      if (v instanceof NodeController) return STATE_DOMOBJECT
      return isPOJO(v) ? STATE_POJO : STATE_OBJECT
    }
    if (typeof v === 'function') return STATE_FUNCTION
  }
  return STATE_PRIMITIVE
}

export const camelToKebab = (s: string) => {
  return s.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
}
