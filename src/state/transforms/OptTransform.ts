import type { OptOption } from '../types/types.js'
import { Transform, acquireSet, releaseSet } from './Transform.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { destate, getLightState } from '../state.js'
import { isPOJO } from '@/common/util.js'
import { refresh } from '../stateInternals/stateUpdate.js'
import { transforms } from './transforms.js'
import { isArray } from '@/common/shorthands.js'

export class OptTransform<T = unknown> extends Transform {
  declare protected srcLs: LightState
  private opt: OptOption<T>
  private def?: unknown

  constructor(selector: LightState, options: OptOption<T>, def?: unknown) {
    super(selector)
    this.opt = options
    this.def = def
  }

  override execute() {
    refresh(this.srcLs)
    const dselector = this.srcLs.v
    let value
    if ((typeof dselector === 'number' && isArray(destate(this.opt)))
      || isPOJO(destate(this.opt))) {
      value = (dselector as PropertyKey) in (this.opt as Record<PropertyKey, T>)
        ? (this.opt as Record<PropertyKey, unknown>)[dselector as PropertyKey]
        : this.def
    } else if (isArray(dselector) ? dselector.length > 0 : dselector) {
      value = this.opt
    } else {
      value = this.def
    }
    const sources = acquireSet()
    sources.add(this.srcLs)
    const ls = getLightState(value)
    if (ls) {
      sources.add(ls)
      refresh(ls)
    }
    const result = this.updateTarget(value, sources)
    releaseSet(sources)
    return result
  }
}

transforms.OptTransform = OptTransform
