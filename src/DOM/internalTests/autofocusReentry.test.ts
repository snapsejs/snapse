import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, component, flush, state } from '@/index.js'
import { input, span } from '@/DOM/elements/DOMElements.js'

// Focusing a freshly inserted autofocus element fires `blur` on whatever was previously focused.
// If that handler mutates state, the Snapse event wrapper runs a nested fastFlush. Deferring the
// actual .focus() call to flushPendingWork's pending-calls drain (run after the outer
// flushPendingWork's own destroy/move processing, not mid-iteration inside addChildren) keeps
// that nested fastFlush from racing the still-in-progress outer reconciliation pass -- the same
// hazard class flushReentry.test.ts hardens against for removal, here triggered by insertion.

/* eslint-disable @typescript-eslint/no-explicit-any */
const cc = process.env.CC_BUILD === 'true'

describe.skipIf(cc)('autofocus insertion re-entrancy', () => {
  beforeEach(() => {
    setupDOM()
    document.body.innerHTML = '<div id="app"></div>'
  })

  it('inserting an autofocus element while a sibling is focused does not corrupt the flush', () => {
    const s = state({
      showSecond: false,
      tail: ['t0'] as any[],
    })
    const App = component(() => [
      input({ class: 'in1', blur: () => s.tail.push('t1') }),
      s.showSecond.opt(input({ class: 'in2', autofocus: true })),
      s.tail.map((t: any) => span(t)),
    ] as any)

    const app = document.getElementById('app')!
    SnapseRoot({ root: app }, App())
    flush()
    ;(app.querySelector('.in1') as HTMLInputElement).focus()

    s.showSecond.set(true)

    expect(() => flush()).not.toThrow()

    expect(app.querySelector('.in2')).not.toBeNull()
    expect(document.activeElement).toBe(app.querySelector('.in2'))
    expect(app.textContent).toBe('t0t1')
  })
})
