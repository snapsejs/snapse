import { beforeEach, describe, expect, it } from 'vitest'
import { state } from '@/index.js'

describe('thenable state', () => {
  let updates = <unknown[]>[]
  beforeEach(() => {
    updates = []
  })

  it('should be possible to await state changes', async () => {
    const s = state({
      a: 'lax',
      updated: false,
    })
    const f = async () => {
      const v = await s.a
      updates.push(v)
      s.updated.set(true)
    }
    f()
    setTimeout(() => s.a.set('pax'), 0)
    const v = await s.updated
    updates.push(v)
    expect(updates).toStrictEqual(['pax', true])
  })

  it('should handle awaiting boolean state changes', async () => {
    const s = state({
      loading: true,
      ready: false,
      proceed: false,
    })

    setTimeout(async () => {
      s.loading.set(false)
      await s.proceed
      s.ready.set(true)
    }, 0)

    const loadingResult = await s.loading
    s.proceed.set(true)
    const readyResult = await s.ready

    expect(loadingResult).toBe(false)
    expect(readyResult).toBe(true)
  })

  it('should await numeric state changes', async () => {
    const s = state({
      progress: 0,
      complete: false,
    })

    const progressUpdater = async () => {
      await s.progress
      updates.push('started')
      await s.progress
      updates.push('halfway')
      s.complete.set(true)
    }

    progressUpdater()
    setTimeout(() => {
      s.progress.set(25)
      setTimeout(() => s.progress.set(50), 0)
    }, 0)

    await s.complete
    expect(updates).toStrictEqual(['started', 'halfway'])
  })

  it('should handle concurrent awaits on same state', async () => {
    const s = state({
      value: 'initial',
      count: 0,
      waiter1Done: false,
      waiter2Done: false,
    })

    const waiter1 = async () => {
      const v = await s.value
      updates.push(`waiter1: ${v}`)
      s.waiter1Done.set(true)
    }

    const waiter2 = async () => {
      const v = await s.value
      updates.push(`waiter2: ${v}`)
      s.waiter2Done.set(true)
    }

    waiter1()
    waiter2()

    setTimeout(() => s.value.set('changed'), 0)

    await Promise.all([s.waiter1Done, s.waiter2Done])

    expect(updates).toHaveLength(2)
    expect(updates).toContain('waiter1: changed')
    expect(updates).toContain('waiter2: changed')
  })

  it('should subscribe to awaited values', async () => {
    const s = state('a')
    const t = s.toUpperCase()
    let updated = false
    const wait = async () => {
      await t
      updated = true
    }
    s.set('b')
    await wait()
    expect(updated).toBe(true)
  })
})
