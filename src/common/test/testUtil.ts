import { isState, peek } from '@/index.js'

export const deepPeek = <T>(a: T): T => {
  const u = peek(a)
  if (typeof u === 'object' && u !== null) {
    if (Array.isArray(u)) {
      return u.map(v => deepPeek(v)) as T
    } else {
      const obj = u as Record<PropertyKey, unknown>
      const out: Record<PropertyKey, unknown> = {}
      for (const key of Object.keys(obj)) {
        out[key] = deepPeek(obj[key])
      }
      return out as T
    }
  }
  return u
}

export const isAnyState = (v: unknown) => v !== peek(v)

export const isLightState = (v: unknown) => isAnyState(v) && !isState(v)

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
