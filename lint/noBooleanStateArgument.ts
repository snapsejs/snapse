import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils'
import type ts from 'typescript'
import { isAlwaysState, isNullish, isStateType } from './stateTypes.ts'

// A parameter typed as a plain boolean will almost certainly be tested for truthiness, which a
// boolean State always passes. Numbers and strings are left alone: they are rarely only tested.

// A string being assignable rules out `any` and `unknown`; a State is excluded explicitly, as its
// type is assignable to its value type.
const isPlainBooleanType = (checker: ts.TypeChecker, type: ts.Type) => {
  const values = (type.isUnion() ? type.types : [type]).filter(t => !isNullish(checker, t))
  return values.length > 0 && values.every(t => checker.isTypeAssignableTo(t, checker.getBooleanType())
    && !checker.isTypeAssignableTo(checker.getStringType(), t) && !isStateType(t))
}

export const noBooleanStateArgument = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'problem',
    messages: {
      booleanState: 'A boolean State passed as a plain boolean is always treated as true. Pass `!!+state`.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()

    const checkArguments = (node: TSESTree.CallExpression | TSESTree.NewExpression) => {
      for (const argument of node.arguments) {
        if (argument.type === 'SpreadElement') continue
        const type = services.getTypeAtLocation(argument)
        const isBooleanState = isAlwaysState(checker, type)
          && checker.isTypeAssignableTo(type, checker.getBooleanType())
        if (!isBooleanState) continue
        // The type of the parameter this argument is passed to, in the resolved signature
        const tsArgument = services.esTreeNodeToTSNodeMap.get(argument) as ts.Expression
        const parameterType = checker.getContextualType(tsArgument)
        if (parameterType && isPlainBooleanType(checker, parameterType)) {
          context.report({ node: argument, messageId: 'booleanState' })
        }
      }
    }

    return { CallExpression: checkArguments, NewExpression: checkArguments }
  },
})
