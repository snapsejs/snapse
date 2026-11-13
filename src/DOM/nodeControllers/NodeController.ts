import type {
  CatchFallback, CatchFallbackFunction, ChildNode, ChildProp, ComponentFunctionBody, ComponentOptions,
  DOMElementAttributes, DOMNodeDefinition, FindNodeResult, HydrationContext, NodeArguments,
  NodeContext, TreeNode,
} from '../types.js'
import type { State } from '@/state/types/types.js'
import { DEV } from '@/common/dev.js'
import type { CallbackTransform } from '@/state/transforms/CallbackTransform.js'
import { TRANSFORM_FLAG_REBUILDS_CHILDREN, currentRunId } from '@/state/transforms/Transform.js'
import type { StateController } from './StateController.js'
import type { ComponentController } from './ComponentController.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { isPOJO } from '@/common/util.js'
import { getLightState, isState } from '@/state/state.js'
import { refresh } from '@/state/stateInternals/stateUpdate.js'
import { isPromotedElement } from '@/state/common/refCountAndType.js'
import { isNode } from '../util/util.js'
import { isDOMNode, isElementNode } from '../util/domNode.js'
import { RenderError } from '../util/RenderError.js'
import {
  type ChildShape, HYDRATE_MARKER_TEXT, SHAPE_DYNAMIC, SHAPE_ELEMENT, SHAPE_EMPTY, SHAPE_STATIC,
  computeUnsafeJunctions,
} from '../util/childShape.js'
import { getNodeCount } from '../util/nodeCount.js'
import { liveChildNodeAt } from '../util/deferredNodes.js'
import { transforms } from '@/state/transforms/transforms.js'
import { isArray } from '@/common/shorthands.js'

export const TEXT_NODE = 42

export type StateControllersByState = { lookup(ls: LightState): StateController | undefined }

export const MODE_CSR = 0
export const MODE_HYDRATE = 1
export const MODE_RENDER = 2

export const CONTROLLER_FLAG_IS_CONTEXT_TRANSPARENT = 1
export const CONTROLLER_FLAG_IS_STATE_CONTROLLER = 2
export const CONTROLLER_FLAG_IS_ELEMENT = 4
// Has its own isolated DOM subtree (via getMountElement()) that must never be
// flattened into an ambient parent's children, nor counted as part of the
// ambient tree's node bookkeeping — e.g. RootController rendering elsewhere.
export const CONTROLLER_FLAG_OPAQUE_SUBTREE = 8
// Rebuilds its whole subtree from its args every time it is (re-)created — e.g. a
// RootController held by an .opt() and re-created when the condition toggles back on.
// Its direct children must keep their args so that rebuild produces real content.
export const CONTROLLER_FLAG_REBUILDS_FROM_ARGS = 16

const holdsPOJO = (ls: LightState) => {
  refresh(ls)
  return isPOJO(ls.v)
}

const isNodeController = (c: ChildNode): c is NodeController => c instanceof NodeController

const isBlankText = (n?: Node | null) =>
  n?.nodeType === Node.TEXT_NODE && !(n as Text).data.trim()

type CatchParams = {
  fbValue: CatchFallback
  stateContext?: NodeController
  namedStates?: Record<PropertyKey, State>
  lvl: number
}

const resolveCallableFallback = (fallback: CatchFallback): CatchFallbackFunction | undefined => {
  if (fallback instanceof Function) return fallback as unknown as CatchFallbackFunction
  const ls = getLightState(fallback)
  if (ls) {
    refresh(ls)
    if (typeof ls.v === 'function') return ls.v as unknown as CatchFallbackFunction
  }
  return undefined
}

// A plain .par-chain walk that hands an already-rendered RenderError to further ancestor .catch()
//   boundaries via a direct call, not by rethrowing it. Rethrowing would (a) never even reach an
//   ancestor whose super.build() call didn't actually throw - e.g. a component whose own body
//   wraps a child that already fully absorbed its own error and returned normally - and (b) would
//   incorrectly make the ancestor's child-construction loop treat this already-successfully-
//   rendered boundary as a failed child, abandoning any of its own not-yet-created siblings.
const notifyAncestors = (start: NodeController | undefined, renderError: RenderError) => {
  for (let c = start; c && !renderError.propagationStopped; c = c.par) {
    if (c.catchParams) c.triggerCatch(renderError)
  }
}

export abstract class NodeController {
  ctx?: NodeContext
  el?: HTMLElement | SVGElement
  par?: NodeController
  nc = 0
  declare flg: number
  // Nodes in the mount element before this controller's own, which are not its to manage
  declare pnc: number
  // Id of the transform run that created this controller, 0 if created outside any transform
  cid: number
  protected args?: unknown[]
  protected c?: ChildNode[]
  protected subs?: ((() => void) | CallbackTransform)[]
  protected def?: DOMNodeDefinition
  catchParams?: CatchParams

  protected abstract buildNode(
    properties?: DOMElementAttributes | ComponentOptions,
    namedStates?: Record<PropertyKey, State>,
    stateContext?: NodeController,
    hydrationContext?: HydrationContext,
    level?: number,
  ): Record<PropertyKey, State> | void

  private static StateController?: typeof StateController
  static setStateController(stateController: typeof StateController) {
    NodeController.StateController = stateController
  }

  private static ComponentController?: typeof ComponentController
  static setComponentController(componentController: typeof ComponentController) {
    NodeController.ComponentController = componentController
  }

  // True if some ancestor might recreate `node` from previously-parsed args (e.g. a RootController
  // or element held by .opt(), reactivated) rather than only ever being replaced wholesale by a
  // transform's own reactive update -- in which case a stale cached LightState value reachable
  // through `node` could get rebuilt using args a descendant already discarded.
  private static mightBeReplayedFromArgs(node: NodeController): boolean {
    // Only ever called with a StateController, which is always build()'d with a defined
    // parentController (see parseArgsRecursive), so `.par` is trusted to be set here.
    const p = node.par!
    if (p instanceof NodeController.StateController!) {
      return NodeController.mightBeReplayedFromArgs(p)
    }
    return !!(p.flg & (CONTROLLER_FLAG_IS_ELEMENT | CONTROLLER_FLAG_REBUILDS_FROM_ARGS))
      && p.args !== undefined
  }

  // A promoted array element is only ever re-rendered by the array that owns it. A transform that
  //   rebuilds its children only discards a child that its own latest run created: anything else
  //   may be mounted again after being removed.
  private static stateMightReuseArgs(sc: StateController, child: NodeController): boolean {
    if (isPromotedElement(sc.def as LightState)) {
      return NodeController.stateMightReuseArgs(sc.par as StateController, child)
    }
    const tfm = sc.tfm
    return !((tfm?.flg ?? 0) & TRANSFORM_FLAG_REBUILDS_CHILDREN)
      || child.cid !== tfm!.runId
      || NodeController.mightBeReplayedFromArgs(sc)
  }

  // Runs a Component fallback purely for its side effects
  private static invokeDetached(
    fallback: ComponentController, namedStates: Record<PropertyKey, State> | undefined,
    level: number, ctx: NodeContext | undefined,
  ) {
    /* v8 ignore next */
    const noop = () => null
    const dummyParent = new NodeController.ComponentController!(noop)
    const isRender = ctx?.md === MODE_RENDER
    dummyParent.ctx = isRender ? ctx : {}
    const detachedDOMContext = {
      p: (isRender ? ctx.doc! : document).createElement('div'), n: null, i: 0, s: 0,
    }
    fallback.build(dummyParent, detachedDOMContext, dummyParent, namedStates, undefined, level)
    fallback.remove()
    dummyParent.remove()
  }

  constructor(definition: DOMNodeDefinition, args?: NodeArguments) {
    this.def = definition
    if (args) this.args = args
    this.cid = currentRunId()
  }

  private parseArgsRecursive(
    args: NodeArguments, children: ChildNode[], previousStateControllers?: StateControllersByState,
  ): DOMElementAttributes | ComponentOptions | undefined {
    let properties: DOMElementAttributes | ComponentOptions | undefined
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (typeof arg === 'string' || typeof arg === 'number') {
        children.push(this.createTextChild(arg))
        continue
      }
      // A state is a function, so it can't be mistaken for the NodeController it may hold
      if (typeof arg === 'object' && arg instanceof NodeController) {
        children.push(arg)
        continue
      }
      const ls = getLightState(arg)
      if (i === 0 && (ls ? holdsPOJO(ls) : isPOJO(arg))) {
        properties = arg as DOMElementAttributes | ComponentOptions
      } else if (ls) {
        children.push(previousStateControllers?.lookup(ls) ?? new NodeController.StateController!(ls))
      } else if (isDOMNode(arg)) {
        children.push(arg)
      } else if (isArray(arg)) {
        this.parseArgsRecursive(arg, children, previousStateControllers)
      } else if (arg instanceof Promise) {
        children.push(new NodeController.StateController!(new transforms.PromiseTransform(arg).execute()!))
      } else if (arg instanceof Function) {
        children.push(new NodeController.ComponentController!(arg as unknown as ComponentFunctionBody))
      } else if (isNode(arg)) {
        children.push(this.createTextChild(arg))
      }
    }
    return properties
  }

  protected createTextChild(value: unknown): ChildNode {
    return this.ctx?.md === MODE_HYDRATE
      ? TEXT_NODE
      : this.ctx?.md === MODE_RENDER
        ? this.ctx.doc!.createTextNode(String(value))
        : document.createTextNode(String(value))
  }

  protected parseArgs(
    args: NodeArguments, previousStateControllers?: StateControllersByState,
  ): DOMElementAttributes | ComponentOptions | undefined {
    this.c = []
    return args ? this.parseArgsRecursive(args, this.c, previousStateControllers) : undefined
  }

  catch(v: CatchFallback) {
    this.catchParams = { fbValue: v, lvl: 1 }
    return this
  }

  build(
    parentController?: NodeController, DOMContext?: FindNodeResult,
    stateContext?: NodeController, namedStates?: Record<PropertyKey, State>,
    hydrationContext?: HydrationContext, level = 1,
  ) {
    const originalArgs = this.args
    const catchParams = this.catchParams
    if (catchParams) {
      catchParams.lvl = level
      const fallback = catchParams.fbValue
      if (fallback instanceof NodeController.ComponentController! || isState(fallback)) {
        catchParams.stateContext = stateContext
        catchParams.namedStates = namedStates
      }
    }
    try {
      this.par = parentController
      if (parentController) this.ctx = this.inheritContext(parentController.ctx)
      const properties = this.parseArgs(this.args as NodeArguments)
      const parentMightReuseArgs = parentController instanceof NodeController.StateController!
        ? NodeController.stateMightReuseArgs(parentController, this)
        : !!((parentController?.flg ?? 0) & (CONTROLLER_FLAG_IS_ELEMENT | CONTROLLER_FLAG_REBUILDS_FROM_ARGS))
          && parentController!.args !== undefined
      if (!parentMightReuseArgs) {
        this.args = undefined
      }
      namedStates = this.buildNode(properties, namedStates, stateContext, hydrationContext, level)
        ?? namedStates
      this.createChildren(parentController, DOMContext, stateContext, namedStates, hydrationContext, level)
    } catch (e) {
      if (!catchParams) throw e
      const renderError = this.renderFallback(
        e, originalArgs, parentController, DOMContext, stateContext, namedStates, hydrationContext, level,
      )
      if (!renderError.propagationStopped) notifyAncestors(this.par, renderError)
    }
  }

  triggerCatch(cause: unknown): RenderError {
    const { stateContext, namedStates, lvl: level } = this.catchParams!
    return this.renderFallback(
      cause, this.args, this.par, undefined, stateContext, namedStates, undefined, level,
    )
  }

  private renderFallback(
    cause: unknown, originalArgs: unknown[] | undefined,
    parentController: NodeController | undefined, DOMContext: FindNodeResult | undefined,
    stateContext: NodeController | undefined, namedStates: Record<PropertyKey, State> | undefined,
    hydrationContext: HydrationContext | undefined, level: number,
  ): RenderError {
    const renderError = cause instanceof RenderError
      ? cause
      : new RenderError(cause, () => {
          this.remove()
          this.args = originalArgs
          const newDOMContext = this.getMountElement() ? undefined : this.par!.findNode(this)
          const prevCount = this.nc
          this.build(parentController, newDOMContext, stateContext, namedStates, hydrationContext, level)
          const newCount = this.nc
          this.nc = prevCount
          this.updateNodeCount(newCount)
        })

    const fallback = this.catchParams!.fbValue
    const callable = resolveCallableFallback(fallback)

    if (renderError.fallbackRendered) {
      if (callable) {
        callable(renderError)
      } else if (fallback instanceof NodeController.ComponentController!) {
        fallback.renderError = renderError
        NodeController.invokeDetached(
          fallback, this.catchParams!.namedStates, level, this.ctx,
        )
      }
      return renderError
    }

    this.remove()
    if (DOMContext === undefined && !this.getMountElement()) DOMContext = this.par!.findNode(this)
    if (callable) {
      this.parseArgs([callable(renderError) as ChildProp])
    } else {
      if (fallback instanceof NodeController.ComponentController!) fallback.renderError = renderError
      this.parseArgs([fallback as ChildProp])
    }
    this.createChildren(parentController, DOMContext, stateContext, namedStates, hydrationContext, level)
    // A fallback that renders nothing (a function/component returning null/undefined) is treated
    // as declining to handle the error: its old (failed) children are still torn down (above),
    // and it stays empty, but fallbackRendered is left false so a further ancestor .catch() still
    // gets a full turn to actually replace the UI, not just be notified.
    renderError.fallbackRendered = !!this.c?.length
    return renderError
  }

  protected createChildren(
    parentController?: NodeController, DOMContext?: FindNodeResult,
    stateContext?: NodeController,
    namedStates?: Record<PropertyKey, State> | undefined,
    hydrationContext?: HydrationContext, level = 1,
  ) {
    const mountElement = this.getMountElement()
    if (mountElement) {
      DOMContext = {
        p: mountElement,
        n: null,
        i: 0,
        s: 0,
      } as FindNodeResult
      if (this.ctx?.md === MODE_HYDRATE) {
        hydrationContext = { nxt: mountElement.firstChild }
      }
    }
    const childStateContext = this.flg & CONTROLLER_FLAG_IS_CONTEXT_TRANSPARENT
      ? (stateContext ?? this)
      : this
    this.nc = this.addChildren(DOMContext!, hydrationContext, childStateContext, namedStates, level)
    if (this.ctx?.md === MODE_HYDRATE && mountElement) this.removeExcessNodes(hydrationContext!)
    if (!parentController && this.ctx?.md === MODE_HYDRATE) this.ctx.md = MODE_CSR
  }

  protected getMountElement(): HTMLElement | SVGElement | undefined {
    return this.el
  }

  protected inheritContext(ctx?: NodeContext) {
    return ctx
  }

  protected getNodes(p: TreeNode): Node[] {
    if (isDOMNode(p)) return [p]
    return p.el ? [p.el] : p.c!.flatMap(c => this.getNodes(c as TreeNode))
  }

  isSoleChild(child: NodeController): boolean {
    return this.c?.length === 1 && this.c[0] === child
  }

  // Created before, without keeping the args needed to create it again
  isSpent(): boolean {
    return this.par !== undefined && this.args === undefined
  }

  // Holds its content, rather than never having been created or having been torn down
  isMounted(): boolean {
    return this.el !== undefined || this.c !== undefined
  }

  // The form a StateController holds this child in once mounted (see resolveChild)
  heldForm(): TreeNode {
    if (this.flg & CONTROLLER_FLAG_OPAQUE_SUBTREE || this.catchParams !== undefined) return this
    if (this.el) return this.c ? this : this.el
    const only = !this.subs && this.c?.length === 1 ? this.c[0] : undefined
    if (!only) return this
    return only instanceof NodeController ? only.heldForm() : only as TreeNode
  }

  getFirstNode(node: TreeNode): Node | undefined {
    if (isDOMNode(node)) return node
    if (node.el) return node.el
    for (const c of node.c!) {
      const nc = this.getFirstNode(c as TreeNode)
      if (nc) return nc
    }
  }

  private classifyChild(child: ChildNode): ChildShape {
    if (child === TEXT_NODE) return SHAPE_STATIC
    if (isDOMNode(child)) return isElementNode(child) ? SHAPE_ELEMENT : SHAPE_STATIC
    if (child.flg & CONTROLLER_FLAG_IS_STATE_CONTROLLER) {
      const ls = child.def as LightState
      if (ls.v == null) return SHAPE_EMPTY
      return ls.v instanceof NodeController && (ls.v.flg & CONTROLLER_FLAG_IS_ELEMENT)
        ? SHAPE_ELEMENT
        : SHAPE_DYNAMIC
    }
    return child.flg & CONTROLLER_FLAG_IS_ELEMENT ? SHAPE_ELEMENT : SHAPE_DYNAMIC
  }

  private dropNode(hydrationContext: HydrationContext) {
    const skip = hydrationContext.nxt!
    hydrationContext.nxt = skip.nextSibling
    skip.parentNode?.removeChild(skip)
  }

  protected removeExcessNodes(hydrationContext: HydrationContext) {
    while (hydrationContext.nxt?.nodeType === Node.COMMENT_NODE || isBlankText(hydrationContext.nxt)) {
      this.dropNode(hydrationContext)
    }
  }

  // Consumes the marker comment this junction wrote during the render pass, along with any
  // whitespace a prettifier put in front of it. Deliberately stops at the marker rather than
  // running on the way removeExcessNodes does: whatever follows belongs to the next child, and
  // for a child whose own content is whitespace that node is the only copy of it.
  private crossJunction(hydrationContext: HydrationContext) {
    while (isBlankText(hydrationContext.nxt)) this.dropNode(hydrationContext)
    const marker = hydrationContext.nxt
    if (marker?.nodeType === Node.COMMENT_NODE && marker.textContent === HYDRATE_MARKER_TEXT) {
      this.dropNode(hydrationContext)
    }
  }

  // Retain only what is needed for future updates
  protected resolveChild(
    child: NodeController, isStateController: boolean,
  ): ChildNode | ChildNode[] {
    if (child.flg & CONTROLLER_FLAG_OPAQUE_SUBTREE || child.catchParams !== undefined) {
      return child
    }
    if (child.el) {
      if (!child.subs) {
        if (!child.c?.some(isNodeController)) {
          // Collapsed to child element
          child.c = undefined
          return child.el
        }
        const only = child.c
        if (this.el && only.length === 1 && only[0] instanceof NodeController && only[0].el) {
          // Collapsed to only grandchild element
          only[0].par = this
          child.c = undefined
          return only[0]
        }
      }
      return child
    }
    if (isStateController) {
      if (!child.subs && child.c?.length === 1) {
        // Collapse to only grandchild
        const only = child.c[0]!
        if (only instanceof NodeController) {
          // Recurse, may collapse further
          only.par = this
          return this.resolveChild(only, isStateController)
        }
        return only
      }
      return child
    }
    const spliced = child.c!
    for (const c of spliced) {
      if (c instanceof NodeController) c.par = this
    }
    return spliced
  }

  protected addChildren(
    DOMContext: FindNodeResult, hydrationContext?: HydrationContext,
    stateContext?: NodeController, namedStates?: Record<PropertyKey, State>, level = 1,
  ): number {
    const children = this.c!
    if (!children.length) return this.getParallelNodeCount(0)
    const isStateController = !!(this.flg & CONTROLLER_FLAG_IS_STATE_CONTROLLER)
    const unsafeJunctions = children.length > 1 && this.ctx?.md !== MODE_CSR
      ? computeUnsafeJunctions(children.map(this.classifyChild, this))
      : undefined
    let nodeCount = 0
    let junctionIndex = 0
    for (let i = 0; i < children.length; i++) {
      let child: ChildNode = children[i]!
      const controllerChild = child instanceof NodeController ? child : undefined
      if (unsafeJunctions?.[junctionIndex++]) {
        if (this.ctx!.md === MODE_RENDER) {
          DOMContext.p!.insertBefore(this.ctx!.doc!.createComment(HYDRATE_MARKER_TEXT), DOMContext.n as Node)
        } else if (hydrationContext) {
          // Hydration mirrors the render pass: the marker is consumed exactly where it was
          // written, so each child starts at its own content instead of the previous child's.
          this.crossJunction(hydrationContext)
        }
      }
      if (controllerChild) {
        const childStateContext = isStateController ? controllerChild : stateContext
        controllerChild.build(this, DOMContext, childStateContext, namedStates, hydrationContext, level + 1)
      }
      if (!controllerChild || controllerChild.el) {
        if (this.ctx?.md === MODE_HYDRATE) {
          if (child === TEXT_NODE) {
            // Nothing is skipped on the way in: the cursor already sits at this child's own
            // content, and anything it would skip past belongs to another child.
            if (hydrationContext!.nxt?.nodeType === Node.TEXT_NODE) {
              child = hydrationContext!.nxt as Text
              hydrationContext!.nxt = hydrationContext!.nxt!.nextSibling
            } else {
              // No content of its own, because adjacent static text needs no marker between it
              // and so came back merged into an earlier sibling's node (see computeUnsafeJunctions).
              // An empty node here keeps one node per child, which is what later updates index by,
              // and leaves the text exactly as the server wrote it.
              const emptyText = document.createTextNode('')
              DOMContext.p!.insertBefore(emptyText, hydrationContext!.nxt ?? null)
              child = emptyText
            }
          }
        } else {
          DOMContext.p!.insertBefore(
            controllerChild?.el ?? (child as Node),
            DOMContext.n as Node,
          )
        }
      }
      if (controllerChild) {
        const resolved = this.resolveChild(controllerChild, isStateController)
        if (isArray(resolved)) {
          children.splice(i, 1, ...resolved)
          i += resolved.length - 1
          for (const r of resolved) {
            nodeCount += getNodeCount(r as TreeNode)
          }
        } else {
          nodeCount += getNodeCount(resolved as TreeNode)
          children[i] = resolved
        }
      } else {
        nodeCount++
        children[i] = child
      }
    }
    return this.getParallelNodeCount(nodeCount)
  }

  protected getParallelNodeCount(childrenNodeCount: number): number {
    return this.el ? 1 : childrenNodeCount
  }

  protected updateNodeCount(newCount: number) {
    const diff = newCount - this.nc
    this.nc = newCount
    if (!diff) return
    for (let c = this.par; c && !c.getMountElement(); c = c.par) {
      c.nc += diff
    }
  }

  protected enclosingMountElement(): Node | undefined {
    let c = this.par
    while (c && !c.getMountElement()) c = c.par
    return c?.getMountElement()
  }

  protected handleReactiveError(e: unknown): void {
    let current: unknown = e
    if (this.catchParams) {
      current = this.triggerCatch(current)
      if ((current as RenderError).propagationStopped) return
    }
    for (let c = this.par; c; c = c.par) {
      if (c.catchParams) {
        current = c.triggerCatch(current)
        if ((current as RenderError).propagationStopped) return
      }
    }
    // If `current` never became a RenderError, no boundary anywhere handled it
    if (!(current instanceof RenderError)) throw current
  }

  addCleanup(fn: () => void) {
    // A literal holds exactly one entry, where pushing to [] would allocate room for many
    if (this.subs) this.subs.push(fn)
    else this.subs = [fn]
  }

  protected addSub(transform: CallbackTransform, target: NodeController = this) {
    if (this.ctx?.md === MODE_RENDER) return
    transform.subTo(transform.srcLs)
    if (target.subs) target.subs.push(transform)
    else target.subs = [transform]
  }

  protected unsubscribeAll() {
    if (!this.subs) return
    for (const sub of this.subs) typeof sub === 'function' ? sub() : sub.uns(sub.srcLs)
    this.subs = undefined
  }

  remove(removeNode = true) {
    this.unsubscribeAll()
    this.removeChildren(removeNode && !this.el)
    if (removeNode) {
      if (this.el?.parentNode) this.el.remove()
      this.el = undefined
    }
  }

  removeChildren(removeNodes = true) {
    for (const child of this.c ?? []) {
      if (child instanceof NodeController) {
        child.remove(removeNodes)
      } else if (removeNodes && isDOMNode(child)) {
        child.parentNode?.removeChild(child)
      }
    }
    if (removeNodes) this.c = undefined
  }

  findNode(
    referenceNode: ChildNode, nodeIndex = 0, startChildIndex = 0,
    startNode?: Node | null, startNodeIndex = 0,
  ): FindNodeResult {
    for (let childIndex = startChildIndex; childIndex < this.c!.length; childIndex++) {
      const child = this.c![childIndex]
      if (child === referenceNode) {
        const mountElement = this.getMountElement()
        if (mountElement) {
          nodeIndex += this.pnc
          return {
            p: mountElement,
            n: liveChildNodeAt(mountElement, nodeIndex, startNode, startNodeIndex),
            i: nodeIndex,
            s: childIndex,
          }
        }
        const result = this.par!.findNode(this, nodeIndex, 0, startNode, startNodeIndex)
        result.s = childIndex
        return result
      }
      nodeIndex += getNodeCount(child as TreeNode)
    }
    /* v8 ignore next */
    throw Error(DEV ? 'Internal unexpected error.' : undefined)
  }
}

NodeController.prototype.flg = 0
NodeController.prototype.pnc = 0
