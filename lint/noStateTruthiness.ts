import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils'
import { isAlwaysState, isStateType } from './stateTypes.ts'

const PREDICATE_METHODS = new Set([
  'every', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'some',
])

export const noStateTruthiness = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'problem',
    messages: {
      alwaysTruthy: 'A State is always truthy. Test its value, e.g. `+state` for a boolean or number.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()
    const typeOf = (node: TSESTree.Node) => services.getTypeAtLocation(node)

    // A node can be reached both from its enclosing condition and from its own `&&`
    const reported = new Set<TSESTree.Node>()
    const checkTested = (node: TSESTree.Node): void => {
      if (node.type === 'LogicalExpression' && node.operator !== '??') {
        checkTested(node.left)
        checkTested(node.right)
      } else if (!reported.has(node) && isAlwaysState(checker, typeOf(node))) {
        reported.add(node)
        context.report({ node, messageId: 'alwaysTruthy' })
      }
    }

    const checkPredicate = (callback: TSESTree.Node) => {
      if (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression') return
      if (callback.body.type !== 'BlockStatement') {
        checkTested(callback.body)
        return
      }
      const returns: TSESTree.Expression[] = []
      const collect = (node: TSESTree.Node) => {
        if (node.type === 'ReturnStatement' && node.argument) returns.push(node.argument)
        if (node.type.includes('Function')) return
        for (const child of childNodes(node)) collect(child)
      }
      for (const statement of callback.body.body) collect(statement)
      returns.forEach(checkTested)
    }

    return {
      'IfStatement, WhileStatement, DoWhileStatement, ForStatement, ConditionalExpression'(
        node: TSESTree.IfStatement | TSESTree.WhileStatement | TSESTree.DoWhileStatement
          | TSESTree.ForStatement | TSESTree.ConditionalExpression,
      ) {
        if (node.test) checkTested(node.test)
      },
      // `a && b` and `a || b` always test `a`; `b` is tested only where the whole expression is.
      LogicalExpression(node) {
        if (node.operator !== '??') checkTested(node.left)
      },
      UnaryExpression(node) {
        if (node.operator === '!') checkTested(node.argument)
      },
      CallExpression(node) {
        const callee = node.callee
        if (callee.type === 'Identifier' && callee.name === 'Boolean' && node.arguments[0]) {
          checkTested(node.arguments[0])
        }
        // A State array's own predicate methods accept a State result.
        if (
          callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
          && PREDICATE_METHODS.has(callee.property.name) && node.arguments[0]
          && !isStateType(typeOf(callee.object))
        ) {
          checkPredicate(node.arguments[0])
        }
      },
    }
  },
})

function childNodes(node: TSESTree.Node): TSESTree.Node[] {
  const children: TSESTree.Node[] = []
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item && typeof item === 'object' && typeof (item as TSESTree.Node).type === 'string') {
        children.push(item as TSESTree.Node)
      }
    }
  }
  return children
}
