import {
  CONTROLLER_FLAG_IS_CONTEXT_TRANSPARENT, CONTROLLER_FLAG_OPAQUE_SUBTREE,
  CONTROLLER_FLAG_REBUILDS_FROM_ARGS, MODE_CSR, MODE_HYDRATE, MODE_RENDER, NodeController,
} from './NodeController.js'
import { transforms } from '@/state/transforms/transforms.js'
import { isInComponent } from '@/state/state.js'
import type { DOMNodeDefinition, NodeArguments, RenderContext } from '../types.js'
import { DEV } from '@/common/dev.js'
import { liveChildNodeCount } from '../util/deferredNodes.js'

export class RootController extends NodeController {
  private rootEl?: HTMLElement | SVGElement

  constructor(definition: DOMNodeDefinition, args?: NodeArguments) {
    super(definition, args)
    if (!isInComponent()) new transforms.DOMRootTransform(this).queue()
  }

  protected buildNode(properties: RenderContext | undefined) {
    // The mode an ancestor is working in, before this root's own properties are merged over it
    const inherited = this.ctx?.md
    const mode = properties?.mode
    this.ctx = {
      md: mode === undefined
        ? inherited ?? MODE_CSR
        : mode === 'render' ? MODE_RENDER : mode === 'hydrate' ? MODE_HYDRATE : MODE_CSR,
      doc: properties?.doc ?? this.ctx?.doc,
    }
    const given = properties?.root as HTMLElement | null | undefined

    if (this.par) {
      if (inherited === MODE_RENDER) {
        // Sub-roots (portals) cannot be rendered in the same string, as by definition they live elsewhere
        this.c = []
        this.rootEl = this.ctx.doc!.createElement('')
        return
      }
      if (inherited === MODE_HYDRATE && mode === undefined) this.ctx.md = MODE_CSR
    }

    if (this.ctx.md === MODE_RENDER) {
      // Markup is produced rather than installed anywhere, so a target of its own is meaningless
      if (given) {
        /* v8 ignore else */
        if (DEV) {
          throw Error('render mode does not install into a root - use renderToString()')
        }
        /* v8 ignore next */
        throw Error(undefined)
      }
      this.rootEl = this.ctx.doc!.createElement('')
      return
    }
    this.rootEl = given ?? document.body
    if (this.ctx.md === MODE_CSR) this.pnc = liveChildNodeCount(this.rootEl)
  }

  protected override getMountElement() {
    return this.rootEl
  }

  protected override getParallelNodeCount(): number {
    // Child nodes do not live in the parent tree
    return 0
  }

  createRoot() {
    if (!this.rootEl) this.build()
  }

  renderedRoot() {
    return this.rootEl!
  }

  override remove() {
    this.unsubscribeAll()
    this.removeChildren(true)
  }
}

RootController.prototype.flg = CONTROLLER_FLAG_IS_CONTEXT_TRANSPARENT
  | CONTROLLER_FLAG_OPAQUE_SUBTREE | CONTROLLER_FLAG_REBUILDS_FROM_ARGS
