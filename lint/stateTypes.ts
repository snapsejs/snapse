import type ts from 'typescript'

// A State is an object wrapping its value, so it is truthy whatever the value. TypeScript cannot
// see this: a primitive State is typed as an intersection with its value type.
//
// Types are inspected only through the checker of the program being linted, never through
// TypeScript's own enums: type flag values differ between TypeScript versions, and the linted
// program's TypeScript need not be the one this plugin would import.

export const isStateType = (type: ts.Type): boolean =>
  type.getProperties().some(p => String(p.escapedName).startsWith('__@STATE_BRAND@'))

export const isNullish = (checker: ts.TypeChecker, type: ts.Type) =>
  [checker.getNullType(), checker.getUndefinedType(), checker.getVoidType()]
    .some(nullish => checker.isTypeAssignableTo(type, nullish))

// `State | undefined` is a presence check, which is meaningful; only a value that is a State in
// every case is always truthy.
export const isAlwaysState = (checker: ts.TypeChecker, type: ts.Type): boolean => type.isUnion()
  ? type.types.every(t => !isNullish(checker, t) && isAlwaysState(checker, t))
  : isStateType(type)
