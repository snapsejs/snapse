// Characterises the cost of the movable-children path (pendingDestroy / deferNode /
// flushPendingWork / liveChildNodeAt) on a large directly-rendered `.map()` list whose children
// can never actually be adopted -- `div(state(bigArray).map(n => div(n)))`, a single consumer.
//
// Named *.test.ts so vitest discovers it, but the body is skipped unless BENCH is set, so it costs
// nothing in the normal suite. Run for real via:
//   BENCH=1 npx vitest run src/DOM/internalTests/movabilityOverhead.bench.test.ts --reporter=verbose
// (--reporter=verbose is required -- the default reporter swallows console output on success.)
//
// What it shows (jsdom, numbers are indicative, machine-dependent):
//   - reorder / sort (element identity preserved): ~1x -- the deferred path is never entered,
//     computeMutation emits only `move` ops. The "sort a large array" worry is a non-issue.
//   - a partial splice: ~1x.
//   - replace ALL children with fresh values (no identity overlap): ~2x and superlinear in jsdom.
//     That superlinearity is jsdom's own removeChild (position-dependent, non-linear), not Snapse:
//     the movable path detaches the old nodes AFTER the new ones are inserted, from a non-tail
//     position in a 2N-child parent. Real browsers (removeChild ~O(1)) do not show it, and Snapse's
//     own bookkeeping here is all O(n).

import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'
import { StateController } from '@/DOM/nodeControllers/StateController.js'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.skipIf(!process.env.BENCH)('movable-children overhead on a single-consumer .map() list', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
  })

  const time = (N: number, op: (a: any) => void, forceNonMovable: boolean): number => {
    const proto = StateController.prototype as any
    const origHMC = proto.hasMovableChildren
    if (forceNonMovable) proto.hasMovableChildren = () => false
    ;(StateController as any).movableControllersByDef.clear()
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
    const a = state(Array.from({ length: N }, (_, i) => i))
    SnapseRoot({ root: document.getElementById('app')! }, div(a.map((n: any) => div(n))))
    flush()
    const t0 = performance.now()
    op(a)
    flush()
    const dt = performance.now() - t0
    proto.hasMovableChildren = origHMC
    return dt
  }

  const ops: Record<string, (a: any, N: number) => void> = {
    'reorder (identity preserved)': a => a.set([...a].reverse()),
    'splice ~10% out + in': (a, N) => {
      const k = Math.max(1, Math.floor(N / 10))
      a.splice(Math.floor(N / 4), k)
      a.splice(Math.floor(N / 2), 0, ...Array.from({ length: k }, (_, i) => 1e6 + i))
    },
    'replace all (fresh values)': (a, N) => a.set(Array.from({ length: N }, (_, i) => 1e6 + i)),
    'small (1 out, 1 in)': a => {
      a.splice(1, 1)
      a.push(1e6)
    },
  }

  it('prints the movable vs non-movable ratio table', { timeout: 120_000 }, () => {
    const rows: string[] = []
    for (const N of [1000, 3000]) {
      rows.push(`\n  N = ${N}`)
      for (const [label, op] of Object.entries(ops)) {
        const mv = time(N, a => op(a, N), false)
        const nm = time(N, a => op(a, N), true)
        rows.push(
          `    ${label.padEnd(30)} movable ${mv.toFixed(1).padStart(8)}ms`
          + `   non-movable ${nm.toFixed(1).padStart(8)}ms   ${(mv / nm).toFixed(2)}x`,
        )
      }
    }
    console.info(rows.join('\n'))
    // sanity: the deferred path drains fully every flush
    expect((StateController as any).pendingDestroy.size).toBe(0)
  })
})
