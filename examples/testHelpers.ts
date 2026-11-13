import { SnapseRoot, flush } from 'snapse'
import type { ChildProp } from 'snapse/DOM'

// Shared by example test files (stateBasics/components/trackHistory/examples.test.ts) to
//  mount a component against a real DOM, so example snippets are checked at runtime, not
//  just type-checked.
export const mount = (node: ChildProp) => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  SnapseRoot({ root }, node)
  flush()
  return root
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
