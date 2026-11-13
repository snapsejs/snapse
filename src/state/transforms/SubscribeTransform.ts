import { TRANSFORM_FLAG_CREATE_LIGHT_STATE, Transform, acquireSet, releaseSet } from './Transform.js'
import { transforms } from './transforms.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { getStateType } from '@/state/common/refCountAndType.js'
import { STATE_ARRAY, STATE_POJO } from '@/state/stateInternals/internalFunctions.js'
import { promoteMemberToStateLightState } from '@/state/stateInternals/stateUpdate.js'
import { getLightState } from '@/state/state.js'

export const getSubState = (owner: LightState, prop: PropertyKey): LightState | undefined => {
  const container = owner.v as Record<PropertyKey, unknown>
  const ls = getLightState(container[prop])
  if (ls) return ls
  if (!(prop in container)) return undefined
  return promoteMemberToStateLightState(owner, container, prop)
}

export class SubscribeTransform extends Transform {
  declare protected srcLs: LightState
  private static instances = new WeakMap<LightState, SubscribeTransform>()
  private pendingSelf = false
  private seq = 0

  static for(ls: LightState): LightState | undefined {
    return (SubscribeTransform.instances.get(ls) ?? new SubscribeTransform(ls)).tgt
  }

  private constructor(source: LightState) {
    super(source)
    SubscribeTransform.instances.set(source, this)
    this.execute()
  }

  override queue(target?: LightState) {
    if (target === this.srcLs) this.pendingSelf = true
    super.queue(target)
  }

  override execute() {
    const sources = acquireSet()
    if (this.pendingSelf || !this.tgt) {
      this.pendingSelf = false
      sources.add(this.srcLs)
      const stateType = getStateType(this.srcLs)
      if (stateType === STATE_ARRAY || stateType === STATE_POJO) {
        const parent = this.srcLs.v as Record<PropertyKey, unknown>
        for (const key of Object.keys(parent)) {
          const childLs = getSubState(this.srcLs, key)
          if (!childLs) continue
          const childType = getStateType(childLs)
          const nestedLs = (childType === STATE_ARRAY || childType === STATE_POJO)
            && SubscribeTransform.for(childLs)
          sources.add(nestedLs || childLs)
        }
      }
    } else {
      const store = this.tgt.srcs as Array<LightState>
      for (const s of store) sources.add(s)
    }
    this.updateTarget(this.seq++, sources)
    releaseSet(sources)
  }
}

SubscribeTransform.prototype.flg = TRANSFORM_FLAG_CREATE_LIGHT_STATE
transforms.SubscribeTransform = SubscribeTransform
