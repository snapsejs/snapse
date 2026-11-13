export const SHAPE_ELEMENT = 0
export const SHAPE_STATIC = 1
export const SHAPE_DYNAMIC = 2
export const SHAPE_EMPTY = 3
export type ChildShape
  = typeof SHAPE_ELEMENT | typeof SHAPE_STATIC | typeof SHAPE_DYNAMIC | typeof SHAPE_EMPTY

export const HYDRATE_MARKER_TEXT = '𝒮'

const nonemptyShape = (shapes: ChildShape[], index: number): ChildShape | undefined => {
  while (index < shapes.length && shapes[index] === SHAPE_EMPTY) index++
  return shapes[index]
}

// A junction (the gap between two adjacent children) is unsafe - i.e. needs a marker comment to
// disambiguate it during hydration - only when neither side is an element (an unambiguous, hard
// parser boundary) and the two sides aren't both plain static text. Two statics are left to merge
// into one text node, which hydration handles by giving the first child that node and every
// further one an empty node of its own, so each child still owns exactly one node; static content
// is never individually re-located later, so the lumped text never needs splitting apart.
// `empty` shapes (a reactive slot
// that currently renders nothing) are transparent: the nearest non-empty neighbor further out is
// what actually matters, and running off either end of the list means the boundary is someone
// else's concern (the enclosing parent's own tag, or an outer marker placed one level up).
export const computeUnsafeJunctions = (shapes: ChildShape[]): boolean[] => {
  const unsafe: boolean[] = []
  // left tracks the nearest non-empty shape to the left of the current junction, or undefined when
  // there is none yet (running off the left end). A leading empty shape must seed undefined, not the
  // empty shape itself, matching the old leftward nonemptyShape search.
  let left = shapes[0] === SHAPE_EMPTY ? undefined : shapes[0]
  for (let i = 1; i < shapes.length; i++) {
    const current = shapes[i]
    const right = nonemptyShape(shapes, i)
    const safe
      = left === undefined
        || right === undefined
        || left === SHAPE_ELEMENT
        || right === SHAPE_ELEMENT
        || (left === SHAPE_STATIC && right === SHAPE_STATIC)
    unsafe[i] = !safe
    left = current === SHAPE_EMPTY ? left : current
  }
  return unsafe
}
