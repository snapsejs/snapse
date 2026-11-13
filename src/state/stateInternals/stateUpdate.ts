import { DEV } from '@/common/dev.js'
import type { Version } from '@/state/types/types.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { setStateType } from '@/state/common/refCountAndType.js'
import { DERIVED_MEMBER } from '@/state/transforms/Transform.js'
import { classifyStateType, isPOJO } from '@/common/util.js'
import { notify } from './notify.js'
import { createStateLightState, destate, getLightState, isState } from '@/state/state.js'
import { isPoisoned } from './poison.js'

let latestVersion = 0
export const createVersion = () => ++latestVersion
export const peekVersion = () => latestVersion

export const assertWritable = (ls: LightState) => {
  if (!ls.tf) return
  // Covered by buildtest, undetected by vite coverage
  /* v8 ignore else */
  if (DEV) throw TypeError('Chained state is read-only')
  /* v8 ignore next */
  throw TypeError(undefined)
}

export const promoteMemberToStateLightState = (
  owner: LightState, container: Record<PropertyKey, unknown>, prop: PropertyKey,
): LightState => {
  const ls = createStateLightState(container[prop])
  if (owner.tf) ls.tf ??= DERIVED_MEMBER
  container[prop] = ls.prx
  return ls
}

export const upsertProperty = (
  container: Record<PropertyKey, unknown>, key: PropertyKey, subValue: unknown, version: Version,
  byOwner = false,
) => {
  if (!(key in container)) {
    container[key] = subValue
    return
  }
  const old = container[key]
  const lss = getLightState(old)
  // A transform's output that holds a state selects it, rather than supplying a value for the old one.
  //   Only a member the transform created itself is updated in place.
  if (byOwner && (isState(subValue) || (lss && lss.tf !== DERIVED_MEMBER))) {
    if (getLightState(subValue) !== lss) container[key] = subValue
    return
  }
  if (lss) {
    if (!byOwner) assertWritable(lss)
    return updateValue(lss, subValue, version, byOwner)
  }
  const dSubValue = destate(subValue)
  if (isPOJO(old) && isPOJO(dSubValue)) {
    upsertPojo(old as Record<string, unknown>, dSubValue as Record<string, unknown>, version, byOwner)
  } else {
    container[key] = dSubValue
  }
}

const upsertPojo = (
  oldPojo: Record<string, unknown>, newValue: Record<string, unknown>, version: Version, byOwner: boolean,
) => {
  for (const [key, sv] of Object.entries(newValue)) {
    upsertProperty(oldPojo, key, byOwner ? sv : destate(sv), version, byOwner)
  }
}

export const updateValue = <T>(ls: LightState<T>, v: T, version?: Version, byOwner = !!ls.tf) => {
  version = version ?? ++latestVersion
  ls.tf?.dequeue()
  const newValue = destate(v)
  const oldValue = ls.v
  ls.ver = version
  ls.drt = version
  if (newValue === oldValue) {
    return true
  }
  if (isPOJO(oldValue) && isPOJO(newValue) && !isPoisoned(newValue)) {
  // if (isPOJO(oldValue) && !isPoisoned(newValue) && isPOJO(newValue)) {
    upsertPojo(oldValue as Record<string, unknown>, newValue as Record<string, unknown>, version, byOwner)
  } else {
    ls.v = newValue
  }
  const newType = classifyStateType(newValue)
  setStateType(ls, newType)
  notify(ls)
  return true
}

export const refresh = <T>(ls: LightState<T>) => ls.tf?.rfr()
