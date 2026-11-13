import { ServerComment, ServerElement, ServerText } from './serverNodes.js'
import type { ChildOfServerElement } from './serverNodes.js'

// Elements the HTML parser closes itself, and which a browser therefore serializes with no
// closing tag. Created on first use so that bundles which never serialize can drop it.
let voidElements: Set<string> | undefined
const isVoidElement = (tag: string) => (voidElements ??= new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr',
])).has(tag)

const escapeText = (s: string) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\u00A0/g, '&nbsp;')

const escapeAttribute = (s: string) => s
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/\u00A0/g, '&nbsp;')

const serializeNode = (node: ChildOfServerElement, out: string[]) => {
  if (node instanceof ServerElement) {
    const tag = node.tagName
    out.push(`<${tag}`)
    for (const [name, value] of node.attrs) out.push(` ${name}="${escapeAttribute(value)}"`)
    out.push('>')
    if (isVoidElement(tag)) return
    serializeContent(node, out)
    out.push(`</${tag}>`)
  } else if (node instanceof ServerComment) {
    out.push(`<!--${node.data}-->`)
  } else if (node instanceof ServerText) {
    out.push(escapeText(node.data))
  } else {
    // A real DOM node handed straight to a component as child content, which can only happen in
    // a browser - let it serialize itself exactly as it would inside innerHTML.
    const real = node as unknown as Element & { data: string }
    if (real.nodeType === 1) out.push(real.outerHTML)
    else if (real.nodeType === 8) out.push(`<!--${real.data}-->`)
    else out.push(escapeText(real.data))
  }
}

const serializeContent = (el: ServerElement, out: string[]) => {
  // Markup assigned through innerHTML replaces children and is emitted verbatim, unescaped,
  // just as the browser would reparse it.
  if (el.html !== undefined) out.push(el.html)
  else for (const child of el.childNodes) serializeNode(child, out)
}

// The markup inside _el_, i.e. its innerHTML.
export const serializeChildren = (el: ServerElement) => {
  const out: string[] = []
  serializeContent(el, out)
  return out.join('')
}
