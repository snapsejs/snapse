import type { TreeNode } from '../types.js'
import { NodeController } from '../nodeControllers/NodeController.js'

export const getNodeCount = (node: TreeNode): number => node instanceof NodeController ? node.nc : 1
