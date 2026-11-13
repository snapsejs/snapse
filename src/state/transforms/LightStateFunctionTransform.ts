import { FunctionTransform } from './FunctionTransform.js'
import { TRANSFORM_FLAG_CREATE_LIGHT_STATE, TRANSFORM_FLAG_REBUILDS_CHILDREN } from './Transform.js'
import { transforms } from './transforms.js'

export class LightStateFunctionTransform<T extends unknown[] = unknown[]> extends FunctionTransform<T> {
}

LightStateFunctionTransform.prototype.flg
  = TRANSFORM_FLAG_CREATE_LIGHT_STATE | TRANSFORM_FLAG_REBUILDS_CHILDREN

transforms.LightStateFunctionTransform = LightStateFunctionTransform
