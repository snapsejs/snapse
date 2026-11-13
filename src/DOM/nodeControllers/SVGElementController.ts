import { ElementController } from './ElementController.js'
import { MODE_RENDER } from './NodeController.js'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

export class SVGElementController extends ElementController {
  protected override makeElement(tagName: string): SVGElement {
    return this.ctx?.md === MODE_RENDER
      ? this.ctx.doc!.createElement(tagName) as unknown as SVGElement
      : document.createElementNS(SVG_NAMESPACE, tagName)
  }
}
