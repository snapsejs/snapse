import { HYDRATE_MARKER_TEXT } from '@/DOM/util/childShape.js'

export { renderToString } from '@/server.js'

const escapedMarker = HYDRATE_MARKER_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const strippableComment = new RegExp(`<!--(?!${escapedMarker})[\\s\\S]*?-->`, 'g')

// Simulates a minifier: strips HTML comments while preserving hydration marker comments.
// Also collapses whitespace runs directly between tags without touching whitespace inside real text content.
export const minifyHtml = (html: string): string =>
  html
    .replace(strippableComment, '')
    .replace(/>\s+</g, '> <')

// Simulates a prettifier inserting extra whitespace/newlines between tags that have no text
//   content between them.
export const prettifyHtml = (html: string): string =>
  html.replace(/></g, '>\n  <')

// Installs _html_ the way a browser would receive it from a server, ready for a hydrate pass.
export const asServedMarkup = (html: string): HTMLElement => {
  const container = document.createElement('div')
  container.innerHTML = prettifyHtml(minifyHtml(html))
  return container
}
