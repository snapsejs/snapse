const poisonCauses = new WeakMap<object, unknown>()

export const createPoisonedValue = (cause: unknown): unknown => {
  const marker: object = new Proxy(Object.create(null), {
    getPrototypeOf: () => null,
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => {
        throw cause
      }
      throw cause
    },
    has: () => {
      throw cause
    },
  })
  poisonCauses.set(marker, cause)
  return marker
}

export const isPoisoned = (v: unknown): v is object => poisonCauses.has(v as object)

export const throwIfPoisoned = (v: unknown) => {
  const cause = poisonCauses.get(v as object)
  if (cause) throw cause
}

export const getPoisonCause = (v: object): unknown => poisonCauses.get(v)
