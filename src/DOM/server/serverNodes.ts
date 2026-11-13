import type { NodeFactory } from '../types.js'

// Lightweight stand-ins for the few node operations `render` mode performs when it has no real
// element to build into - see renderToString. Only the members ElementController and
// NodeController actually touch in that mode are implemented; `nodeType` carries the DOM's own
// numbering so child classification works on either kind of node without reading DOM globals,
// which don't exist on a server.
const ELEMENT_NODE = 1
const TEXT_NODE = 3
const COMMENT_NODE = 8

export abstract class ServerNode {
  abstract get nodeType(): number
  parentNode?: ServerElement

  remove() {
    this.parentNode?.removeChild(this)
  }
}

abstract class CharacterDataNode extends ServerNode {
  data: string

  constructor(data: string) {
    super()
    this.data = data
  }

  get textContent() {
    return this.data
  }

  set textContent(value: string) {
    this.data = String(value)
  }
}

export class ServerText extends CharacterDataNode {
  get nodeType() {
    return TEXT_NODE
  }
}

export class ServerComment extends CharacterDataNode {
  get nodeType() {
    return COMMENT_NODE
  }
}

// Mirrored into the owning element's attribute map on every write so that `style` lands in
// attribute order where it was first set, matching how a real element serializes.
class ServerStyle {
  private readonly el: ServerElement
  private readonly props = new Map<string, string>()

  constructor(el: ServerElement) {
    this.el = el
  }

  setProperty(name: string, value: string | null) {
    if (value == null || value === '') this.props.delete(name)
    else this.props.set(name, String(value))
    let text = ''
    for (const [k, v] of this.props) text += `${text ? ' ' : ''}${k}: ${v};`
    if (text) this.el.attrs.set('style', text)
    else this.el.attrs.delete('style')
  }
}

// Child content is normally one of our own nodes, but a browser-side caller can pass a real DOM
// node straight through to a component, and it then has to live in this tree too.
export type ChildOfServerElement = ServerNode | Node

export class ServerElement extends ServerNode {
  readonly tagName: string
  readonly attrs = new Map<string, string>()
  readonly childNodes: ChildOfServerElement[] = []
  readonly style: ServerStyle
  // Raw markup from an `innerHTML` assignment, emitted verbatim in place of any children
  html?: string

  constructor(tagName: string) {
    super()
    this.tagName = tagName
    this.style = new ServerStyle(this)
  }

  get nodeType() {
    return ELEMENT_NODE
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, String(value))
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
  }

  set innerHTML(markup: string) {
    this.html = String(markup)
    this.childNodes.length = 0
  }

  insertBefore(node: ChildOfServerElement, ref?: ChildOfServerElement | null) {
    const at = ref ? this.childNodes.indexOf(ref) : -1
    if (at < 0) this.childNodes.push(node)
    else this.childNodes.splice(at, 0, node)
    // Only our own nodes get a parent: a real DOM node can be handed straight to a component as
    // child content, and its parentNode is read-only. It is never truly attached here either -
    // the serializer reads it where it sits.
    if (node instanceof ServerNode) node.parentNode = this
    return node
  }

  removeChild(node: ChildOfServerElement) {
    const at = this.childNodes.indexOf(node)
    if (at >= 0) this.childNodes.splice(at, 1)
    if (node instanceof ServerNode && node.parentNode === this) node.parentNode = undefined
    return node
  }
}

// The casts bridge to the real-DOM types the controllers are written against: a `render` pass
// only ever reaches the members implemented above, and never mixes these nodes into a real tree.
export const serverDocument: NodeFactory = {
  createElement: tagName => new ServerElement(tagName) as unknown as HTMLElement,
  createTextNode: data => new ServerText(data) as unknown as Text,
  createComment: data => new ServerComment(data) as unknown as Comment,
}
