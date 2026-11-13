// Diagnostic companion to memoryUsage.bench.test.ts: instead of a single before/after byte count, this
// takes real v8.writeHeapSnapshot() snapshots of one state tree at three points - just constructed, after
// every value has been accessed (forcing the same LightState/Proxy wrapping change-tracking would force),
// and after subscribing with {changes:true} - then diffs consecutive snapshots by constructor name (the
// same grouping Chrome DevTools' heap snapshot "Summary" view uses) to isolate the TRUE marginal cost of
// change tracking, once "just touching every value" is already paid for.
//
// A two-tree comparison (a plain baseline root vs. a separately-constructed root with tracking) does not
// work for this: type:name count diffs subtract a disjoint object graph's counts, which only removes a
// constant floor and can never cancel the tracked tree's own freshly-allocated objects of the same type,
// no matter what the baseline tree does to itself. Snapshotting the SAME tree at consecutive stages is the
// only way to isolate one stage's marginal allocations from the previous stage's.
//
// Same *.bench.test.ts / BENCH=1 gating as memoryUsage.bench.test.ts - see that file's header for the
// invocation and rationale.
import { describe, expect, it } from 'vitest'
import { flush, state } from '@/index.js'
import v8 from 'node:v8'
import vm from 'node:vm'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { logWithHeaders } from './utils/logWithHeaders.js'
import { subscribeChanges } from '@/state/subscribeChanges.js'

const gc = vm.runInNewContext((v8.setFlagsFromString('--expose-gc'), 'gc')) as () => void
const collect = async () => {
  for (let i = 0; i < 4; i++) {
    gc()
    await new Promise(r => setTimeout(r, 5))
  }
}

type HeapNode = { type: string, name: string, selfSize: number }
type Group = { type: string, name: string, count: number, bytes: number }

// Decodes a Node.js v8.writeHeapSnapshot() JSON file into a flat list of {type, name, selfSize} per node,
// using the snapshot's own meta.node_fields/node_types to interpret the flat `nodes` array - this is the
// documented, dependency-free format (github.com/v8/v8 src/profiler/heap-snapshot-generator.h), no
// third-party heap-snapshot parser needed.
const parseHeapSnapshot = (filePath: string): HeapNode[] => {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    snapshot: { meta: { node_fields: string[], node_types: unknown[][] } }
    nodes: number[]
    strings: string[]
  }
  const { meta } = raw.snapshot
  const stride = meta.node_fields.length
  const typeIdx = meta.node_fields.indexOf('type')
  const nameIdx = meta.node_fields.indexOf('name')
  const selfSizeIdx = meta.node_fields.indexOf('self_size')
  const typeNames = meta.node_types[typeIdx] as string[]
  const out: HeapNode[] = []
  for (let i = 0; i < raw.nodes.length; i += stride) {
    out.push({
      type: typeNames[raw.nodes[i + typeIdx]!]!,
      name: raw.strings[raw.nodes[i + nameIdx]!]!,
      selfSize: raw.nodes[i + selfSizeIdx]!,
    })
  }
  return out
}

const summarize = (nodes: HeapNode[]): Map<string, Group> => {
  const groups = new Map<string, Group>()
  for (const n of nodes) {
    const key = `${n.type}:${n.name}`
    const g = groups.get(key)
    if (g) {
      g.count++
      g.bytes += n.selfSize
    } else {
      groups.set(key, {
        type: n.type, name: n.name, count: 1, bytes: n.selfSize,
      })
    }
  }
  return groups
}

const diffGroups = (before: Map<string, Group>, after: Map<string, Group>, recordCount: number) =>
  [...after.entries()]
    .map(([key, g]) => {
      const base = before.get(key)
      return {
        objectType: g.type,
        countDelta: g.count - (base?.count ?? 0),
        bytesDelta: g.bytes - (base?.bytes ?? 0),
        bytesPerRecord: ((g.bytes - (base?.bytes ?? 0)) / recordCount).toFixed(2),
        name: g.name,
      }
    })
    .filter(d => Math.abs(d.bytesDelta) > 2000)
    .sort((a, b) => b.bytesDelta - a.bytesDelta)

const reportDiff = (label: string, diffs: ReturnType<typeof diffGroups>, recordCount: number) => {
  console.log(`=== ${label} ===`)
  logWithHeaders(diffs)
  const totalDelta = diffs.reduce((sum, d) => sum + d.bytesDelta, 0)
  const td = String(totalDelta).padStart(10, ' ')
  const tdpr = (totalDelta / recordCount).toFixed(2).padStart(14, ' ')
  console.log(`total (filtered)      ${td} ${tdpr}`)
  return totalDelta / recordCount
}

describe.skipIf(!process.env.BENCH)('heap snapshot: ChangeAggregateTransform composition', () => {
  it('breaks down per-record change-tracking overhead by constructor', { timeout: 120_000 }, async () => {
    const recordCount = 10_000
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapse-heap-'))

    const root = state({ items: Array.from({ length: recordCount }, (_, i) => ({ v: i })) })
    void root
    await collect()
    const constructedPath = path.join(dir, 'constructed.heapsnapshot')
    v8.writeHeapSnapshot(constructedPath)

    // Access every value, forcing the same per-record and per-leaf LightState/Proxy wrapping that
    // change tracking would force, but without any tracking - isolates that wrapping's own cost.
    const sum = (root.items as unknown as { v: number }[]).reduce((acc, v) => acc + v.v, 0)
    console.log('sum of values:', String(sum))
    await collect()
    const accessedPath = path.join(dir, 'accessed.heapsnapshot')
    v8.writeHeapSnapshot(accessedPath)

    const unsubscribe = subscribeChanges(root, () => {})
    flush()
    await collect()
    const trackedPath = path.join(dir, 'tracked.heapsnapshot')
    v8.writeHeapSnapshot(trackedPath)
    unsubscribe()

    const constructedGroups = summarize(parseHeapSnapshot(constructedPath))
    const accessedGroups = summarize(parseHeapSnapshot(accessedPath))
    const trackedGroups = summarize(parseHeapSnapshot(trackedPath))

    console.log(`recordCount=${recordCount} simple object values like { v: 42 }`)

    const accessDiffs = diffGroups(constructedGroups, accessedGroups, recordCount)
    const bytesPerUntrackedValue = reportDiff(
      'construct -> full value access (no tracking): cost of touching every value',
      accessDiffs,
      recordCount,
    )
    expect(bytesPerUntrackedValue).toBeLessThan(380)

    const trackingDiffs = diffGroups(accessedGroups, trackedGroups, recordCount)
    const extraBytesPerTrackedValue = reportDiff(
      'full value access -> subscribe(changes:true): marginal cost of change tracking',
      trackingDiffs,
      recordCount,
    )

    fs.rmSync(dir, { recursive: true, force: true })
    expect(trackingDiffs.length).toBeGreaterThan(0)
    expect(extraBytesPerTrackedValue).toBeLessThan(450)
  })
})
