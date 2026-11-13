import { TRANSFORM_FLAG_REBUILDS_CHILDREN, Transform } from './Transform.js'
import { transforms } from './transforms.js'

export class ComputeTransform<T = unknown> extends Transform {
  constructor(computeFunction: () => T) {
    super()
    this.hookFunction = computeFunction
  }
}

ComputeTransform.prototype.flg = TRANSFORM_FLAG_REBUILDS_CHILDREN

transforms.ComputeTransform = ComputeTransform
