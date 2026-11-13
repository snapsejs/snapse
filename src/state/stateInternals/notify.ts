import type { State } from '@/state/types/types.js'
import { getLightState } from '@/state/state.js'
import { refresh } from './stateUpdate.js'
import { transforms } from '@/state/transforms/transforms.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { Transform } from '@/state/transforms/Transform.js'
import { isArray } from '@/common/shorthands.js'

type ActiveTimeout = ReturnType<typeof setTimeout> | undefined

let flushTimeout: ActiveTimeout | true

// Workaround for circular dependency
let flushPendingWork: (() => void) | undefined
export const registerFlushPendingWork = (fn: () => void) => {
  flushPendingWork = fn
}

export const queueFlush = () => flushTimeout ??= setTimeout(flush, 0)

export const fastFlush = (f: EventListener, e: Event) => {
  flushTimeout = true
  try {
    f(e)
    transforms.Transform.flush()
  } finally {
    flushTimeout = undefined
  }
  transforms.CallbackTransform.flush()
  flushPendingWork!()
}

export const flush = (s?: State) => {
  clearTimeout(flushTimeout as ActiveTimeout)
  flushTimeout = undefined
  const ls = getLightState(s)
  if (ls) {
    refresh(ls)
  } else {
    transforms.Transform.flush()
    transforms.CallbackTransform.flush()
    flushPendingWork!()
  }
}

export const notify = (target: LightState) => {
  const store = target.subs
  if (!store) return
  if (store instanceof Transform) {
    const tf = store as Transform
    tf.queue(target)
  } else if (isArray(store)) {
    for (let i = 0; i < store.length; i++) store[i]!.queue(target)
  } else {
    for (const s of store as Set<Transform>) s.queue(target)
  }
}
