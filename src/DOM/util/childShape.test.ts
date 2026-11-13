import { describe, expect, it } from 'vitest'
import { SHAPE_DYNAMIC, SHAPE_ELEMENT, SHAPE_EMPTY, SHAPE_STATIC, computeUnsafeJunctions }
  from './childShape.js'

// computeUnsafeJunctions returns unsafe[i] for each junction i (1..n-1); index 0 is unused. Normalise
// to a dense boolean array of the junctions for comparison.
const junctions = (shapes: number[]) =>
  Array.from(computeUnsafeJunctions(shapes as never), v => !!v).slice(1)

describe('computeUnsafeJunctions', () => {
  it('marks a junction unsafe only when neither side is an element nor both static', () => {
    expect(junctions([SHAPE_DYNAMIC, SHAPE_DYNAMIC])).toEqual([true])
    expect(junctions([SHAPE_DYNAMIC, SHAPE_STATIC])).toEqual([true])
    expect(junctions([SHAPE_STATIC, SHAPE_STATIC])).toEqual([false])
    expect(junctions([SHAPE_ELEMENT, SHAPE_DYNAMIC])).toEqual([false])
    expect(junctions([SHAPE_DYNAMIC, SHAPE_ELEMENT])).toEqual([false])
  })

  it('treats empty shapes as transparent, looking through to the nearest non-empty neighbour', () => {
    // dynamic on both sides of an empty slot: both junctions unsafe
    expect(junctions([SHAPE_DYNAMIC, SHAPE_EMPTY, SHAPE_DYNAMIC])).toEqual([true, true])
    // element seen through an empty slot makes the junction safe
    expect(junctions([SHAPE_ELEMENT, SHAPE_EMPTY, SHAPE_DYNAMIC])).toEqual([false, false])
  })

  it('treats a leading empty run as no left neighbour (junction is safe)', () => {
    // regression: a leading empty must behave as "off the left end" (undefined), not as an empty shape
    expect(junctions([SHAPE_EMPTY, SHAPE_DYNAMIC])).toEqual([false])
    expect(junctions([SHAPE_EMPTY, SHAPE_EMPTY, SHAPE_DYNAMIC])).toEqual([false, false])
    expect(junctions([SHAPE_EMPTY, SHAPE_STATIC])).toEqual([false])
    // but once a real left neighbour appears, later junctions are evaluated normally
    expect(junctions([SHAPE_EMPTY, SHAPE_DYNAMIC, SHAPE_DYNAMIC])).toEqual([false, true])
  })

  it('treats a trailing empty run as no right neighbour (junction is safe)', () => {
    expect(junctions([SHAPE_DYNAMIC, SHAPE_EMPTY])).toEqual([false])
    expect(junctions([SHAPE_DYNAMIC, SHAPE_DYNAMIC, SHAPE_EMPTY])).toEqual([true, false])
  })
})
