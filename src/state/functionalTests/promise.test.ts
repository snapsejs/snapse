import { describe, expect, it } from 'vitest'
import { peek, state } from '@/index.js'
import { sleep } from '@/common/test/testUtil.js'

describe('promise states', () => {
  it('should handle async function promises', async () => {
    const f = async () => {
      await sleep(1)
      return 'ko'
    }
    const s = state({
      a: f(),
    })
    expect(peek(s.a)).toBe(undefined)
    await sleep(2)
    expect(peek(s.a)).toBe('ko')
  })
})
