import { Transform } from './Transform.js'
import { transforms } from './transforms.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { updateValue } from '../stateInternals/stateUpdate.js'
import { createPoisonedValue } from '../stateInternals/poison.js'

export class PromiseTransform<T = unknown> extends Transform {
  constructor(promise: Promise<T>) {
    super()
    this.tgt = new LightState<T | undefined>(undefined)
    promise.then(
      (v: T) => {
        updateValue(this.tgt!, v)
      },
      (cause: unknown) => {
        updateValue(this.tgt!, createPoisonedValue(cause) as T)
      },
    )
  }

  override execute() {
    return this.tgt
  }
}

transforms.PromiseTransform = PromiseTransform
