// Heap-usage benchmark for ChangeAggregateTransform's leaf-value tracking (backing
// subscribe(root, cb, {changes:true}) / TrackHistory). Named *.test.ts so it's still discovered by
// `npm run test`/`test:run` (vitest's default include glob requires that suffix - a path passed
// directly on the CLI is still filtered by it, it does not bypass it), but the body is skipped
// there (BENCH unset) so it costs nothing in the normal suite. Run for real via:
//   BENCH=1 npx vitest run src/undo/benchmarks/memoryUsage.bench.test.ts --reporter=verbose
// (--reporter=verbose is required - the default reporter only surfaces console output on failure,
// so plain `vitest run` silently swallows the printed table otherwise.)
//
// To A/B compare this file's current implementation against a different one (e.g. a prior commit),
// run once, then stash ONLY the implementation file, run again, then restore:
//   git stash push -- src/state/transforms/ChangeAggregateTransform.ts
//   BENCH=1 npx vitest run src/undo/benchmarks/memoryUsage.bench.test.ts --reporter=verbose
//   git stash pop
import { describe, expect, it } from 'vitest'
import { flush, state } from '@/index.js'
import v8 from 'node:v8'
import vm from 'node:vm'
import { logWithHeaders } from './utils/logWithHeaders.js'
import { subscribeChanges as subscribeToChanges } from '@/state/subscribeChanges.js'

// Same trick as src/DOM/functionalTests/reactiveText.test.ts: obtain a working gc() without
// requiring the --expose-gc CLI flag.
const gc = vm.runInNewContext((v8.setFlagsFromString('--expose-gc'), 'gc')) as () => void
const collect = async () => {
  for (let i = 0; i < 4; i++) {
    gc()
    await new Promise(r => setTimeout(r, 5))
  }
}

const CYCLES = 50

// Spreads `opCount` operations evenly across indices [0, n) - the j-th op lands on
// floor(j*n/opCount), covering the full range once if opCount >= n, or an even subsample if not.
// A plain `j % n` would instead only ever touch indices [0, min(n, opCount)) since j never exceeds
// opCount, silently confining every mutation to a fixed-size prefix regardless of how large n is.
const spreadIndex = (j: number, opCount: number, n: number) => Math.floor((j * n) / opCount) % n

// Measures retained heap for `build` + `mutate`, isolated via a GC'd before/after pair. `build` must
// return a `release` closure that keeps its root reachable (by capturing it, even if only the baseline
// path's release does nothing else) until `release()` is actually called - otherwise, once `build()`
// returns, nothing references the tree it built, and it collects away before the "after" reading, making
// the baseline measure "build a tree and immediately discard it" (~0) instead of "keep a tree alive with
// no tracking attached" (the actual comparison point for withChangesBytes, whose root stays reachable
// only because `unsubscribe` happens to reference it transitively through the subscription graph).
const measure = async (build: () => () => void): Promise<number> => {
  await collect()
  const before = process.memoryUsage().heapUsed
  const release = build()
  await collect()
  const retainedBytes = process.memoryUsage().heapUsed - before
  release()
  await collect()
  return retainedBytes
}

type LeafResult = {
  leafCount: number
  changedPerCycle: number
  baselineBytes: number
  withChangesBytes: number
  overheadBytes: number
  overheadPerLeaf: string
}

// A flat root (no nested containers) so the numbers reflect only leaf tracking, isolated from the
// sibling container-tracking mechanism (children) exercised separately below.
const buildAndMutateLeaves = (leafCount: number, changedPerCycle: number, subscribeChanges: boolean) => {
  const obj: Record<string, number> = {}
  for (let i = 0; i < leafCount; i++) obj[`leaf${i}`] = i
  const root = state(obj)
  const unsubscribe = subscribeChanges ? subscribeToChanges(root, () => {}) : undefined

  const totalOps = CYCLES * changedPerCycle
  let op = 0
  for (let cycle = 0; cycle < CYCLES; cycle++) {
    for (let j = 0; j < changedPerCycle; j++) {
      const key = `leaf${spreadIndex(op, totalOps, leafCount)}` as keyof typeof root
      ;(root[key] as unknown as { set: (v: number) => void }).set(op)
      op++
    }
    flush()
  }
  return () => {
    unsubscribe?.()
    void root // keep `root` captured in this closure until it's actually called (see `measure`)
  }
}

const runLeafScenario = async (leafCount: number, changedPerCycle: number): Promise<LeafResult> => {
  const baselineBytes = await measure(() => buildAndMutateLeaves(leafCount, changedPerCycle, false))
  const withChangesBytes = await measure(() => buildAndMutateLeaves(leafCount, changedPerCycle, true))
  const overheadBytes = withChangesBytes - baselineBytes
  return {
    leafCount, changedPerCycle, baselineBytes, withChangesBytes, overheadBytes,
    overheadPerLeaf: (overheadBytes / leafCount).toFixed(2),
  }
}

type RecordResult = {
  recordCount: number
  changedPerCycle: number
  baselineBytes: number
  withChangesBytes: number
  overheadBytes: number
  overheadPerRecord: string
}

// A "list of records" shape (N array elements, each its own POJO container with one leaf) - stresses
// per-container child tracking (children), isolated from the flat-leaf scenario above. Mirrors the leaf
// scenario's changedPerCycle sweep, rather than a fixed one-record-per-cycle churn, so we can check
// empirically (not assume) whether record-mutation count affects retained memory the way leaf churn
// doesn't - since every record's own tracker/children/leafValues entry is already created up front by
// the initial run() at subscribe time, independent of whatever gets mutated afterward.
const buildAndMutateRecords = (recordCount: number, changedPerCycle: number, subscribeChanges: boolean) => {
  const root = state({ items: Array.from({ length: recordCount }, (_, i) => ({ v: i })) })
  const unsubscribe = subscribeChanges ? subscribeToChanges(root, () => {}) : undefined

  const totalOps = CYCLES * changedPerCycle
  let op = 0
  for (let cycle = 0; cycle < CYCLES; cycle++) {
    for (let j = 0; j < changedPerCycle; j++) {
      root.items[spreadIndex(op, totalOps, recordCount)]!.v.set(op)
      op++
    }
    flush()
  }
  return () => {
    unsubscribe?.()
    void root // keep `root` captured in this closure until it's actually called (see `measure`)
  }
}

const runRecordScenario = async (recordCount: number, changedPerCycle: number): Promise<RecordResult> => {
  const baselineBytes = await measure(() => buildAndMutateRecords(recordCount, changedPerCycle, false))
  const withChangesBytes = await measure(() => buildAndMutateRecords(recordCount, changedPerCycle, true))
  const overheadBytes = withChangesBytes - baselineBytes
  return {
    recordCount, changedPerCycle, baselineBytes, withChangesBytes, overheadBytes,
    overheadPerRecord: (overheadBytes / recordCount).toFixed(2),
  }
}

describe.skipIf(!process.env.BENCH)('memory benchmark: ChangeAggregateTransform tracking', () => {
  // run() rescans the whole container on every flush regardless of how many leaves actually changed, so
  // genuinely spreading mutations across a 100,000-leaf/record tree (rather than repeatedly no-op'ing a
  // handful of already-correct values) takes real wall-clock time - well past vitest's 5s default.
  it('reports change-tracking overhead across a leafCount x churn sweep', { timeout: 120_000 }, async () => {
    const leafCounts = [1_000, 10_000, 100_000]
    const churns = [1, 10, 100]
    const results: LeafResult[] = []
    for (const leafCount of leafCounts) {
      for (const changedPerCycle of churns) {
        results.push(await runLeafScenario(leafCount, changedPerCycle))
      }
    }
    const avgBytes = results.reduce((acc, v) => acc + parseFloat(v.overheadPerLeaf), 0) / results.length
    expect(avgBytes).toBeLessThan(200)
    console.log('=== Values obtained by observing increased memory usage ===')
    console.log('Memory overhead per leaf (non-container) value tracked by TrackHistory')
    logWithHeaders(results)
    expect(results.length).toBe(leafCounts.length * churns.length)
  })

  it(
    'reports change-tracking overhead across a recordCount x churn sweep (container tracking)',
    { timeout: 120_000 },
    async () => {
      const recordCounts = [1_000, 10_000, 100_000]
      const churns = [1, 10, 100]
      const results: RecordResult[] = []
      for (const recordCount of recordCounts) {
        for (const changedPerCycle of churns) {
          results.push(await runRecordScenario(recordCount, changedPerCycle))
        }
      }
      const avgBytes = results.reduce((acc, v) => acc + parseFloat(v.overheadPerRecord), 0) / results.length
      expect(avgBytes).toBeLessThan(670)

      console.log('=== Values obtained by observing increased memory usage ===')
      console.log('Memory overhead per container value tracked by TrackHistory')
      logWithHeaders(results)
      expect(results.length).toBe(recordCounts.length * churns.length)
    },
  )
})
