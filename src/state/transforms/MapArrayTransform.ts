import { DEV } from '@/common/dev.js'
import type { AnyState, IState, State } from '../types/types.js'
import { TRANSFORM_FLAG_REBUILDS_CHILDREN, Transform, nextRunId } from './Transform.js'
import { getLightState, state } from '../state.js'
import { promoteMemberToStateLightState, refresh, updateValue } from '../stateInternals/stateUpdate.js'
import { transforms } from './transforms.js'
import { LightState } from '@/state/stateInternals/LightState.js'
import { isArray } from '@/common/shorthands.js'

// Moved elements are found with indexOf until this many have been looked up, then with a map
const MAX_LINEAR_LOOKUPS = 2

export class MapArrayTransform extends Transform {
  declare protected srcLs: LightState<Array<unknown>>
  // The source elements of the previous run, after promotion, aligned with the previous results: an
  //   element that survives an update reuses its already-mapped result instead of being remapped
  private previousElements?: unknown[]
  // The index states passed to the map function, aligned with the previous results
  private previousIndexStates?: State<number>[]

  override execute() {
    this.runId = nextRunId()
    refresh(this.srcLs)
    const is = this.srcLs.v
    if (!isArray(is)) {
      // Covered by buildtest, undetected by vite coverage
      /* v8 ignore else */
      if (DEV) throw TypeError('Cannot apply map function to non-array value')
      /* v8 ignore next */
      throw TypeError(undefined)
    }
    const sourceProxy = this.srcLs.prx! as unknown as State<IState[]>
    const previousResults = this.tgt ? this.tgt.v as AnyState[] : []
    const previousElements = this.previousElements ?? []
    const previousIndexStates = this.previousIndexStates
    const srcFunction = getLightState(this.hookFunction)
    const passesIndex = this.hookFunction!.length > 1
    const indexStates: State<number>[] | undefined = passesIndex ? [] : undefined
    // With an unchanged length, only the results of elements that changed position need writing
    const sameLength = previousElements.length === is.length
    const r: unknown[] = sameLength ? previousResults.slice() : []
    let previousPositionsByElement: Map<unknown, number> | undefined
    let lookupCount = 0
    let expectedPreviousPosition = 0
    for (let i = 0; i < is.length; i++) {
      const element = is[i]
      let previousPosition: number
      if (typeof element !== 'function') {
        // Mapping promotes every element to a state, so anything else has not been mapped before
        previousPosition = -1
      } else if (element === previousElements[expectedPreviousPosition]) {
        previousPosition = expectedPreviousPosition++
      } else if (element === previousElements[expectedPreviousPosition + 1]) {
        // The element expected at this position was removed, or moved
        previousPosition = expectedPreviousPosition + 1
        expectedPreviousPosition += 2
      } else {
        previousPosition = lookupCount++ < MAX_LINEAR_LOOKUPS
          ? previousElements.indexOf(element)
          : (previousPositionsByElement ??= new Map(previousElements.map((e, position) => [e, position])))
              .get(element) ?? -1
        // Several removed elements are passed by resuming the alignment after the found one
        if (previousPosition >= expectedPreviousPosition
          && is[i + 1] === previousElements[previousPosition + 1]) {
          expectedPreviousPosition = previousPosition + 1
        }
      }
      if (previousPosition < 0) {
        r[i] = this.mapElement(i, element, srcFunction, passesIndex ? sourceProxy : undefined, indexStates)
        continue
      }
      if (!sameLength || previousPosition !== i) r[i] = previousResults[previousPosition]
      if (indexStates) {
        const indexState = previousIndexStates![previousPosition]!
        if (previousPosition !== i) indexState.set(i)
        indexStates[i] = indexState
      }
    }
    this.previousElements = is.slice()
    this.previousIndexStates = indexStates
    if (this.tgt) {
      updateValue(this.tgt, r)
    } else {
      this.tgt = getLightState(state(r))
    }
    this.tgt!.srcs = this.srcLs
    this.tgt!.tf = this
    return this.tgt!.prx as State
  }

  private mapElement(
    i: number, element: unknown, srcFunction: LightState | undefined,
    sourceProxy: State<IState[]> | undefined, indexStates: State<number>[] | undefined,
  ) {
    const is = this.srcLs.v as unknown as Record<PropertyKey, unknown>
    const v = typeof element === 'function' ? element : promoteMemberToStateLightState(this.srcLs, is, i).prx
    let args: [unknown] | [unknown, State<number>, unknown[]]
    if (indexStates) {
      const indexState = state(i) as State<number>
      indexStates[i] = indexState
      args = [v, indexState, sourceProxy as unknown[]]
    } else {
      args = [v]
    }
    const row = new transforms.MapValueTransform(srcFunction, this.hookFunction!, args)
    // Whatever the row creates is owned by this map's run
    row.runId = this.runId
    return row.execute()
  }
}

MapArrayTransform.prototype.flg = TRANSFORM_FLAG_REBUILDS_CHILDREN

transforms.MapArrayTransform = MapArrayTransform
