import { flush } from './index.js'
import type { ChildProp, NodeArguments } from './DOM/types.js'
import { RootController } from './DOM/nodeControllers/RootController.js'
import { type ServerElement, serverDocument } from './DOM/server/serverNodes.js'
import { serializeChildren } from './DOM/server/serialize.js'

export const renderToString = (...children: ChildProp[]): string => {
  const root = new RootController('', [{ mode: 'render', doc: serverDocument }, ...children] as NodeArguments)
  flush()
  return serializeChildren(root.renderedRoot() as unknown as ServerElement)
}
