import type { AnyState, State } from '../types/types.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { peekVersion, refresh, updateValue } from '../stateInternals/stateUpdate.js'
import { CircularDependencyError, destate, getLightState, state } from '../state.js'
import { createPoisonedValue, isPoisoned } from '../stateInternals/poison.js'
import { getRefCount, setRefCount } from '../common/refCountAndType.js'
import { MAX_ARRAY_SIZE } from '../common/stateProperty.js'
import { queueFlush } from '@/state/stateInternals/notify.js'
import { transforms } from './transforms.js'
import { isArray } from '@/common/shorthands.js'

type TouchedCapture = { tfm: Transform, touchedStates: Set<LightState> }
const touchedStatesStack: TouchedCapture[] = []
let touchedStatesCaptureActive: TouchedCapture | undefined

const transformQueue = new Set<Transform>()

// Root controllers (e.g. SnapseRoot) self-bootstrap: unlike every other controller, nothing else is
//   guaranteed to create them, so they queue their own creation. But if one ends up placed inside a
//   reactive slot (e.g. an .opt() argument, or as a literal argument to another SnapseRoot call) it
//   will *also* get created by the normal tree cascade, which must win -- an already-placed root must
//   never fall back to self-bootstrapping. rootQueue is processed only after transformQueue is fully
//   drained (by which point any tree-cascade creation has already happened), and LIFO: a root queued
//   later was necessarily *constructed* later, and constructor argument evaluation order means an
//   outer `SnapseRoot(a, SnapseRoot(b))` is always constructed after the inner one -- so giving the
//   outer root first refusal lets its own creation cascade reach and claim the inner root before the
//   inner root gets a chance to self-bootstrap standalone.
const rootQueue: Transform[] = []
export const queueRoot = (transform: Transform) => {
  rootQueue.push(transform)
  queueFlush()
}

const setPool: Set<LightState>[] = []
export const acquireSet = (): Set<LightState> => setPool.pop() ?? new Set<LightState>()

export const releaseSet = (s: Set<LightState>) => {
  s.clear()
  setPool.push(s)
}

const capturePool: TouchedCapture[] = []
const acquireCapture = (transform: Transform, sources: Set<LightState>): TouchedCapture => {
  const c = capturePool.pop()
  if (!c) return { tfm: transform, touchedStates: sources }
  c.tfm = transform
  c.touchedStates = sources
  return c
}
const releaseCapture = (c: TouchedCapture) => capturePool.push(c)

// Whether the transform creates an internal LightState, rather than an external Proxy state
export const TRANSFORM_FLAG_CREATE_LIGHT_STATE = 1
// Whether the transform will never reuse its children
export const TRANSFORM_FLAG_REBUILDS_CHILDREN = 2

const PENDING_VERSION = -1

let runSeq = 0
export const nextRunId = () => ++runSeq
// The run of the innermost transform currently running, 0 outside any transform
export const currentRunId = () => touchedStatesCaptureActive?.tfm.runId ?? 0

export class Transform {
  protected tgt?: LightState
  protected srcLs?: LightState
  declare flg: number
  // Id of the latest run
  declare runId: number

  protected hookFunction?: (...args: unknown[]) => unknown
  protected hookArgs?: unknown[]

  constructor(source?: LightState, hook?: (...args: unknown[]) => unknown) {
    this.srcLs = source
    this.hookFunction = hook
  }

  private static isDirty(target: LightState): boolean {
    const epoch = peekVersion()
    if (target.drt === epoch) return false
    if (target.drt === -epoch) return true
    const store = target.srcs
    let dirty = false
    if (store) {
      if (store instanceof LightState) {
        dirty = Transform.sourceIsDirty(store, target)
      } else {
        for (const s of store) {
          if (Transform.sourceIsDirty(s, target)) {
            dirty = true
            break
          }
        }
      }
    }
    target.drt = dirty ? -epoch : epoch
    return dirty
  }

  private static sourceIsDirty(s: LightState, target: LightState): boolean {
    return s !== target && (s.ver > target.ver || Transform.isDirty(s))
  }

  static throwDelayed(e: unknown) {
    queueMicrotask(() => {
      throw e
    })
  }

  static flush() {
    do {
      for (const transform of transformQueue) {
        try {
          transform.execute()
        } catch (e) {
          Transform.throwDelayed(e)
        }
      }
      transformQueue.clear()
      while (rootQueue.length) rootQueue.pop()!.execute()
    } while (transformQueue.size)
  }

  queue(_target?: LightState) {
    transformQueue.add(this)
    queueFlush()
  }

  dequeue() {
    transformQueue.delete(this)
  }

  subTo(state: LightState) {
    const store = state.subs
    const rc = getRefCount(state)
    setRefCount(state, rc + 1)
    if (rc === 0) state.tf?.subscribeSources(state)
    if (store) {
      if (store instanceof Transform) {
        state.subs = [store, this]
      } else if (isArray(store)) {
        if (store.length < MAX_ARRAY_SIZE) {
          store.push(this)
        } else {
          const set = new Set(store)
          set.add(this)
          state.subs = set
        }
      } else {
        (store as Set<Transform>).add(this)
      }
    } else state.subs = this
  }

  subscribeSources(state: LightState) {
    const store = state.srcs
    if (store) {
      if (store instanceof LightState) {
        this.subTo(store)
      } else {
        for (const source of store) this.subTo(source)
      }
    }
    refresh(state)
  }

  uns(state: LightState) {
    this.dequeue()
    const subscriptions = state.subs
    if (subscriptions === this) state.subs = undefined
    else if (isArray(subscriptions)) subscriptions.splice(subscriptions.indexOf(this), 1)
    else (subscriptions as Set<Transform>).delete(this)
    const rc = getRefCount(state) - 1
    setRefCount(state, rc)
    if (rc === 0) state.tf?.unsubscribeSources(state)
  }

  unsubscribeSources(state: LightState) {
    const store = state.srcs
    if (!store) return
    if (store instanceof LightState) {
      this.uns(store)
    } else {
      for (const source of store) this.uns(source)
    }
  }

  // refresh
  rfr() {
    if (
      this.tgt && this.tgt.ver !== PENDING_VERSION
      && Transform.isDirty(this.tgt)
    ) {
      this.execute()
    }
  }

  execute(): unknown {
    // A first run may be given the id of the run that created this transform (see MapArrayTransform)
    if (this.tgt || !this.runId) this.runId = nextRunId()
    touchedStatesCaptureActive && touchedStatesStack.push(touchedStatesCaptureActive)
    const sources = acquireSet()
    if (this.srcLs) sources.add(this.srcLs)
    const capture = acquireCapture(this, sources)
    touchedStatesCaptureActive = capture
    if (this.tgt) this.tgt.ver = PENDING_VERSION
    let value: unknown
    const hf = destate(this.hookFunction)
    try {
      value = this.hookArgs ? hf!(...this.hookArgs) : hf!()
    } catch (e) {
      value = createPoisonedValue(e)
    } finally {
      touchedStatesCaptureActive = touchedStatesStack.pop()
      releaseCapture(capture)
    }
    if (!sources.size && !this.tgt && !isPoisoned(value)) {
      releaseSet(sources)
      return value
    }
    const ls = getLightState(value)
    if (ls && !sources.has(ls)) {
      if (ls.ver === PENDING_VERSION) {
        value = createPoisonedValue(new CircularDependencyError())
      } else if (!this.tgt && this instanceof transforms.MapValueTransform
        && this.hasOnlyPassthroughSource(sources)) {
        refresh(ls)
        releaseSet(sources)
        return value
      } else {
        refresh(ls)
        sources.add(ls)
      }
    }
    const result = this.updateTarget(value, sources)
    releaseSet(sources)
    return result
  }

  private hasOnlyPassthroughSource(sources: Set<LightState>): boolean {
    return !!(sources.size === 1 && this.hookArgs
      && sources.has(getLightState(this.hookArgs[0]) as unknown as LightState))
  }

  protected updateTarget<T>(newValue: T | State<T>, newSources: Set<LightState>): AnyState<T> {
    if (this.tgt) {
      updateValue(this.tgt, newValue, peekVersion())
    } else {
      this.tgt = new LightState(destate(newValue))
      this.tgt.tf = this
    }

    const store = this.tgt!.srcs
    // An unchanged single source needs neither subscription changes nor a new record
    const sourcesUnchanged = newSources.size === 1 && store instanceof LightState && newSources.has(store)
    if (!sourcesUnchanged) {
      if (getRefCount(this.tgt!)) {
        for (const source of newSources) {
          const subscribed = isArray(store)
            ? store.includes(source)
            : store instanceof Set
              ? store.has(source)
              : store === source
          if (!subscribed) this.subTo(source)
        }
        if (store instanceof LightState) {
          if (!newSources.has(store)) this.uns(store)
        } else {
          for (const source of store!) {
            if (!newSources.has(source)) this.uns(source)
          }
        }
      }
      const target = this.tgt!
      if (newSources.size === 0) target.srcs = undefined
      else if (newSources.size === 1) [target.srcs] = newSources
      else if (newSources.size <= MAX_ARRAY_SIZE) target.srcs = [...newSources]
      else target.srcs = new Set(newSources)
    }
    return (this.flg & TRANSFORM_FLAG_CREATE_LIGHT_STATE
      ? this.tgt!
      : state(this.tgt)) as AnyState<T>
  }

  static connect(target: LightState) {
    if (touchedStatesCaptureActive) {
      if (target.ver === PENDING_VERSION) throw new CircularDependencyError()
      touchedStatesCaptureActive.touchedStates.add(target)
      if (touchedStatesCaptureActive.tfm.tgt) {
        const c = touchedStatesCaptureActive
        touchedStatesCaptureActive = undefined
        refresh(target)
        touchedStatesCaptureActive = c
      }
    }
  }
}

export const connectTouchedState = (target: LightState) => Transform.connect(target)

Transform.prototype.flg = 0
Transform.prototype.runId = 0

// The .tf of a state created when reading a member of a transform's output: it makes the member
//   read-only, while that transform's own recompute still updates it in place
export const DERIVED_MEMBER = new Transform()

transforms.Transform = Transform
