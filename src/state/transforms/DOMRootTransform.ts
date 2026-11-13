import { Transform, queueRoot } from './Transform.js'
import { transforms } from './transforms.js'
import type { RootController } from '@/DOM/nodeControllers/RootController.js'

export class DOMRootTransform extends Transform {
  private readonly rootCtl: RootController

  constructor(root: RootController) {
    super()
    this.rootCtl = root
  }

  override queue() {
    queueRoot(this)
  }

  override execute() {
    this.rootCtl.createRoot()
  }
}

transforms.DOMRootTransform = DOMRootTransform
