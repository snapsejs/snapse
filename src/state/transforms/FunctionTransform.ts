import { Transform } from './Transform.js'
import { transforms } from './transforms.js'
import { LightState } from '@/state/stateInternals/LightState.js'

export class FunctionTransform<T extends unknown[] = unknown[]> extends Transform {
  constructor(
    source?: LightState,
    hookFunction?: (...args: T) => unknown,
    args?: T,
  ) {
    super(source, hookFunction as ((...args: unknown[]) => unknown))
    this.hookArgs = args
  }
}

transforms.FunctionTransform = FunctionTransform
