import { describe, expect, it } from 'vitest'
import { camelToKebab, classifyStateType, isPOJO } from './util.js'
import { div } from '@/DOM.js'
import { STATE_ARRAY, STATE_DOMOBJECT, STATE_FUNCTION, STATE_OBJECT, STATE_POJO, STATE_PRIMITIVE }
  from '@/state/stateInternals/internalFunctions.js'

describe('isPOJO', () => {
  it('should identify plain objects', () => {
    expect(isPOJO({})).toBe(true)
    expect(isPOJO({ a: 1 })).toBe(true)
    expect(isPOJO(new Object())).toBe(true)
  })

  it('should identify things that are not plain objects', () => {
    expect(isPOJO(undefined)).toBe(false)
    expect(isPOJO(true)).toBe(false)
    expect(isPOJO(0)).toBe(false)
    expect(isPOJO(1)).toBe(false)
    expect(isPOJO('')).toBe(false)
    expect(isPOJO('object')).toBe(false)
    expect(isPOJO([])).toBe(false)
    expect(isPOJO([1, 2])).toBe(false)
    expect(isPOJO(Date)).toBe(false)
    expect(isPOJO(new Date())).toBe(false)
    expect(isPOJO(Symbol('object'))).toBe(false)
    expect(isPOJO(Math)).toBe(true)
    expect(isPOJO(() => Object)).toBe(false)
  })
})

describe('classifyStateType', () => {
  it('should identify state types correctly', () => {
    expect(classifyStateType(0)).toBe(STATE_PRIMITIVE)
    expect(classifyStateType(null)).toBe(STATE_PRIMITIVE)
    expect(classifyStateType(undefined)).toBe(STATE_PRIMITIVE)
    expect(classifyStateType('s')).toBe(STATE_PRIMITIVE)
    expect(classifyStateType(false)).toBe(STATE_PRIMITIVE)
    expect(classifyStateType(true)).toBe(STATE_PRIMITIVE)
    expect(classifyStateType(-42)).toBe(STATE_PRIMITIVE)

    expect(classifyStateType([])).toBe(STATE_ARRAY)
    expect(classifyStateType([2])).toBe(STATE_ARRAY)

    expect(classifyStateType({})).toBe(STATE_POJO)
    expect(classifyStateType(Math)).toBe(STATE_POJO)

    expect(classifyStateType(() => 'sill')).toBe(STATE_FUNCTION)

    expect(classifyStateType(div('ko'))).toBe(STATE_DOMOBJECT)
    expect(classifyStateType(new Date())).toBe(STATE_OBJECT)
  })
})

describe('camelToKebab', () => {
  it('should convert camelCase to kebab-case', () => {
    expect(camelToKebab('backgroundColor')).toBe('background-color')
    expect(camelToKebab('fontSize')).toBe('font-size')
    expect(camelToKebab('borderTopLeftRadius')).toBe('border-top-left-radius')
    expect(camelToKebab('simpletest')).toBe('simpletest')
    expect(camelToKebab('AStringWithCAPS')).toBe('-a-string-with-c-a-p-s')
  })
})
