import type { ObjectStateOf, State } from '@/state/types/types.js'
import type { CSSStyleDeclaration, ElementClassValue, MaybeState, StringablePrimitive } from '../types.js'

// `any` (not `unknown`) is required here: the `this` parameter check on GlobalEventHandlers'
// `on*` properties needs to match regardless of `this`/return type, which only `any` bypasses.
/* eslint-disable @typescript-eslint/no-explicit-any */
type EventHandlerKeys<E> = {
  [K in keyof E]-?: K extends `on${string}`
    ? NonNullable<E[K]> extends (this: any, ev: infer _Ev) => any ? K : never
    : never
}[keyof E]

type RawElementEventMap<E> = {
  [K in EventHandlerKeys<E> as K extends `on${infer Name}` ? Name : never]:
  NonNullable<E[K]> extends (this: any, ev: infer Ev) => any ? Ev : never
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Events such as focusin and compositionstart have no `on*` property
type EventsWithoutHandlerProperty<E> = E extends GlobalEventHandlers
  ? Omit<GlobalEventHandlersEventMap, keyof RawElementEventMap<E>>
  : object

type EventMapOf<E> = RawElementEventMap<E> & EventsWithoutHandlerProperty<E>

type NarrowedEventMap<E> = {
  [K in keyof EventMapOf<E>]: EventMapOf<E>[K] & { target: E, currentTarget: E }
}

type EventListenerOptionsArg = AddEventListenerOptions | boolean
type EventListenerTuple<Ev> = readonly [((ev: Ev) => void) | EventListenerObject, EventListenerOptionsArg?]
type BareEventListenerValue<Ev> = ((ev: Ev) => void) | EventListenerTuple<Ev>

// change/input accept a state attribute value; a setter function is auto-provided
type AutoBindableEventKey = 'change' | 'input'
type ValueTypeOf<E> = E extends { value: infer V } ? V : never
// `checked` (checkbox/radio) is a separate IDL property from `value`, not a coercion of it -
// a checked checkbox can independently have any `value` string - so it's its own auto-bind
// branch below rather than folded into `ValueTypeOf`.
type CheckedTypeOf<E> = E extends { checked: infer C } ? C : never

type EventListenersOf<E> = {
  [K in keyof NarrowedEventMap<E>]?:
    | BareEventListenerValue<NarrowedEventMap<E>[K]>
    | State<BareEventListenerValue<NarrowedEventMap<E>[K]> | null | undefined>
    | (K extends AutoBindableEventKey
      ? (ValueTypeOf<E> extends (string | number) ? State<ValueTypeOf<E> | null | undefined> : never)
      : never)
    | (K extends AutoBindableEventKey
      ? (CheckedTypeOf<E> extends boolean ? State<CheckedTypeOf<E> | null | undefined> : never)
      : never)
}

// Detects readonly keys so they're excluded from the settable-attribute set below
// (tagName, nodeName, baseURI, validationMessage, willValidate, etc.)
type IsReadonlyKey<E, K extends keyof E>
  = (<T>() => T extends { [P in K]: E[K] } ? 1 : 2) extends
  (<T>() => T extends { -readonly [P in K]: E[K] } ? 1 : 2) ? false : true

type Nullish = null | undefined
type PrimitiveSubvalue = string | number | bigint | boolean | Nullish

type SettableKeys<E> = {
  [K in keyof E]-?: K extends `on${string}` ? never
    : IsReadonlyKey<E, K> extends true ? never
      : E[K] extends PrimitiveSubvalue ? K : never
}[keyof E]

// A handful of IDL property names don't survive setAttribute's automatic lowercasing
// correctly (e.g. `htmlFor` lowercases to `htmlfor`, but the real attribute is `for`).
type ExcludedAttrKeys = 'className' | 'htmlFor' | 'acceptCharset' | 'httpEquiv'

// SVG geometry/presentation attributes (cx, cy, r, x, y, width, height, viewBox, transform, ...)
// are reflected as read-only `SVGAnimated*` wrapper objects (SVGAnimatedLength, SVGAnimatedRect,
// etc.), not as plain primitives, so SettableKeys drops them. Every such wrapper has a `baseVal`
// property — detect that shape and reinstate the key as a plain settable string/number/boolean,
// matching what ElementController actually does at runtime (always setAttribute with a string).
type IsAnimatedWrapper<T> = T extends { baseVal: unknown } ? true : false
type ReflectedSvgKeys<E> = {
  [K in keyof E]-?: K extends `on${string}` ? never
    : IsAnimatedWrapper<NonNullable<E[K]>> extends true ? K : never
}[keyof E]

// Token-list attributes (iframe `sandbox`, link `sizes`, `blocking`, `part`, ...) are reflected as a
// DOMTokenList getter with a string setter, so SettableKeys drops them. Reinstate them as plain strings,
// except the `*List` mirrors (`classList`, `relList`) of attributes already reflected as strings.
type TokenListKeys<E> = {
  [K in keyof E]-?: K extends `${string}List` ? never
    : NonNullable<E[K]> extends DOMTokenList ? K : never
}[keyof E]

type AttrsOf<E>
  = Partial<Pick<E, Exclude<SettableKeys<E>, ExcludedAttrKeys>>>
    & { [K in ReflectedSvgKeys<E>]?: string | number | boolean }
    & { [K in Exclude<TokenListKeys<E>, ExcludedAttrKeys>]?: string }

// ElementController.handleProp reactively string-joins any array-valued, non-event attribute
type InterpolatedAttrValue = readonly MaybeState<PrimitiveSubvalue>[]

type Stringlike<T> = T extends string ? T | number | bigint : T
type ReactiveAttrsOf<E> = {
  [K in keyof AttrsOf<E>]: MaybeState<Stringlike<AttrsOf<E>[K]>> | InterpolatedAttrValue
}

// A handful of common SVG presentation attributes (CSS-style properties settable as content
// attributes) aren't reflected as IDL properties at all in lib.dom.d.ts, so neither SettableKeys
// nor the baseVal detection above can find them.
type SvgPresentationAttrs = {
  d?: MaybeState<string>
  points?: MaybeState<string>
  fill?: MaybeState<string>
  stroke?: MaybeState<string>
  'stroke-width'?: MaybeState<string | number>
  'stroke-dasharray'?: MaybeState<string>
  'stroke-linecap'?: MaybeState<string>
  'stroke-linejoin'?: MaybeState<string>
  'stroke-opacity'?: MaybeState<string | number>
  'fill-opacity'?: MaybeState<string | number>
  opacity?: MaybeState<string | number>
  offset?: MaybeState<string | number>
  'stop-color'?: MaybeState<string>
  'stop-opacity'?: MaybeState<string | number>
  'text-anchor'?: MaybeState<string>
  'font-family'?: MaybeState<string>
  'font-size'?: MaybeState<string | number>
  'clip-path'?: MaybeState<string>
  'dominant-baseline'?: MaybeState<string>
}
type SvgOnly<E> = E extends SVGElement ? SvgPresentationAttrs : object

export type FrameworkProps<E> = {
  class?: ElementClassValue
  style?: CSSStyleDeclaration | ObjectStateOf<CSSStyleDeclaration>
  nodeCreated?: (a: { target?: E }) => void
  nodeInserted?: (a: { target?: E }) => void
  nodeRemoved?: (a: { target?: E }) => void
  // `part` is DOMTokenList on the IDL side (non-primitive), so SettableKeys drops it —
  // reinstate it as a plain settable string.
  part?: MaybeState<string>
} & {
  [key: `aria-${string}`]: MaybeState<StringablePrimitive | boolean | Nullish>
  [key: `data-${string}`]: MaybeState<StringablePrimitive | boolean | Nullish>
}

export type ElementAttributesOf<E>
  = ReactiveAttrsOf<E> & EventListenersOf<E> & FrameworkProps<E> & SvgOnly<E>
