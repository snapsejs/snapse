import { LightState } from '@/state/stateInternals/LightState.js'
import { getStateType } from '@/state/common/refCountAndType.js'
import { STATE_ARRAY, STATE_POJO } from '@/state/stateInternals/internalFunctions.js'
import { destate } from '@/state/state.js'
import { isPOJO } from '@/common/util.js'
import { computeMutation } from '@/common/computeMutation.js'
import { decodeAscendingRLE } from '@/common/undoUtils.js'
import type { ChangeRecord } from '@/state/types/types.js'
import { TRANSFORM_FLAG_CREATE_LIGHT_STATE, Transform, acquireSet, releaseSet } from './Transform.js'
import { getSubState } from './SubscribeTransform.js'
import { isArray } from '@/common/shorthands.js'

const deepDestate = (value: unknown): unknown => {
  const raw = destate(value)
  if (isArray(raw)) return raw.map(deepDestate)
  if (isPOJO(raw)) return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, deepDestate(v)]))
  return raw
}

export class ChangeAggregateTransform extends Transform {
  declare protected srcLs: LightState
  private readonly parent: ChangeAggregateTransform | undefined
  private pathKey: string | number
  private readonly changes: ChangeRecord[]
  private readonly containerChildren: Map<LightState, ChangeAggregateTransform>
  private readonly leafValues: Map<LightState, unknown>
  private previousArrayChildren: LightState[] | undefined
  private seq = 0
  // A field rather than an assignment to the prototype, which would keep this class in every bundle
  override flg = TRANSFORM_FLAG_CREATE_LIGHT_STATE

  static forState(ls: LightState): LightState {
    return new ChangeAggregateTransform(ls, undefined, '', [], new Map(), new Map(), false).tgt!
  }

  constructor(
    source: LightState, parent: ChangeAggregateTransform | undefined, key: string | number,
    changes: ChangeRecord[],
    containerChildren: Map<LightState, ChangeAggregateTransform>, leafValues: Map<LightState, unknown>,
    addChanges = true,
  ) {
    super(source)
    this.parent = parent
    this.pathKey = key
    this.changes = changes
    this.containerChildren = containerChildren
    this.leafValues = leafValues
    this.execute(addChanges)
  }

  private buildPath(extra?: string | number): (string | number)[] {
    const segments: (string | number)[] = extra !== undefined ? [extra] : []
    if (this.parent) segments.unshift(this.pathKey)
    let node = this.parent
    while (node?.parent) {
      segments.unshift(node.pathKey)
      node = node.parent
    }
    return segments
  }

  drain(): ChangeRecord[] {
    const records = this.changes.slice()
    this.changes.length = 0
    return records
  }

  override execute(addChanges = true) {
    const sources = acquireSet()
    sources.add(this.srcLs)
    const stateType = getStateType(this.srcLs)
    const isArray = stateType === STATE_ARRAY
    const parent = this.srcLs.v as Record<PropertyKey, unknown>
    const keys = Object.keys(parent)
    const currentChildren: LightState[] = []
    let childReplaced = false
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      const childLs = getSubState(this.srcLs, key)!
      if (isArray) {
        currentChildren.push(childLs)
        childReplaced ||= this.previousArrayChildren?.[i] !== childLs
      }
      const childType = getStateType(childLs)
      if (childType === STATE_ARRAY || childType === STATE_POJO) {
        let childContainer = this.containerChildren.get(childLs)
        if (childContainer) {
          if (isArray) childContainer.pathKey = key
        } else {
          childContainer = new ChangeAggregateTransform(
            childLs,
            this,
            key,
            this.changes,
            this.containerChildren,
            this.leafValues,
            addChanges && !isArray,
          )
          this.containerChildren.set(childLs, childContainer)
        }
        sources.add(childContainer.tgt!)
      } else {
        const cur = destate(childLs)
        const had = this.leafValues.has(childLs)
        const prev = this.leafValues.get(childLs)
        if (addChanges && ((had && !Object.is(prev, cur)) || (!had && !isArray)))
          // eslint-disable-next-line @stylistic/quote-props
          this.changes.push({ 'path': this.buildPath(key), 'value': cur, 'oldValue': prev })
        this.leafValues.set(childLs, cur)
        sources.add(childLs)
      }
    }
    if (isArray && (childReplaced || keys.length != this.previousArrayChildren?.length)) {
      this.handleArrayMutation(currentChildren, addChanges)
    }
    this.updateTarget(this.seq++, sources)
    releaseSet(sources)
  }

  handleArrayMutation(currentChildren: LightState[], addChanges: boolean) {
    const previousChildren = this.previousArrayChildren ?? []
    const mutation = computeMutation(previousChildren, currentChildren)
    if (addChanges) {
      const addedValues: unknown[] = []
      for (const i of decodeAscendingRLE(mutation.added)) {
        const ls = currentChildren[i]!
        const containerChild = this.containerChildren.get(ls)
        addedValues.push(containerChild ? deepDestate(containerChild.srcLs.v) : this.leafValues.get(ls))
      }
      const removedValues: unknown[] = []
      for (const i of decodeAscendingRLE(mutation.removed)) {
        const ls = previousChildren[i]!
        const child = this.containerChildren.get(ls)
        removedValues.push(child ? deepDestate(child.srcLs.v) : this.leafValues.get(ls))
      }
      /* eslint-disable @stylistic/quote-props */
      const record: ChangeRecord = {
        'path': this.buildPath(),
        'reorder': true,
        'prefixL': mutation.pre,
        'suffixL': mutation.suf,
        'addedValues': addedValues,
        'removedValues': removedValues,
      }
      /* eslint-enable @stylistic/quote-props */
      if (mutation.removed !== undefined) record['remove'] = mutation.removed
      if (mutation.added !== undefined) record['add'] = mutation.added
      if (mutation.kept !== undefined) record['common'] = mutation.kept
      this.changes.push(record)
    }
    for (const i of decodeAscendingRLE(mutation.removed)) {
      const ls = previousChildren[i]!
      this.containerChildren.delete(ls)
      this.leafValues.delete(ls)
    }
    this.previousArrayChildren = currentChildren
  }
}
