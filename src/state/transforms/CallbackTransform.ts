import type { SubscribeCallback } from '../types/types.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { Transform } from './Transform.js'
import { destate } from '../state.js'
import { transforms } from './transforms.js'
import { queueFlush } from '@/state/stateInternals/notify.js'

const callbackQueue = new Set<CallbackTransform>()
let queuedInPriorityOrder = true
let lastQueuedPriority = -Infinity

export class CallbackTransform<T = unknown, U = unknown> extends Transform {
  declare srcLs: LightState<T>
  prio: number
  payload?: U

  constructor(source: LightState, callback: SubscribeCallback<T, U>,
    data?: U, priority?: number) {
    super(source, callback as () => unknown)
    this.payload = data
    this.prio = priority ?? 2 ** 29
  }

  static override flush() {
    const queue = callbackQueue.size > 1 ? Array.from(callbackQueue) : callbackQueue
    if (!queuedInPriorityOrder && queue !== callbackQueue) {
      (queue as CallbackTransform[]).sort((a, b) => a.prio - b.prio)
    }
    queuedInPriorityOrder = true
    lastQueuedPriority = -Infinity
    for (const transform of queue) {
      if (callbackQueue.delete(transform)) {
        try {
          transform.execute()
        } catch (e) {
          Transform.throwDelayed(e)
        }
      }
    }
  }

  override queue() {
    const sizeBefore = callbackQueue.size
    callbackQueue.add(this)
    if (callbackQueue.size !== sizeBefore) {
      if (this.prio < lastQueuedPriority) queuedInPriorityOrder = false
      else lastQueuedPriority = this.prio
    }
    queueFlush()
  }

  override dequeue() {
    callbackQueue.delete(this)
  }

  override execute() {
    return this.hookFunction!(destate(this.srcLs), this.payload)
  }
}

transforms.CallbackTransform = CallbackTransform
