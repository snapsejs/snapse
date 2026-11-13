import { DEV } from '@/common/dev.js'
import type { IState, InternalStateTarget, State } from '../types/types.js'
import type { Transform } from '../transforms/Transform.js'
import { getLightState } from '../state.js'
import { transforms } from '../transforms/transforms.js'
import { STATE_ARRAY, STATE_POJO, createVersion, internalFunctions, updateValue, upsertProperty }
  from './internalFunctions.js'
import { assertWritable, promoteMemberToStateLightState } from './stateUpdate.js'
import { getStateType } from '../common/refCountAndType.js'
import { classifyStateType } from '@/common/util.js'
import { connectTouchedState } from '@/state/transforms/Transform.js'
import { notify } from './notify.js'

export class LightState<T = unknown> {
  // raw value
  v: T
  // refCount and state type, packed
  rct: number
  // the last version where .v was guaranteed to have been updated
  ver: number
  // subscriptions to this state
  subs: Transform | Transform[] | Set<Transform> | undefined
  // sources for this state
  srcs: LightState | LightState[] | Set<LightState> | undefined
  // the transform that creates this state, undefined for primary states
  tf: Transform | undefined
  // link to the Proxy object for this state, if it exists
  prx: IState | undefined
  // abs(drt) is the latest version when a dirty check was made
  //   (drt < 0) means there were newer sources at that check
  drt: number

  constructor(value: T) {
    this.v = value
    this.rct = classifyStateType(value)
    this.subs = undefined
    this.srcs = undefined
    this.tf = undefined
    this.prx = undefined
    this.ver = createVersion()
    this.drt = 0
  }

  get<U>(_target: () => void, prop: PropertyKey, receiver: IState<T>): unknown {
    const stateType = getStateType(this)
    const ifns = internalFunctions[stateType]!
    const fn = ifns.get(prop)
    if (fn) return fn(this as InternalStateTarget, receiver as IState)
    const s = this.v as Record<PropertyKey, unknown>
    if (s == null) return undefined
    if (typeof prop === 'symbol') return s[prop]
    const sp = s[prop]
    const spLs = getLightState(sp)
    if (stateType !== STATE_POJO && typeof (spLs ? spLs.v : sp) === 'function') {
      return (...args: unknown[]) =>
        new transforms.ChainFunctionTransform(this, args, prop).execute() as State<U>
    }
    connectTouchedState(this)
    if (spLs?.prx || (stateType !== STATE_ARRAY && stateType !== STATE_POJO)) return sp
    if (!(prop in s)) return
    return promoteMemberToStateLightState(this, s, prop).prx
  }

  set(_target: () => void, prop: PropertyKey, value: unknown): boolean {
    assertWritable(this)
    const is = this.v as Record<PropertyKey, unknown>
    const ls = getLightState(is[prop])
    if (ls) {
      assertWritable(ls)
      return updateValue(ls, value)
    }
    const version = createVersion()
    upsertProperty(is, prop, value, version)
    this.ver = version
    notify(this)
    return true
  }

  getPrototypeOf(): object | null {
    const is = this.v
    return (is == null) ? null : Object.getPrototypeOf(is)
  }

  apply(_target: () => void, thisArg: object, argumentsList: unknown[]): unknown {
    return new transforms.FunctionTransform(
      this,
      this.prx as unknown as (...a: unknown[]) => unknown,
      argumentsList,
    ).execute()
  }

  getOwnPropertyDescriptor(_target: () => void, key: PropertyKey): PropertyDescriptor | undefined {
    const is = this.v
    return ((is && typeof is === 'object') || typeof is === 'function')
      ? Reflect.getOwnPropertyDescriptor(is, key)
      : undefined
  }

  deleteProperty(_target: () => void, prop: PropertyKey): boolean {
    assertWritable(this)
    if (getStateType(this) !== STATE_POJO) {
      // Covered by buildtest, undetected by vite coverage
      /* v8 ignore else */
      if (DEV) throw TypeError('Cannot delete state properties')
      /* v8 ignore next */
      throw TypeError(undefined)
    }
    const is = this.v as Record<PropertyKey, unknown>
    if (!(prop in is)) return true
    delete is[prop]
    this.ver = createVersion()
    notify(this)
    return true
  }

  ownKeys(): (string | symbol)[] {
    if (this.v == null) return []
    return Reflect.ownKeys(this.v)
  }
}

const reflect = Reflect as Record<string, Function>
const proto = LightState.prototype as unknown as Record<string, unknown>
for (const key of Object.getOwnPropertyNames(Reflect)) {
  proto[key] ??= function (this: LightState, _target: unknown, ...args: unknown[]) {
    return reflect[key]!(this.v, ...args)
  }
}
