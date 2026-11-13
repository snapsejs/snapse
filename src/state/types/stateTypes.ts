import type { NodeController } from '@/DOM/nodeControllers/NodeController.js'

type Nullish = null | undefined

// Nominal marker present on every shape StateImpl can produce (via PrimitiveStateMethods,
// ArrayState, ObjectState, FunctionState below). Lets `State<T>` recognize a `T` that is already
// some `State<X>` and return it unchanged instead of wrapping it again, so `State<State<X>>`
// collapses to `State<X>`.
declare const STATE_BRAND: unique symbol
type StateBrand = { readonly [STATE_BRAND]: true }
export type SomeState = StateBrand

// Phantom carrier of an object state's value type. Undeclared keys read as `unknown`, so an
// object state is not structurally assignable to index-signature targets such as attribute or
// style records; consumers instead accept `ObjectStateOf<V>`, which checks the value type.
// The value is a method parameter so that it is compared bivariantly: `{ t: State<number> }`
// and `{ t: number }` then match without recursively destating nested fields.
declare const STATE_VALUE: unique symbol
export type ObjectStateOf<V> = { [STATE_VALUE]?(value: V): void } & StateBrand

export type OrType<T = unknown> = <U>(v: U) => State<T | U>

// .catch()'s real signature (NodeController.catch(v: CatchFallback): this) returns a polymorphic
//   `this` type, which - unlike .or()'s plain `State<T | U>` - triggers a circular-reference error
//   when the generic ObjectState mapped type tries to compute State<T['catch']> for it. Typed
//   loosely here (not importing CatchFallback, to avoid a DOM/types.ts <-> stateTypes.ts type
//   cycle) and substituted in for that mapped-type branch by DOMObjectState below instead.
export type CatchType<Full = unknown> = (v: unknown) => State<Full>

// .set() accepts a raw value or a State of it -- updateValue() destates its argument at runtime.
export type MaybeState<T> = T | State<T>

type ArrayStateConstraint<T> = { push(...items: T[]): unknown, set: unknown }

// Unwraps a state type to its underlying value type, distributing over unions so
// that e.g. `PrimitiveState<number> | PrimitiveState<string>` becomes `number | string`.
export type ValueOfState<S>
  = S extends FunctionState<infer T> ? T
    : S extends ArrayState<infer T> ? T[]
      : S extends ObjectState<infer T> ? T
        : S extends PrimitiveState<infer T> ? T
          : S extends PrimitiveStateMethods<infer T> ? T
            : S

// Restricts the object-map form of .opt() to the receiver's own key type when it's a
// property-key union (e.g. a string-literal union) - falls back to plain `string` (any
// key, no exhaustiveness requirement) for anything else, matching prior behavior.
type OptKey<Self> = [Extract<Self, PropertyKey>] extends [never] ? string : Extract<Self, PropertyKey>

// The object-map overloads below infer T as the whole argument object (ordinary, single-site
// generic inference) and only read its per-branch value types back out afterwards via
// `T[keyof T]`, rather than inferring one shared value type directly through a homomorphic
// `Record<OptKey<Self>, T>` parameter. A literal-union key forces TypeScript's reverse-mapped-
// type inference for that shape, which - when the map's branches have different value types -
// picks one property's type as T and rejects the others instead of unioning them. `T extends
// ...` here is a plain constraint check with no value-side inference, so it isn't affected,
// while still enforcing the same exhaustive-or-partial key requirement.
type OptFullMap<Self> = Record<OptKey<Self>, unknown>
type OptPartialMap<Self> = Partial<Record<OptKey<Self>, unknown>>

// Excludes anything that structurally looks like a (possibly partial) key-map over the
// receiver's own value type, so plain values (primitives, arrays, functions, NodeControllers,
// wrapped States, ...) fall through to the plain-value overload below, while a map-shaped
// object is forced through the map overloads above - where exhaustiveness is enforced -
// instead of silently matching here. Relies on TS's "weak type" assignability rule, which
// requires at least one property in common with an all-optional-properties type before
// accepting a value as an instance of it: anything sharing no `OptKey<Self>` property (i.e.
// everything except an actual, even partial, map) fails the `extends` check below and takes
// the plain `T` branch.
type NotOptMap<Self, T> = T extends OptPartialMap<Self> ? never : T

export interface OptType<Self = unknown> {
  <T, U = T>(options: ArrayStateConstraint<T>, def: U | State<U>): NoInfer<State<T | U>>
  <T>(options: ArrayStateConstraint<T>): NoInfer<State<T | undefined>>
  <T extends OptFullMap<Self>>(options: T): NoInfer<State<T[keyof T] | undefined>>
  <T extends OptFullMap<Self>>(options: State<T>): NoInfer<State<T[keyof T] | undefined>>
  <T extends OptPartialMap<Self>, U = T[keyof T]>(
    options: T, def: U | State<U>
  ): NoInfer<State<T[keyof T] | U>>
  <T extends OptPartialMap<Self>, U = T[keyof T]>(
    options: State<T>, def: U | State<U>
  ): NoInfer<State<T[keyof T] | U>>
  <T, U = T>(options: T[] | State<T[]>, def: U | State<U>): NoInfer<State<T | U>>
  <T>(options: T[] | State<T[]>): NoInfer<State<T | undefined>>
  <T, D>(options: NotOptMap<Self, T>, def: D): NoInfer<State<T | ValueOfState<D>>>
  <T>(options: NotOptMap<Self, T>): NoInfer<State<T | undefined>>
}

type StringState = {
  at(index: number): State<string | undefined>
  charAt(pos: number): State<string>
  charCodeAt(index: number): State<number>
  codePointAt(pos: number): State<number | undefined>
  concat(...strings: string[]): State<string>
  endsWith(searchString: string, endPosition?: number): State<boolean>
  includes(searchString: string, position?: number): State<boolean>
  indexOf(searchString: string, position?: number): State<number>
  lastIndexOf(searchString: string, position?: number): State<number>
  localeCompare(that: string, locales?: string | string[], options?: Intl.CollatorOptions): State<number>
  match(regexp: string | RegExp): State<RegExpMatchArray | null>
  matchAll(regexp: RegExp): State<IterableIterator<RegExpMatchArray>>
  normalize(form?: string): State<string>
  padEnd(maxLength: number, fillString?: string): State<string>
  padStart(maxLength: number, fillString?: string): State<string>
  repeat(count: number): State<string>
  replace(searchValue: string | RegExp, replaceValue: string): State<string>
  replace(
    searchValue: string | RegExp, replacer: (substring: string, ...args: unknown[]) => string
  ): State<string>
  replaceAll(searchValue: string | RegExp, replaceValue: string): State<string>
  replaceAll(
    searchValue: string | RegExp, replacer: (substring: string, ...args: unknown[]) => string
  ): State<string>
  search(regexp: string | RegExp): State<number>
  slice(start?: number, end?: number): State<string>
  split(separator: string | RegExp | undefined, limit?: number): ArrayState<string>
  startsWith(searchString: string, position?: number): State<boolean>
  substring(start: number, end?: number): State<string>
  toLocaleLowerCase(locales?: string | string[]): State<string>
  toLocaleUpperCase(locales?: string | string[]): State<string>
  toLowerCase(): State<string>
  toString(): string
  toUpperCase(): State<string>
  trim(): State<string>
  trimEnd(): State<string>
  trimStart(): State<string>
  valueOf(): string
}

type NumberState = {
  toExponential(fractionDigits?: number): State<string>
  toFixed(fractionDigits?: number): State<string>
  toLocaleString(locales?: string | string[], options?: Intl.NumberFormatOptions): State<string>
  toPrecision(precision?: number): State<string>
  toString(radix?: number): string
  valueOf(): number
}

type BigIntState = {
  toLocaleString(locales?: string, options?: object): State<string>
  toString(radix?: number): string
  valueOf(): bigint
}

type BooleanState = {
  toString(): string
  valueOf(): boolean
}

type SymbolState = {
  toString(): string
  valueOf(): symbol
}

type PrimitiveStates<T>
  = T extends string ? StringState
    : T extends number ? NumberState
      : T extends boolean ? BooleanState
        : T extends bigint ? BigIntState
          : T extends symbol ? SymbolState
            : unknown

export type PrimitiveStateMethods<T> = {
  opt: OptType<T>
  or: OrType<T>
  set(v: MaybeState<T>): void
  not: () => State<boolean>
  is: (v: unknown) => State<boolean>
} & StateBrand

// `Full` defaults to `T` for direct use (e.g. `PrimitiveState<number>` elsewhere in the
// codebase) but is threaded separately by `State<T>` below: for a union like `string | null`,
// `T` (this file's "Member") is distributed per-branch to get the right kind-specific shape
// (StringState vs NullishState), while `Full` stays the *whole*, undistributed union so
// `.set()`/`.or()` have one shared signature across every branch - calling a method on a union
// of differently-shaped functions requires the argument to satisfy the intersection of all of
// them (`never` for disjoint branches), so each branch must expose the identical signature.
export type PrimitiveState<T = unknown, Full = T> = PrimitiveStates<T> & T & PrimitiveStateMethods<Full>

// Nullish states are typically reassigned, allow accessing properties
type NullishState<Full> = PrimitiveStateMethods<Full> & { [key: string]: undefined }

export type FunctionState<T = unknown, Full = T> = (
  T extends (...args: infer A) => infer R ? (...args: A) => State<R> : T
) & {
  opt: OptType<Full>
  or: OrType<Full>
  set(v: MaybeState<Full>): void
} & StateBrand

export type ArrayState<T, Full = T[]> = {
  // Predicate/callback params below are typed to match runtime: filter/map/find/some/... run
  // against the state proxy (via ChainFunctionTransform), so `Get`ing an element mid-iteration
  // yields the boxed `State<T>` child, not the raw `T` - only the loop index stays a plain number.
  filter<S extends T>(
    predicate: (value: State<T>, index: number, array: ArrayState<T>) => value is State<S>, thisArg?: unknown
  ): ArrayState<S>
  filter(
    predicate: (value: State<T>, index: number, array: ArrayState<T>) => unknown, thisArg?: unknown
  ): ArrayState<T>
  map<U>(
    callbackfn: (value: State<T>, index: State<number>, array: ArrayState<T>) => U, thisArg?: unknown
  ): ArrayState<U>
  flatMap<U, This = undefined>(
    callback: (this: This, value: State<T>, index: number, array: ArrayState<T>) => U | ReadonlyArray<U>,
    thisArg?: This
  ): ArrayState<U>
  find<S extends T>(
    predicate: (value: State<T>, index: number, obj: ArrayState<T>) => value is State<S>, thisArg?: unknown
  ): State<S | undefined>
  find(
    predicate: (value: State<T>, index: number, obj: ArrayState<T>) => unknown, thisArg?: unknown
  ): State<T | undefined>
  findLast<S extends T>(
    predicate: (value: State<T>, index: number, array: ArrayState<T>) => value is State<S>, thisArg?: unknown
  ): State<S | undefined>
  findLast(
    predicate: (value: State<T>, index: number, array: ArrayState<T>) => unknown, thisArg?: unknown
  ): State<T | undefined>
  findIndex(
    predicate: (value: State<T>, index: number, obj: ArrayState<T>) => unknown, thisArg?: unknown
  ): State<number>
  findLastIndex(
    predicate: (value: State<T>, index: number, array: ArrayState<T>) => unknown, thisArg?: unknown
  ): State<number>
  reduce(
    callbackfn:
    (previousValue: State<T>, currentValue: State<T>, currentIndex: number, array: ArrayState<T>) => T
  ): State<T>
  reduce(
    callbackfn: (previousValue: T, currentValue: State<T>, currentIndex: number, array: ArrayState<T>) => T,
    initialValue: T
  ): State<T>
  reduce<U>(
    callbackfn: (previousValue: U, currentValue: State<T>, currentIndex: number, array: ArrayState<T>) => U,
    initialValue: U
  ): State<U>
  reduceRight(
    callbackfn:
    (previousValue: State<T>, currentValue: State<T>, currentIndex: number, array: ArrayState<T>) => T
  ): State<T>
  reduceRight(
    callbackfn: (previousValue: T, currentValue: State<T>, currentIndex: number, array: ArrayState<T>) => T,
    initialValue: T
  ): State<T>
  reduceRight<U>(
    callbackfn: (previousValue: U, currentValue: State<T>, currentIndex: number, array: ArrayState<T>) => U,
    initialValue: U
  ): State<U>
  some(
    predicate: (value: State<T>, index: number, array: ArrayState<T>) => unknown, thisArg?: unknown
  ): State<boolean>
  every<S extends T>(
    predicate: (value: State<T>, index: number, array: ArrayState<T>) => value is State<S>, thisArg?: unknown
  ): State<boolean>
  every(
    predicate: (value: State<T>, index: number, array: ArrayState<T>) => unknown, thisArg?: unknown
  ): State<boolean>
  includes(searchElement: T, fromIndex?: number): State<boolean>
  indexOf(searchElement: T, fromIndex?: number): State<number>
  lastIndexOf(searchElement: T, fromIndex?: number): State<number>
  at(index: number): State<T | undefined>
  slice(start?: number, end?: number): ArrayState<T>
  concat(...items: ConcatArray<T>[]): ArrayState<T>
  concat(...items: (T | ConcatArray<T>)[]): ArrayState<T>
  join(separator?: string): State<string>
  toString(): string
  toLocaleString(): State<string>
  // Declared explicitly (Array.prototype.sort's `this`-typed return would otherwise leave this
  //   to fall through to the plain-array signature, incidentally still typed right but not by design).
  sort(compareFn?: (a: T, b: T) => number): ArrayState<T, Full>
  toSorted(compareFn?: (a: T, b: T) => number): ArrayState<T>
  toReversed(): ArrayState<T>
  toSpliced(start: number, deleteCount: number, ...items: T[]): ArrayState<T>
  toSpliced(start: number, deleteCount?: number): ArrayState<T>
  with(index: number, value: T): ArrayState<T>
  keys(): State<IterableIterator<number>>
  values(): State<IterableIterator<T>>
  entries(): State<IterableIterator<[number, T]>>
  opt: OptType<Full>
  or: OrType<Full>
  set(v: MaybeState<Full>): void
  [K: number]: State<T>
} & T[] & StateBrand

// A POJO's own toString and valueOf are bound to the raw value, so they return raw values
type ObjectStateMember<T, K extends keyof T> = K extends 'toString' | 'valueOf' ? T[K] : State<T[K]>

// POJO states allow adding any new property
export type ObjectState<T, Full = T> = {
  [K in keyof T]: ObjectStateMember<T, K>
}
& { set(v: MaybeState<Full>): void }
& { [key: string]: unknown }
& ObjectStateOf<T>

// Duplicates ObjectState's shape (rather than `Omit<ObjectState<T, Full>, 'catch'>`) because
//   `Omit`/`Pick` force TypeScript to eagerly materialize the full key-value map before excluding
//   a key, which re-triggers the same circular evaluation this is working around - the `as never`
//   key remap below is lazy and skips the problematic value-type computation for 'catch' entirely.
export type DOMObjectState<T, Full = T> = {
  [K in keyof T as K extends 'catch' ? never : K]: State<T[K]>
}
& { set(v: MaybeState<Full>): void }
& { [key: string]: unknown }
& ObjectStateOf<T>
& { opt: OptType<Full>, or: OrType<Full>, catch: CatchType<Full> }

// A bare (non-tuple-wrapped) type parameter in a conditional type distributes over unions:
// each member of `Member` is checked separately, so a union like `string | null` gets the
// right kind-specific shape per branch (`PrimitiveState<string, ...> | NullishState<...>`) -
// this also preserves structural subtyping for mixed-kind unions (e.g. a `ComponentController`
// subclass upcasting to the `NodeController` branch of `ChildProp`), which a fully
// non-distributive `State<T>` would collapse into one undifferentiated fallback and break.
// `Full` is passed through unchanged (never appears in an `extends` check), so it's always the
// *whole*, original, undistributed `T` - threading it into `.set()`/`.or()` (see
// PrimitiveState/ArrayState/FunctionState/ObjectState above) keeps those signatures identical
// across every branch, which is what makes calling them on the resulting union type-check at all.
type StateImpl<Member, Full>
  // Member is already some `State<X>` shape (carries the brand) - return it unchanged so
  // `State<State<X>>` collapses to `State<X>` instead of wrapping it a second time.
  = Member extends StateBrand
    ? Member
    : Member extends number
      ? PrimitiveState<number, Full>
      : Member extends string
        ? PrimitiveState<string, Full>
        : Member extends boolean
          ? PrimitiveState<boolean, Full>
          : Member extends Array<infer U>
            ? ArrayState<U, Full>
            : Member extends ArrayState<infer U>
              ? ArrayState<U, Full>
              : Member extends Function
                ? FunctionState<Member, Full>
                : Member extends NodeController
                  ? DOMObjectState<Member, Full>
                  : Member extends object
                    ? ObjectState<Member, Full>
                    : [Member] extends [Nullish]
                        ? NullishState<Full>
                        : PrimitiveState<Member, Full>

export type State<T = unknown> = StateImpl<T, T>
