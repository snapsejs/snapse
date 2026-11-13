import type { InternalFunction, InternalFunctionMap, MapFunction, OptOption } from '@/state/types/types.js'
import { transforms } from '@/state/transforms/transforms.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { notify } from './notify.js'
import { delightstate, peek } from '@/state/state.js'
import { connectTouchedState } from '@/state/transforms/Transform.js'
import { assertWritable, createVersion, updateValue } from './stateUpdate.js'

export { createVersion, refresh, updateValue, upsertProperty } from './stateUpdate.js'

const setFn: InternalFunction = target => (value: unknown) => {
  assertWritable(target)
  return updateValue(target, value)
}

const commonInternalFunctions_symbol: InternalFunctionMap = new Map<PropertyKey, InternalFunction>([
  [Symbol.toPrimitive, target => {
    connectTouchedState(target)
    return (target.v as Record<symbol, unknown>)[Symbol.toPrimitive]
  }],
  [Symbol.iterator, target => (target.v as Record<symbol, unknown>)[Symbol.iterator]],
])

export const orFunction = (source: LightState, value: unknown) => {
  const v = source.v
  return (!v || (v instanceof Array && v.length === 0))
    ? value
    : delightstate(source)
}

export const notFunction = (source: LightState) => !source.v

const valueMethod = (name: 'toString' | 'valueOf'): InternalFunction => target => {
  connectTouchedState(target)
  return (target.v as Partial<Record<typeof name, Function>>)?.[name]?.bind(target.v)
}

const commonInternalFunctions_string: InternalFunctionMap = new Map<string, InternalFunction>([
  ['toString', valueMethod('toString')],
  ['valueOf', valueMethod('valueOf')],
  ['set', setFn],
  ['then', target => (onFulfilled: (value: unknown) => unknown) => {
    const resolve = (v: unknown) => {
      s.uns(target)
      onFulfilled(v)
    }
    const s = new transforms.CallbackTransform(target, resolve)
    const verBeforeSub = target.ver
    s.subTo(target)
    if (target.ver !== verBeforeSub) resolve(target.v)
  }],
  ['is', target => (cmp: unknown) => {
    return transforms.IsTransform.for(target).new(cmp)
  }],
  ['opt', <T>(target: LightState<T>) =>
    (options: OptOption, def?: unknown) =>
      new transforms.OptTransform(target, options, def).execute(),
  ],
  ['or', target => (value: unknown) =>
    new transforms.FunctionTransform(target, orFunction, [target, value]).execute(),
  ],
  ['not', target => () =>
    new transforms.FunctionTransform(target, notFunction, [target]).execute(),
  ],
  ['toJSON', target => {
    const is = target.v as Record<string, unknown>
    return is?.toJSON instanceof Function ? (is.toJSON as Function).bind(is) : () => is
  }],
])

const commonInternalFunctions: InternalFunctionMap = new Map([
  ...commonInternalFunctions_symbol, ...commonInternalFunctions_string,
])

// POJO properties can collide with the string-keyed common internal functions (e.g. a
//   property named 'set'), so POJOs only get the symbol-keyed ones, plus the entries below that
//   back native coercion protocols: every property read on a state returns a Proxy over a dummy
//   function target (see LightState), so without a real 'toJSON'/'toString'/'valueOf', JSON.
//   stringify and implicit ToPrimitive (String(), `${}`, +) see a typeof-function value and try
//   to call it, instead of using the (missing) real implementation.
const pojoInternalFunctions: InternalFunctionMap = new Map([
  ...commonInternalFunctions_symbol,
  ['toJSON', commonInternalFunctions_string.get('toJSON')!],
  ['toString', commonInternalFunctions_string.get('toString')!],
  ['valueOf', commonInternalFunctions_string.get('valueOf')!],
])

const updateArray = <T>(target: LightState<T>, fn: string) => {
  return (...args: unknown[]) => {
    assertWritable(target)
    target.ver = createVersion()
    const is = target.v as Record<string, (...args: unknown[]) => unknown>
    const r = is[fn]!(...args)
    notify(target)
    return r
  }
}

const arrayOnlyInternalFunctions: InternalFunctionMap = new Map([
  'copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift',
].map(fn => [fn, t => updateArray(t, fn)]))
arrayOnlyInternalFunctions.set('map', (target: LightState) => (f: MapFunction) =>
  new transforms.MapArrayTransform(target as LightState<Array<unknown>>, f as () => unknown).execute(),
)
arrayOnlyInternalFunctions.set('length', target => {
  connectTouchedState(target)
  return (target.v as unknown as unknown[])?.length
})

// Since boolean coercion does not invoke .valueOf, unwrap stateful boolean predicates
//   (using peek, to maintain reactivity)
const booleanPredicateArrayFunction = (fn: string): InternalFunction =>
  target => (...args: unknown[]) => {
    const predicate = args[0] as (...predicateArgs: unknown[]) => unknown
    args[0] = (...predicateArgs: unknown[]) => peek(predicate(...predicateArgs))
    return new transforms.ChainFunctionTransform(target, args, fn).execute()
  }

for (const fn of ['filter', 'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex'])
  arrayOnlyInternalFunctions.set(fn, booleanPredicateArrayFunction(fn))

const arraySearchFunction = (fn: 'includes' | 'indexOf' | 'lastIndexOf'): InternalFunction => {
  const hook = (t: LightState, ...hookArgs: unknown[]) => {
    const raw = Array.from(t.prx as unknown as Iterable<unknown>, peek) as unknown as
      Record<string, (...a: unknown[]) => unknown>
    return raw[fn]!(...peek(hookArgs).map(peek))
  }
  return target => (...args: unknown[]) =>
    new transforms.FunctionTransform(target, hook, [target, ...args]).execute()
}

for (const fn of ['includes', 'indexOf', 'lastIndexOf'] as const)
  arrayOnlyInternalFunctions.set(fn, arraySearchFunction(fn))

const primitiveOnlyInternalFunctions: InternalFunctionMap = new Map([
])
primitiveOnlyInternalFunctions.set(Symbol.toPrimitive, target => () => {
  connectTouchedState(target)
  return target.v
})

const arrayInternalFunctions = new Map([
  ...commonInternalFunctions, ...arrayOnlyInternalFunctions,
])

const primitiveInternalFunctions = new Map([
  ...commonInternalFunctions, ...primitiveOnlyInternalFunctions,
])

const functionInternalFunctions: InternalFunctionMap = new Map([
  ...commonInternalFunctions_symbol,
  ['set', setFn],
  ['opt', commonInternalFunctions_string.get('opt')!],
  ['or', commonInternalFunctions_string.get('or')!],
])

const domObjectInternalFunctions: InternalFunctionMap = new Map<PropertyKey, InternalFunction>([
  ...commonInternalFunctions_symbol,
  ['set', setFn],
  ['opt', commonInternalFunctions_string.get('opt')!],
  ['or', target => {
    const ownOr = (target.v as { or?: unknown } | null)?.or
    return typeof ownOr === 'function'
      ? (...args: unknown[]) => new transforms.ChainFunctionTransform(target, args, 'or').execute()
      : (value: unknown) =>
          new transforms.FunctionTransform(target, orFunction, [target, value]).execute()
  }],
])

export const STATE_PRIMITIVE = 0
export const STATE_ARRAY = 1
export const STATE_POJO = 2
export const STATE_FUNCTION = 3
export const STATE_OBJECT = 4
export const STATE_DOMOBJECT = 5
export const STATE_NULLISH_PRIMITIVE = 6 // NB: typically part of STATE_PRIMITIVE

export const internalFunctions = [
  primitiveInternalFunctions,
  arrayInternalFunctions,
  pojoInternalFunctions,
  functionInternalFunctions,
  commonInternalFunctions_symbol,
  domObjectInternalFunctions,
]
