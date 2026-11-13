import { STATE_ARRAY, STATE_DOMOBJECT, STATE_FUNCTION, STATE_OBJECT, STATE_POJO, STATE_PRIMITIVE }
  from '@/state/stateInternals/internalFunctions.js'
import type { State } from './stateTypes.js'
export type {
  PrimitiveState, FunctionState, ArrayState, ObjectState, OptType, State, PrimitiveStateMethods,
  ValueOfState, MaybeState, ObjectStateOf, SomeState,
} from './stateTypes.js'

import { LightState } from '../stateInternals/LightState.js'

export type SubscribeCallback<Value = unknown, Data = unknown> = (n: Value, s?: Data) => void
export type SubscribeOptions = { deep?: boolean }
export type ChangeRecord = {
  path?: (string | number)[]
  value?: unknown
  oldValue?: unknown
  done?: boolean
  reorder?: boolean
  remove?: number[]
  add?: number[]
  common?: number[]
  prefixL?: number
  suffixL?: number
  addedValues?: unknown[]
  removedValues?: unknown[]
}

export type Version = number
export type OptOption<T = unknown> = T | T[] | Record<string, T>
export type MapFunction = (value: unknown, index: number, array: unknown[]) => unknown

export type InternalStateTarget<T = unknown> = LightState<T & Record<PropertyKey, unknown>>

export type InternalFunction<T = unknown>
  = (target: InternalStateTarget<T>, receiver: IState<T>) => unknown
export type InternalFunctionMap = Map<PropertyKey, InternalFunction>

export type IState<T = unknown> = {
  [Symbol.toPrimitive]: (...args: unknown[]) => unknown
  toString: () => string
  valueOf: () => T
} & State<T>

export type AnyState<T = unknown> = LightState<T> | IState<T>

export type StateType = typeof STATE_PRIMITIVE | typeof STATE_ARRAY | typeof STATE_POJO
  | typeof STATE_FUNCTION | typeof STATE_OBJECT | typeof STATE_DOMOBJECT
