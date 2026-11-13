import { DEV } from '@/common/dev.js'
import type {
  AnyState, ArrayState, FunctionState, IState, ObjectState,
  PrimitiveState, State, SubscribeCallback, SubscribeOptions, ValueOfState,
} from './types/types.js'
import { transforms } from './transforms/transforms.js'
import { LightState } from './stateInternals/LightState.js'
import { type Transform, connectTouchedState } from '@/state/transforms/Transform.js'

export class CircularDependencyError extends Error {
  constructor() {
    super('circular dependency')
  }
}

const stateRegistry = new WeakMap<object, LightState>()

export const isState = <T = State>(value: unknown): value is T => {
  return typeof value === 'function' && stateRegistry.has(value)
}

// Unlike a proxy state, a LightState is never a function. Testing that first keeps instanceof from
//   running a proxy's getPrototypeOf trap.
export const isLightState = <T>(value: unknown): value is LightState<T> => {
  return typeof value !== 'function' && value instanceof LightState
}

export const isAnyState = <T>(value: unknown): value is AnyState<T> => {
  return typeof value === 'function' ? stateRegistry.has(value) : value instanceof LightState
}

// Subscribes the transform that _createSubscription_ makes for _state_ to the target it returns. The
//   unsubscribe function is also run when an enclosing component is removed.
export const subscribeWith = (
  state: unknown, createSubscription: (ls: LightState) => [target: LightState, transform: Transform],
) => {
  if (activeSubscriptions === null) {
    // Covered by buildtest, undetected by vite coverage
    /* v8 ignore else */
    if (DEV) throw Error('Cannot call subscribe after await in async function')
    /* v8 ignore next */
    throw Error(undefined)
  }
  const [target, transform] = createSubscription(stateRegistry.get(state as State)!)
  transform.subTo(target)
  let subscribed: LightState | undefined = target
  const unsubscribe = () => {
    subscribed && transform.uns(subscribed)
    subscribed = undefined
  }
  activeSubscriptions?.add(unsubscribe)
  return unsubscribe
}

export const subscribe = <S>(
  state: S,
  callback: SubscribeCallback<NoInfer<ValueOfState<S>>> = () => 0,
  options?: SubscribeOptions,
): () => void => subscribeWith(state, ls => [
  options?.['deep'] ? transforms.SubscribeTransform.for(ls)! : ls,
  new transforms.CallbackTransform<ValueOfState<S>>(ls, callback as SubscribeCallback),
])

export function findState<T>(name: string | symbol, def?: State<T>): State<T>
// Lets `T` be given explicitly as an already-`State<X>` type (e.g. a named alias used to
// annotate the intended shape upfront): `def`, if given, then only needs to be the raw `X`
// rather than something that already has State's methods - see `StateCreatorType` above.
export function findState<S extends ObjectState<unknown> | ArrayState<unknown>
  | PrimitiveState<unknown> | FunctionState<unknown>>(
  name: string | symbol, def?: ValueOfState<S>,
): S
export function findState<T>(name: string | symbol, def?: State<T>): State<T> {
  if (!activeExistingNamedStates || !(name in activeExistingNamedStates)) {
    if (arguments.length > 1) return def as State<T>
    // Covered by buildtest, undetected by vite coverage
    /* v8 ignore else */
    if (DEV) throw Error('State not found')
    /* v8 ignore next */
    throw Error(undefined)
  }
  return activeExistingNamedStates[name] as State<T>
}

export const lightState = <T>(value: T): LightState<T> => new LightState(value)

// Inert dummy
/* v8 ignore next */
const staticTarget = () => {}

export type StateCreatorType = {
  <T>(value: T, name?: PropertyKey): State<T>
  // Lets `T` be given explicitly as an already-`State<X>` type (e.g. a named alias used to
  // annotate the intended shape upfront): the value then only needs to be the raw `X`, and the
  // result is that same `State<X>`, rather than requiring a value that already has State's methods.
  <S extends ObjectState<unknown> | ArrayState<unknown> | PrimitiveState<unknown> | FunctionState<unknown>>(
    value: ValueOfState<S>, name?: PropertyKey
  ): S
}

export const state: StateCreatorType = <T>(value: T, name?: PropertyKey): State<T> => {
  if (name && !activeNewNamedStates) {
    // Covered by buildtest, undetected by vite coverage
    /* v8 ignore else */
    if (DEV) throw Error('Cannot define named state after await in async function')
    /* v8 ignore next */
    throw Error(undefined)
  }
  const newState = createStateLightState(value).prx as State<T>
  if (name) activeNewNamedStates!.set(name, newState as State)
  return newState
}

// Returns the LightState of a state for _value_, whose single proxy state is .state
export const createStateLightState = <T>(value: T): LightState<T> => {
  const ls = isLightState<T>(value)
    ? value
    : value instanceof Promise
      ? new transforms.PromiseTransform(value).execute()! as LightState<T>
      : new LightState((getLightState(value)?.v ?? value) as T)
  if (ls.prx) return ls
  const newState = new Proxy(staticTarget, ls) as State<T>
  ls.prx = newState as IState
  stateRegistry.set(newState, ls)
  return ls
}

export type PeekType = {
  <T>(value: ObjectState<T>): T
  <T>(value: PrimitiveState<T>): T
  <T>(value: FunctionState<T>): T
  <T>(value: ArrayState<T>): T[]
  <T>(value: State<T>): T
  <T>(value: LightState<T>): T
  <T>(value: T): T
}

export const peek: PeekType = <T>(value: T) => {
  const ls = getLightState(value)
  if (!ls) return value as T
  connectTouchedState(ls)
  return ls.v as T
}

export const getLightState = <T>(value: T): LightState | undefined => {
  return typeof value === 'function'
    ? stateRegistry.get(value)
    : value instanceof LightState ? value : undefined
}

export const delightstate: PeekType = <T>(value: T) => (value as LightState<T>).v as T

export const destate: PeekType = <T>(value: T) => {
  const ls = getLightState(value)
  return (ls ? ls.v : value) as T
}

const subscriptionsCache = new Set<() => void>()
const namedStatesCache = new Map()
let activeSubscriptions: Set<() => void> | undefined | null
let activeExistingNamedStates: Record<PropertyKey, State> | undefined
let activeNewNamedStates: Map<PropertyKey, State> | undefined

export const isInComponent = () => activeSubscriptions != null

export const startCapturingStateCalls = (namedStates?: Record<PropertyKey, State>) => {
  activeExistingNamedStates = namedStates
  activeSubscriptions = subscriptionsCache
  activeNewNamedStates = namedStatesCache
}

export const stopCapturingStateCalls = () => {
  let namedStates: Record<PropertyKey, State> | undefined
  if (activeExistingNamedStates) {
    namedStates = activeNewNamedStates!.size
      ? Object.assign({}, activeExistingNamedStates, Object.fromEntries(activeNewNamedStates!))
      : activeExistingNamedStates
    namedStatesCache.clear()
  } else if (activeNewNamedStates!.size) {
    namedStates = Object.fromEntries(activeNewNamedStates!)
  }
  namedStatesCache.clear()
  const subscriptions = activeSubscriptions!.size ? [...activeSubscriptions!.values()] : undefined
  subscriptionsCache.clear()
  activeSubscriptions = null
  activeExistingNamedStates = undefined
  activeNewNamedStates = undefined
  return { namedStates, subscriptions }
}
