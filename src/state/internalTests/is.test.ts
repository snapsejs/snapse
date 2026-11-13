import { describe, expect, it } from 'vitest'
import { state, subscribe } from '@/index.js'
import { getLightState } from '@/state/state.js'
import { getRefCount } from '@/state/common/refCountAndType.js'

describe.skipIf(process.env.CC_BUILD === 'true')('is', () => {
  it('shares one underlying subscription to the reference across multiple .is() results', () => {
    const s = state(1)
    const refCount = () => getRefCount(getLightState(s)!)
    expect(refCount()).toBe(0)
    const a = s.is(1)
    const b = s.is(2)
    const c = s.is(3)
    const ua = subscribe(a)
    expect(refCount()).toBe(1)
    const ub = subscribe(b)
    const uc = subscribe(c)
    expect(refCount()).toBe(1)
    ua()
    expect(refCount()).toBe(1)
    ub()
    expect(refCount()).toBe(1)
    uc()
    expect(refCount()).toBe(0)
  })
})
