import { peek, state } from '../state/state.js'
import { subscribeChanges } from '../state/subscribeChanges.js'
import { flush } from '../state/stateInternals/notify.js'
import { decodeAscendingRLE } from '../common/undoUtils.js'
import type { ArrayState, ChangeRecord, ObjectState, SomeState, State } from '../state/types/types.js'
import { isArray } from '@/common/shorthands.js'
export type { ChangeRecord } from '../state/types/types.js'

export type HistoryEntry = { batch: ChangeRecord[], t: number }
type ContainerState = ObjectState<unknown> | ArrayState<unknown>
type TrackHistoryOptions = { limit?: number, addHistoryVersion?: () => number }

const flushRun = (out: number[], lo: number, hi: number) => {
  out.push(lo)
  if (hi > lo) out.push(-1 - hi)
}
// Encode a plain array of non-negative integers as ascending RLE
const encodeAscendingRLE = (values: number[]): number[] => {
  const out: number[] = []
  let lo = -1
  let hi = -2
  for (const v of values) {
    if (v < 0) return values
    if (v !== hi + 1) {
      if (lo >= 0) flushRun(out, lo, hi)
      lo = v
    }
    hi = v
  }
  flushRun(out, lo, hi)
  return out
}

const stripDefaults = (change: ChangeRecord) => {
  for (const k in change) {
    // `value`/`oldValue` carry the leaf's new/previous value verbatim; a falsy one (0, '',
    // false, null) is real data the undo/redo replay must restore, not a default to drop.
    if (k === 'value' || k === 'oldValue') continue
    const v = change[k as keyof ChangeRecord]
    if (!v || (isArray(v) && v.length === 0)) delete change[k as keyof ChangeRecord]
  }
}

export class TrackHistory<S extends SomeState> {
  private readonly tracked: S
  private readonly opts?: TrackHistoryOptions
  private readonly undoStack: HistoryEntry[] = []
  private readonly redoStack: HistoryEntry[] = []
  private batch: ChangeRecord[] = []
  private applying = false
  private batching = false
  private readonly unsub: () => void

  undoEmpty: State<boolean>
  redoEmpty: State<boolean>
  historyVersions: State<number[]>

  private onChange = (_v: unknown, change?: ChangeRecord) => {
    if (this.applying || !change) return
    stripDefaults(change)
    if (change.common) change.common = encodeAscendingRLE(change.common)
    if (this.batch.length === 0 && this.redoStack.length) {
      this.redoStack.length = 0
      this.updateDerivedState()
    }
    this.batch.push(change)
    if (this.batching || !change.done) return
    this.finalizeBatch()
  }

  private finalizeBatch() {
    if (!this.batch.length) return
    this.undoStack.push({ batch: this.batch, t: this.opts?.addHistoryVersion?.() ?? Date.now() })
    if (this.opts?.limit && this.undoStack.length > this.opts.limit) this.undoStack.shift()
    this.batch = []
    this.updateDerivedState()
  }

  private updateDerivedState() {
    this.undoEmpty.set(this.undoStack.length === 0)
    this.redoEmpty.set(this.redoStack.length === 0)
    this.historyVersions.set(this.undoStack.map(entry => entry.t))
  }

  constructor(root: S, opts?: TrackHistoryOptions) {
    this.tracked = root
    this.opts = opts
    this.undoEmpty = state(true)
    this.redoEmpty = state(true)
    this.historyVersions = state<number[]>([])
    this.unsub = subscribeChanges(root, this.onChange)
  }

  private walkToNode(path: (string | number)[] = []) {
    let node = this.tracked as unknown as ObjectState<unknown>
    for (const key of path) node = node[key] as ObjectState<unknown>
    return node as ContainerState
  }

  private applyReorder(parent: State<unknown[]>, change: ChangeRecord, forward: boolean) {
    const src = peek(parent) as unknown[]
    // `change.common` (backward direction) indexes positions in the pre-removal array, but the
    //   Remove step below compacts `src` in place -- keep an uncompacted snapshot for that read.
    const uncompactedSrc = forward ? undefined : src.slice()
    const addValues = (forward ? change.addedValues : change.removedValues) as unknown[]
    const remove = forward ? change.remove : change.add
    const removedCount = (forward ? change.removedValues : change.addedValues)?.length ?? 0
    const afterLength = src.length - removedCount + (addValues?.length ?? 0)
    const prefixL = change.prefixL ?? 0
    const suffixL = change.suffixL ?? 0

    // Remove
    const rle = decodeAscendingRLE(remove)
    let skip = rle.next().value
    let j = 0
    for (let i = 0; i < src.length; i++) {
      while (i < (skip ?? src.length)) src[j++] = src[i++]
      skip = rle.next().value
    }
    const keptLength = j

    // Reorder
    let out: unknown[] = []
    if (change.common) {
      for (let p = 0; p < prefixL; p++) out[p] = src[p]
      let mid = prefixL
      if (forward) {
        for (const i of decodeAscendingRLE(change.common)) out[i] = src[mid++]
      } else {
        for (const i of decodeAscendingRLE(change.common)) out[mid++] = uncompactedSrc![i]
      }
      const suffixStart = forward ? afterLength - suffixL : mid
      for (let s = 0; s < suffixL; s++) out[suffixStart + s] = src[keptLength - suffixL + s]
    } else {
      out = src.slice()
    }

    // Add
    j = 0
    if (forward && change.common) {
      for (const i of decodeAscendingRLE(change.add)) out[i] = addValues[j++]
    } else {
      const spliceAt = decodeAscendingRLE(forward ? change.add : change.remove)
      for (const i of spliceAt) out.splice(i, 0, addValues[j++])
    }

    // Update
    out.length = afterLength
    parent.set(out)
  }

  private applyChange(change: ChangeRecord, forward: boolean) {
    if (change.reorder) {
      return this.applyReorder(this.walkToNode(change.path) as ArrayState<unknown>, change, forward)
    }
    const path = change.path!
    const parent = this.walkToNode(path.slice(0, -1)) as ObjectState<unknown>
    const key = path[path.length - 1]!
    parent[key] = forward ? change.value : change.oldValue
  }

  private replay(entry: HistoryEntry, forward: boolean) {
    this.applying = true
    if (forward) {
      for (const change of entry.batch) this.applyChange(change, true)
    } else {
      for (let i = entry.batch.length - 1; i >= 0; i--) this.applyChange(entry.batch[i]!, false)
    }
    flush()
    this.applying = false
  }

  undo = (): boolean => {
    const entry = this.undoStack.pop()
    if (!entry) return false
    this.replay(entry, false)
    this.redoStack.push(entry)
    this.updateDerivedState()
    return true
  }

  redo = (): boolean => {
    const entry = this.redoStack.pop()
    if (!entry) return false
    this.replay(entry, true)
    this.undoStack.push(entry)
    this.updateDerivedState()
    return true
  }

  restoreAt(timestamp: number): void {
    while (this.undoStack.length && this.undoStack[this.undoStack.length - 1]!.t > timestamp) {
      const entry = this.undoStack.pop()!
      this.replay(entry, false)
      this.redoStack.push(entry)
    }
    while (this.redoStack.length && this.redoStack[this.redoStack.length - 1]!.t <= timestamp) {
      const entry = this.redoStack.pop()!
      this.replay(entry, true)
      this.undoStack.push(entry)
    }
    this.updateDerivedState()
  }

  startBatch(): void {
    this.batching = true
  }

  commitBatch(): void {
    this.batching = false
    this.finalizeBatch()
  }

  getHistory(): HistoryEntry[] {
    return [...this.undoStack]
  }

  setHistory(history: HistoryEntry[]): void {
    this.undoStack.length = 0
    this.undoStack.push(...history)
    this.redoStack.length = 0
    this.updateDerivedState()
  }

  unsubscribe(): void {
    this.unsub()
  }
}
