import { LightState } from '@/state/stateInternals/LightState.js'
import { TRANSFORM_FLAG_REBUILDS_CHILDREN, Transform } from './Transform.js'
import { transforms } from './transforms.js'
import { isArray } from '@/common/shorthands.js'

export class ChainFunctionTransform extends Transform {
  declare protected srcLs: LightState
  private hookName: PropertyKey

  constructor(source: LightState, args: unknown[], name: PropertyKey) {
    super(source)
    this.hookArgs = args
    this.hookName = name
  }

  override execute() {
    const is = this.srcLs.v as Record<PropertyKey, ((a: unknown[]) => unknown)>
    const boundThis = isArray(is) ? this.srcLs.prx! : is
    this.hookFunction = is[this.hookName]!.bind(boundThis) as (...a: unknown[]) => unknown
    return super.execute()
  }
}

ChainFunctionTransform.prototype.flg = TRANSFORM_FLAG_REBUILDS_CHILDREN

transforms.ChainFunctionTransform = ChainFunctionTransform
