import { getLightState, lightState, state } from '@/state/state.js'
import { Transform } from './Transform.js'
import { transforms } from './transforms.js'
import { refresh, updateValue } from '../stateInternals/stateUpdate.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { isArray } from '@/common/shorthands.js'

type Targets = LightState | LightState[]

class IsTargetTransform extends Transform {
  constructor(readonly owner: IsTransform, private targetLs: LightState,
    public keyVal: unknown, readonly cmpLs: LightState | undefined) {
    super()
  }

  override subTo(ls: LightState) {
    this.owner.subTo(ls)
  }

  override uns(ls: LightState) {
    this.owner.uns(ls)
  }

  override rfr() {
    this.owner.refreshTarget(this.targetLs)
  }
}

const targetTransform = (target: LightState) => target.tf as IsTargetTransform

const includes = (targets: Targets | undefined, target: LightState) =>
  targets === target || (isArray(targets) && targets.includes(target))

export class IsTransform extends Transform {
  declare protected srcLs: LightState
  private compared = new Map<unknown, Targets>()
  private sourceToKey = new Map<LightState, unknown>()
  private oldReference: unknown
  private sourceRefCount = 0
  private queued = [] as LightState[]
  private static instances = new WeakMap<LightState, IsTransform>()

  static for(reference: LightState): IsTransform {
    return IsTransform.instances.get(reference) ?? new IsTransform(reference)
  }

  constructor(reference: LightState) {
    super(reference)
    this.oldReference = reference.v
    IsTransform.instances.set(reference, this)
  }

  refreshTarget(target: LightState) {
    refresh(this.srcLs)
    const tf = targetTransform(target)
    if (tf.cmpLs) refresh(tf.cmpLs)
    if (target.ver >= this.srcLs.ver && (!tf.cmpLs || target.ver >= tf.cmpLs.ver)) return
    // A comparand that changed while nothing was subscribed was not queued, so its key is stale
    if (tf.cmpLs && !Object.is(tf.keyVal, tf.cmpLs.v)) this.rekeyCompared(target, tf.cmpLs.v)
    updateValue(target, Object.is(tf.keyVal, this.srcLs.v))
  }

  private rekeyCompared(target: LightState, key: unknown) {
    const tf = targetTransform(target)
    const targets = this.compared.get(tf.keyVal)
    const registered = includes(targets, target)
    if (isArray(targets) && registered) this.removeCompared(tf.keyVal, targets, targets.indexOf(target))
    else if (registered) this.compared.delete(tf.keyVal)
    if (registered) {
      this.addCompared(key, target, tf.cmpLs)
    } else {
      tf.keyVal = key
      this.sourceToKey.set(tf.cmpLs!, key)
    }
  }

  override execute() {
    const reference = this.srcLs.v
    while (this.queued.length) {
      this.updateComparedState(this.queued.pop()!, reference)
    }
    if (reference === this.oldReference) return
    for (const ref of [this.oldReference, reference]) {
      const targets = this.compared.get(ref)
      if (!targets) continue
      const value = Object.is(ref, reference)
      if (isArray(targets)) {
        for (const result of targets) updateValue(result, value, this.srcLs.ver)
      } else {
        updateValue(targets, value, this.srcLs.ver)
      }
    }
    this.oldReference = reference
  }

  updateComparedState(ls: LightState, reference: unknown) {
    const target = this.popComparedState(ls)
    this.addCompared(ls.v, target, ls)
    updateValue(target, Object.is(ls.v, reference), ls.ver)
  }

  popComparedState(ls: LightState) {
    const old = this.sourceToKey.get(ls)
    const targets = this.compared.get(old)!
    if (!isArray(targets)) {
      this.compared.delete(old)
      return targets
    }
    const i = targets.findIndex(rls => targetTransform(rls).cmpLs === ls)
    const target = targets[i]!
    this.removeCompared(old, targets, i)
    return target
  }

  private removeCompared(key: unknown, targets: LightState[], i: number) {
    targets.splice(i, 1)
    if (targets.length === 1) this.compared.set(key, targets[0]!)
  }

  override queue(target?: LightState) {
    if (target && target !== this.srcLs) this.queued.push(target)
    super.queue()
  }

  private isOwnTarget(ls: LightState) {
    return ls.tf instanceof IsTargetTransform && ls.tf.owner === this
  }

  override subTo(ls: LightState) {
    if (this.sourceToKey.has(ls)) return super.subTo(ls)
    const key = targetTransform(ls).keyVal
    if (!includes(this.compared.get(key), ls)) {
      this.addCompared(key, ls)
      updateValue(ls, Object.is(key, this.srcLs.v))
    }
    if (++this.sourceRefCount === 1) super.subTo(this.srcLs)
  }

  override uns(state: LightState) {
    if (!this.isOwnTarget(state)) return super.uns(state)
    const key = targetTransform(state).keyVal
    const targets = this.compared.get(key)!
    if (isArray(targets)) this.removeCompared(key, targets, targets.indexOf(state))
    else this.compared.delete(key)
    if (--this.sourceRefCount === 0) super.uns(this.srcLs)
  }

  addCompared(comparedValue: unknown, target: LightState, comparedState?: LightState) {
    if (comparedState) this.sourceToKey.set(comparedState, comparedValue)
    targetTransform(target).keyVal = comparedValue
    const targets = this.compared.get(comparedValue)
    if (!targets) this.compared.set(comparedValue, target)
    else if (isArray(targets)) targets.push(target)
    else this.compared.set(comparedValue, [targets, target])
  }

  new(compared: unknown) {
    const reference = this.srcLs.v
    const ls = getLightState(compared)
    const comparedValue = ls?.v ?? compared
    const target = lightState(Object.is(comparedValue, reference))
    target.tf = new IsTargetTransform(this, target, comparedValue, ls)
    target.srcs = ls ? [target, ls] : target
    this.addCompared(comparedValue, target, ls)
    return state(target)
  }
}

transforms.IsTransform = IsTransform
