import type { ObjectStateOf, State } from '@/state/types/types.js'
export type { MaybeState } from '@/state/types/types.js'
import { LightState } from '@/state/stateInternals/LightState.js'

import { NodeController, TEXT_NODE } from './nodeControllers/NodeController.js'
import { ComponentController } from './nodeControllers/ComponentController.js'
import type { RenderError } from './util/RenderError.js'

export type StringablePrimitive = string | number | bigint
export type TreeNode = Node | NodeController
export type ChildNode = TreeNode | typeof TEXT_NODE

type Nullish = null | undefined
type ElementPropertySubvalue = StringablePrimitive | boolean | Nullish
type ElementPropertyValue = ElementPropertySubvalue | readonly ElementPropertySubvalue[]

export type DOMEventListener = (a?: { target?: HTMLElement | SVGElement }) => void
export type EventListenerWithOptions = [EventListener, AddEventListenerOptions]

export type DOMHandlerEvent<
  EventName extends keyof HTMLElementEventMap,
  ElementType extends HTMLElement = HTMLInputElement,
> = HTMLElementEventMap[EventName] & { target: ElementType, currentTarget: ElementType }

export type DOMHandler<
  EventName extends keyof HTMLElementEventMap,
  ElementType extends HTMLElement = HTMLInputElement,
> = (event: DOMHandlerEvent<EventName, ElementType>) => void

export type SVGHandlerEvent<
  EventName extends keyof SVGElementEventMap,
  ElementType extends SVGElement = SVGElement,
> = SVGElementEventMap[EventName] & { target: ElementType, currentTarget: ElementType }

export type SVGHandler<
  EventName extends keyof SVGElementEventMap,
  ElementType extends SVGElement = SVGElement,
> = (event: SVGHandlerEvent<EventName, ElementType>) => void

type InputEventListener = DOMHandler<'input', HTMLInputElement>

type BareCSSStyleValue = StringablePrimitive | Nullish
type CSSStyleValue = BareCSSStyleValue | readonly BareCSSStyleValue[]
export type CSSStyleDeclaration = Record<string, CSSStyleValue>

// Record value is `unknown`, not `boolean`, so a concrete object State passed as a reactive class object
// (whose index signature reads back as State) stays assignable. See ObjectState in state/types/stateTypes.
type ElementClassSubValue = string | Record<string, unknown> | string[]
export type ElementClassValue = string | Record<string, unknown> | readonly ElementClassSubValue[]
type BareElementAttributeValue = ElementPropertyValue | CSSStyleDeclaration | ElementClassValue
  | InputEventListener | EventListenerOrEventListenerObject
type ElementAttributeValue = BareElementAttributeValue | State<BareElementAttributeValue>
export type DOMElementAttributes = Record<string, ElementAttributeValue>

export type ComponentFactory = (...args: ComponentArguments) => ComponentController
// Return type is unknown to avoid circular type
export type ChildFunction = () => unknown
type BareChildProp = ChildNode | StringablePrimitive | Nullish | ChildFunction
type BareChildProps = BareChildProp | BareChildProp[]
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ChildPropArray extends ReadonlyArray<ChildProp> {}
// A plain child value - safe to use as a variable, function parameter, return type, or the
// field type inside your own state({...}) calls, including reassigning it via .set()/.or()/
// .opt() (backed by the STATE_DOMOBJECT classification for NodeController instances
// specifically - see internalFunctions.ts - which is why arbitrary objects like a Map or Date
// aren't included here: only NodeController-family values get this treatment, since they're
// known not to collide with the chain-function API except ComponentController's own .or, which
// is deferred to rather than shadowed). ChildFunction now also carries or/opt/set the same way
// (FunctionState) - unconditionally, since no realistic function value collides with those names.
//
// Deliberately doesn't include "| State<DOMChild>" itself: DOMChild is meant to be usable
// directly as T in state<T>({...}), and a self-embedded State branch would give that branch a
// narrower Full than the wide Full the outer state<T>() distribution computes for DOMChild's
// other members - two incompatible instantiations of chain functions like .or() that reference
// Full in their own signature. To accept either a plain DOMChild value or an already-existing
// State of one (e.g. a prop passed in from elsewhere), use MaybeState<DOMChild> at that specific
// call site instead - State<DOMChild>, computed fresh there, doesn't have this problem.
type DOMChildValue = StringablePrimitive | Nullish | NodeController | ChildFunction
export type DOMChild = DOMChildValue | DOMChildValue[]
export type ChildProp = BareChildProps | State<BareChildProps> | Promise<BareChildProps>
  | ChildPropArray

// A .catch() fallback that is a plain function (or a State wrapping one) is called with the
// RenderError as its single positional argument, and its return value replaces this boundary's
// content - a distinct calling convention from a normal ComponentFunctionBody (single
// destructured-props-object argument) and from a bare ChildFunction (a niladic function passed
// as ordinary child content, auto-wrapped into its own ComponentController elsewhere and invoked
// there with a componentArgs props object). Deliberately kept separate from ChildFunction/
// ChildProp rather than widening either of those - they're used pervasively for ordinary child
// content with a different calling convention.
export type CatchFallbackFunction = (renderError: RenderError) => ChildProp
export type CatchFallback = ChildProp | CatchFallbackFunction | State<CatchFallbackFunction>

export type ComponentFunctionBody<T = ComponentProps> = (
  properties: T,
) => ChildProp

export type DOMNodeDefinition = ComponentFunctionBody | LightState | string | HTMLElement

export type RenderMode = 'render' | 'hydrate' | 'csr'

export type RootOptions = {
  root?: HTMLElement | null
  mode?: RenderMode
}

// The part of `document` that builds nodes, which render mode takes from the context instead, so
// that its server stand-ins are only bundled with renderToString
export type NodeFactory = {
  createElement(tagName: string): HTMLElement
  createTextNode(data: string): Text
  createComment(data: string): Comment
}

export type RenderContext = RootOptions & { doc?: NodeFactory }

// What a root hands down to its subtree: the mode as one of the MODE_ constants, compared far
// more often than it is set
export type NodeContext = { md?: number, doc?: NodeFactory }

export type ComponentProps = {
  children: ChildProp[]
  renderError?: RenderError
  [key: string]: unknown
}

export type ComponentOptions = Record<string, unknown>
export type ElementOptions = object

export type DOMElementArguments<T = DOMElementAttributes> = ChildProp[]
  | [T | ObjectStateOf<T>, ...ChildProp[]]

export type ComponentArguments = ChildProp[] | [ComponentOptions, ...ChildProp[]]

export type NodeArguments = DOMElementArguments | ComponentArguments

export type FindNodeResult = {
  p: Node // parent
  n: Node | null // node
  i: number // index
  s: number // start
}

export type HydrationContext = {
  nxt?: Node | null
}
