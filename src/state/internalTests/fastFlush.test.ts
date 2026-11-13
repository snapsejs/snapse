import { describe, expect, it } from 'vitest'
import { peek, state, subscribe } from '@/index.js'
import { fastFlush } from '@/state/stateInternals/notify.js'

describe.skipIf(process.env.CC_BUILD === 'true')('fastFlush', () => {
  it('schedules a follow-up flush for state changes made from within a callback', async () => {
    const source = state(0)
    const derived = state('idle')
    const other = state(0)
    subscribe(other, () => {})
    subscribe(source, v => {
      derived.set(v === 0 ? 'idle' : 'active')
    })
    let seen: string | undefined
    subscribe(derived, v => {
      seen = v
    })

    fastFlush(() => {
      other.set(1)
      source.set(1)
    }, {} as Event)

    expect(seen).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(seen).toBe('active')
    expect(peek(derived)).toBe('active')
  })
})
