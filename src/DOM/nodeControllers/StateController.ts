import {
  CONTROLLER_FLAG_IS_ELEMENT,
  CONTROLLER_FLAG_IS_STATE_CONTROLLER, CONTROLLER_FLAG_OPAQUE_SUBTREE, MODE_RENDER, NodeController,
} from './NodeController.js'
import type { State, StateType } from '@/state/types/types.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { TRANSFORM_FLAG_REBUILDS_CHILDREN, type Transform } from '@/state/transforms/Transform.js'
import { CallbackTransform } from '@/state/transforms/CallbackTransform.js'
import type { ChildProp, FindNodeResult, HydrationContext, NodeArguments, TreeNode } from '../types.js'
import { refresh } from '@/state/stateInternals/internalFunctions.js'
import { isAnyState, lightState } from '@/state/state.js'
import { registerFlushPendingWork } from '@/state/stateInternals/notify.js'
import { getStateType, markPromotedElement } from '@/state/common/refCountAndType.js'
import { computeMutation } from '@/common/computeMutation.js'
import { getNodeCount } from '../util/nodeCount.js'
import { adoptDeferredNode, clearDrainedDeferredNodes, deferNode, liveChildNodeAt, swapDeferredNodes }
  from '../util/deferredNodes.js'
import { supportsMoveBefore } from '../util/moveBeforeSupport.js'
import { STATE_ARRAY, STATE_NULLISH_PRIMITIVE, STATE_PRIMITIVE }
  from '@/state/stateInternals/internalFunctions.js'
import { isArray } from '@/common/shorthands.js'

type NodeStateType = StateType | typeof STATE_NULLISH_PRIMITIVE
const stateControllerMap = new Map<LightState, StateController>()

// array elements must be anyState to maintain reactivity
const promoteArrayElements = (arr: unknown[]): unknown[] => {
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i]
    // Nested arrays are left raw so parseArgsRecursive still flattens them (their inner states are
    //   reused by previousStateControllers across updates); a state is already reactive.
    if (isAnyState(el) || isArray(el)) continue
    const ls = lightState(el)
    markPromotedElement(ls)
    arr[i] = ls
  }
  return arr
}

// _keptChildren_ is the children retained from oldChildren
const getKeptChildren = (newChildren: TreeNode[], mutation: ReturnType<typeof computeMutation<TreeNode>>) => {
  let keptChildren = newChildren
  if (mutation.added!.length) {
    const add = mutation.added!
    keptChildren = []
    let k = 0
    let lo = add[k++]!
    let hi = k < add.length && add[k]! < 0 ? -1 - add[k++]! : lo
    for (let i = 0; i < newChildren.length; i++) {
      if (i > hi && k < add.length) {
        lo = add[k++]!
        hi = k < add.length && add[k]! < 0 ? -1 - add[k++]! : lo
      }
      if (i < lo || i > hi) keptChildren.push(newChildren[i]!)
    }
  }
  return keptChildren
}

export class StateController extends NodeController {
  private nst?: NodeStateType
  private nxt?: Node | null
  private insertionParent?: { p: Node, n: Node | null, i: number }
  private nestLevel = 1
  private namedStates?: Record<PropertyKey, State>

  // Movable children that a container removed, and can be adopted
  private static pendingDestroy = new Set<Node | NodeController>()
  private static idleDestroy = new Set<Node | NodeController>()

  // Elements whose entire content is a cleared movable container, to be emptied all at once
  private static pendingClears = new Map<StateController, Node>()
  private static idleClears = new Map<StateController, Node>()

  // Callbacks that must run once this flush's whole tree has finished being built and attached
  // (e.g. an element's nodeInserted/autofocus effects, which need real document connectedness)
  private static pendingCalls = new Set<() => void>()
  private static idleCalls = new Set<() => void>()

  // The previous children's StateControllers, indexed by state only once parseArgs looks one up
  private static previousStateControllers = {
    prev: [] as TreeNode[],
    indexed: false,
    lookup(ls: LightState): StateController | undefined {
      if (!this.indexed) {
        for (const child of this.prev) {
          if (child instanceof StateController) stateControllerMap.set(child.def as LightState, child)
        }
        this.indexed = true
      }
      return stateControllerMap.get(ls)
    },
  }

  // Wrapper StateControllers currently mounted as a movable child of some container
  private static movableControllersByDef = new Map<LightState, StateController>()

  get tfm(): Transform | undefined {
    return (this.def as LightState).tf
  }

  override build(
    parentController?: NodeController, DOMContext?: FindNodeResult,
    stateContext?: NodeController, namedStates?: Record<PropertyKey, State>,
    hydrationContext?: HydrationContext, level = 1,
  ) {
    super.build(parentController, DOMContext, stateContext, namedStates, hydrationContext, level)
    StateController.registerMovableChildren(this)
  }

  override remove(removeNode = true) {
    const def = this.def as LightState
    if (StateController.movableControllersByDef.get(def) === this)
      StateController.movableControllersByDef.delete(def)
    super.remove(removeNode)
  }

  private static registerMovableChildren(sc: StateController) {
    if (sc.nst !== STATE_ARRAY || sc.ctx?.md === MODE_RENDER || !sc.hasMovableChildren()) return
    for (const child of sc.c!) {
      if (child instanceof StateController) {
        StateController.movableControllersByDef.set(child.def as LightState, child)
      }
    }
  }

  // Detach a wrapper about to be adopted from its current container
  private static detachFromDonor(donor: NodeController, gainer: StateController) {
    const donorPar = donor.par
    if (!(donorPar instanceof StateController) || donorPar === gainer || !donorPar.c) return
    const dc = donorPar.c as TreeNode[]
    const di = dc.indexOf(donor)
    dc.splice(di, 1)
    donorPar.updateNodeCount(donorPar.nc - getNodeCount(donor))
  }

  private hasMovableChildren(): boolean {
    return !!(this.par && (this.par.flg & CONTROLLER_FLAG_IS_ELEMENT))
  }

  static registerPendingCall(fn: () => void) {
    StateController.pendingCalls.add(fn)
  }

  // Destroy any non-adopted removed movable nodes, then run any callbacks deferred until this
  // flush's tree is fully built and attached. Two independent blocks, each swap-then-drain, so a
  // callback that triggers a nested flush can't corrupt the set this pass is still iterating.
  static flushPendingWork() {
    const clears = StateController.pendingClears
    if (clears.size) {
      StateController.pendingClears = StateController.idleClears
      StateController.idleClears = clears
      for (const [sc, el] of clears) sc.detachCleared(el)
      clears.clear()
    }
    const pending = StateController.pendingDestroy
    if (pending.size) {
      StateController.pendingDestroy = StateController.idleDestroy
      StateController.idleDestroy = pending
      swapDeferredNodes()
      for (const child of pending) {
        if (child instanceof Node) child.parentNode?.removeChild(child)
        else child.remove()
      }
      pending.clear()
      clearDrainedDeferredNodes()
    }
    const calls = StateController.pendingCalls
    if (calls.size) {
      StateController.pendingCalls = StateController.idleCalls
      StateController.idleCalls = calls
      for (const fn of calls) fn()
      calls.clear()
    }
  }

  protected buildNode(
    _properties: unknown,
    namedStates?: Record<PropertyKey, State>,
    _stateContext?: NodeController,
    _hydrationContext?: unknown,
    level = 1,
  ) {
    this.nestLevel = level
    this.namedStates = namedStates
    const is = this.def as LightState
    refresh(is)
    const tf = is.tf
    // Remounted after its controller was removed: only its transform can create it again
    if (tf && tf.flg & TRANSFORM_FLAG_REBUILDS_CHILDREN && is.v instanceof NodeController && is.v.isSpent()) {
      tf.execute()
    }
    const value = is.v
    if (typeof value === 'string' || typeof value === 'number') this.c = [this.createTextChild(value)]
    else this.parseArgs(this.childArgs(value) as NodeArguments)
    this.addSub(
      new CallbackTransform<unknown, StateController>(is, StateController.stateChanged, this, this.nestLevel),
    )
    this.nst = this.checkNodeStateType()
  }

  private childArgs(value: unknown): ChildProp[] {
    if (!isArray(value)) return [value as ChildProp]
    // An element of a derived array can only be replaced by the array being rebuilt
    return ((this.def as LightState).tf ? value : promoteArrayElements(value)) as ChildProp[]
  }

  private checkNodeStateType(): NodeStateType {
    const state = this.def as LightState
    const stateType = getStateType(state)
    return stateType !== STATE_PRIMITIVE
      ? stateType
      : state.v == null
        ? STATE_NULLISH_PRIMITIVE
        : STATE_PRIMITIVE
  }

  private static stateChanged(_value: unknown, sc?: StateController) {
    sc!.onStateChange()
  }

  private onStateChange() {
    try {
      this.updateBody()
    } catch (e) {
      this.handleReactiveError(e)
    }
  }

  private updateBody() {
    const definition = (this.def as LightState).v as ChildProp
    const oldNodeStateType = this.nst
    this.nst = this.checkNodeStateType()
    const node = this.c![0] as Text
    if (node && oldNodeStateType === STATE_PRIMITIVE && this.nst === STATE_PRIMITIVE) {
      node.textContent = String(definition)
      return
    }
    const pendingClear = StateController.pendingClears.get(this)
    if (pendingClear) {
      StateController.pendingClears.delete(this)
      this.detachCleared(pendingClear)
    }
    if (oldNodeStateType === STATE_ARRAY && this.nst === STATE_ARRAY
      && !(definition as ChildProp[]).length && this.clearAll()) return
    // An array on either side is reconciled through the diffing path, not a teardown, whenever the
    //   two sides agree or this container's children are movable -- so an item leaving the last slot
    //   of a list wrapped in .or() is still handed to (not rebuilt by) the container it moves to.
    if ((oldNodeStateType === STATE_ARRAY || this.nst === STATE_ARRAY)
      && (oldNodeStateType === this.nst || this.hasMovableChildren())) {
      // parseArgs replaces this.c, so the previous children are diffed without copying them
      const oldChildren = this.c as TreeNode[]
      const pos = this.par!.findNode(this)
      this.nxt = liveChildNodeAt(pos.p, pos.i + this.nc, pos.n, pos.i)
      const previousStateControllers = StateController.previousStateControllers
      previousStateControllers.prev = oldChildren
      previousStateControllers.indexed = false
      this.parseArgs(this.childArgs(definition), previousStateControllers)
      previousStateControllers.prev = []
      stateControllerMap.clear()
      let fnr = { i: 0, s: 0 } as FindNodeResult
      // Cursor for skipping nodes in deferred removal in the same pass as the loop
      let cursorNode: Node | null | undefined
      let cursorNodeIndex = 0
      const children = this.c! as TreeNode[]
      let newNodeCount = 0
      let firstChange: number | undefined
      let lastChange = 0
      let changedCount = 0
      const movable = this.hasMovableChildren()
      const registersMovableChildren = movable && this.nst === STATE_ARRAY && this.ctx?.md !== MODE_RENDER
      for (let idx = 0; idx < children.length; idx++) {
        let child = children[idx]
        if (child instanceof NodeController) {
          if (child.par !== this) {
            const donor = movable && child instanceof StateController && !child.par
              ? StateController.movableControllersByDef.get(child.def as LightState)
              : undefined
            if (donor) {
              // Switch the newly created StateController for the donor
              StateController.pendingDestroy.delete(donor)
              for (const n of this.getNodes(donor)) adoptDeferredNode(n)
              StateController.detachFromDonor(donor, this)
              donor.par = this
              child = children[idx] = donor
            } else if (movable && !(child instanceof StateController) && child.isMounted()
              && this.adoptBareChild(child)) {
              // Mounted by another container, which removed it or has yet to
            } else if (child.flg & CONTROLLER_FLAG_IS_ELEMENT) {
              // An element mounts its content in itself, so it needs no position to create
              child.build(this, undefined, child, this.namedStates, undefined, this.nestLevel + 1)
              if (cursorNode !== undefined) cursorNodeIndex += getNodeCount(child)
            } else {
              fnr = this.findNode(child, fnr.i, fnr.s, cursorNode, cursorNodeIndex)
              child.build(this, fnr, child, this.namedStates, undefined, this.nestLevel + 1)
              cursorNode = fnr.n
              cursorNodeIndex = fnr.i + getNodeCount(child)
            }
          }
          children[idx] = this.resolveChild(child, true) as TreeNode
        }
        const resolvedChild = children[idx]!
        if (registersMovableChildren && resolvedChild instanceof StateController) {
          StateController.movableControllersByDef.set(resolvedChild.def as LightState, resolvedChild)
        }
        newNodeCount += getNodeCount(resolvedChild)
        if (resolvedChild !== oldChildren[idx]) {
          firstChange ??= idx
          lastChange = idx
          changedCount++
        }
      }
      const newChildren = children
      const sameLength = newChildren.length === oldChildren.length
      const mutation = computeMutation<TreeNode>(oldChildren, newChildren, {
        pre: firstChange ?? newChildren.length,
        suf: sameLength ? newChildren.length - 1 - lastChange : undefined,
        changedCount: sameLength ? changedCount : undefined,
      })
      this.applyMutation(mutation, oldChildren, newChildren)
      this.updateNodeCount(newNodeCount)
      return
    }
    this.removeChildren()
    this.parseArgs(
      this.childArgs(definition),
    )
    this.updateNodeCount(
      this.addChildren(
        this.par!.findNode(this), undefined, undefined, this.namedStates, this.nestLevel,
      ),
    )
    StateController.registerMovableChildren(this)
  }

  // Detaches every child at once when this container is all of an element's content. A movable
  //   container's children stay attached, so they can still be adopted, until flushPendingWork.
  private clearAll(): boolean {
    if (!this.nc || this.ctx?.md === MODE_RENDER) return false
    if (this.hasMovableChildren()) {
      const el = this.par!.el!
      if (!this.par!.isSoleChild(this) || el.childNodes.length !== this.nc) return false
      for (const child of this.c as TreeNode[]) {
        StateController.pendingDestroy.add(child)
        if (child instanceof NodeController) child.par = undefined
      }
      StateController.pendingClears.set(this, el)
    } else {
      const el = this.enclosingMountElement()
      if (el?.childNodes.length !== this.nc) return false
      el.textContent = ''
      this.removeChildren(false)
    }
    this.c = []
    this.updateNodeCount(0)
    return true
  }

  private detachCleared(el: Node) {
    el.textContent = ''
  }

  private adoptBareChild(child: NodeController): boolean {
    const held = child.heldForm()
    if (!StateController.pendingDestroy.delete(held)) {
      const owner = child.par
      if (!(owner instanceof StateController) || owner === this || !owner.hasMovableChildren()) return false
      const oc = owner.c as TreeNode[]
      oc.splice(oc.indexOf(held), 1)
      owner.updateNodeCount(owner.nc - getNodeCount(held))
    }
    for (const n of this.getNodes(held)) adoptDeferredNode(n)
    child.par = this
    return true
  }

  private detachChild(children: TreeNode[], i: number) {
    const child = children[i]!
    if (!this.hasMovableChildren()) {
      if (child instanceof Node) child.parentNode?.removeChild(child)
      else (child as NodeController).remove()
      return
    }
    StateController.pendingDestroy.add(child)
    if (child instanceof Node) deferNode(child)
    else for (const n of this.getNodes(child)) deferNode(n)
    // Child must be orphaned so it is recreated if reinstalled
    if (child instanceof NodeController) child.par = undefined
  }

  private insertChild(children: TreeNode[], i: number) {
    const child = children[i]!
    this.insertionParent ??= this.par!.findNode(this)
    const parent = this.insertionParent.p as Element & {
      moveBefore?: (node: Node, ref: Node | null) => void
    }
    const ref = this.nextDomNode(children, i)
    const node = child instanceof NodeController ? child.el : child
    if (node) StateController.insertNode(parent, node, ref)
    else for (const childNode of this.getNodes(child)) StateController.insertNode(parent, childNode, ref)
  }

  private static insertNode(
    parent: Element & { moveBefore?: (node: Node, ref: Node | null) => void }, node: Node, ref: Node | null,
  ) {
    if (node.parentNode !== parent || node.nextSibling !== ref) {
      if (supportsMoveBefore && node.parentNode) parent.moveBefore!(node, ref)
      else parent.insertBefore(node, ref)
    }
  }

  private moveChild(children: TreeNode[], i: number) {
    const child = children[i]!
    this.insertionParent ??= this.par!.findNode(this)
    const parent = this.insertionParent.p as Element & {
      moveBefore?: (node: Node, ref: Node | null) => void
    }
    const ref = this.nextDomNode(children, i)
    for (const childNode of this.getNodes(child)) {
      if (supportsMoveBefore) parent.moveBefore!(childNode, ref)
      else parent.insertBefore(childNode, ref)
    }
  }

  // The first node after _children[i]_, skipping following children that render no nodes
  private nextDomNode(children: TreeNode[], i: number): Node | null {
    for (let j = i + 1; j < children.length; j++) {
      if (getNodeCount(children[j]!)) return this.getFirstNode(children[j]!)!
    }
    return this.nxt ?? null
  }

  private mutateRange(
    children: TreeNode[],
    range: number[] | undefined,
    operator: (children: TreeNode[], i: number) => void,
  ) {
    if (!range) return
    // _range_ is an ascending run-length encoding ([lo, -1 - hi] for a run, [lo] for a single). Walk it
    //   backwards and apply from the highest index down so earlier indices are unaffected by later ops.
    let hi = -1
    for (let k = range.length - 1; k >= 0; k--) {
      const e = range[k]!
      if (e < 0) {
        hi = -1 - e
      } else {
        for (let j = hi < 0 ? e : hi; j >= e; j--) operator.call(this, children, j)
        hi = -1
      }
    }
  }

  private applyMutation(mutation: ReturnType<typeof computeMutation<TreeNode>>,
    oldChildren: TreeNode[],
    newChildren: TreeNode[]) {
    this.mutateRange(oldChildren, mutation.removed, this.detachChild)
    if (mutation.moved) {
      this.mutateRange(getKeptChildren(newChildren, mutation), mutation.moved, this.moveChild)
    }
    this.mutateRange(newChildren, mutation.added, this.insertChild)
    this.insertionParent = undefined
    this.nxt = undefined
  }
}

StateController.prototype.flg = CONTROLLER_FLAG_IS_STATE_CONTROLLER | CONTROLLER_FLAG_OPAQUE_SUBTREE

registerFlushPendingWork(StateController.flushPendingWork)
