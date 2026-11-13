export * from './index.js'
// Part of the same compilation as the rest so that `snapse` and `snapse/server` resolve to one
// module instance: a second copy of the framework would have its own NodeController, which the
// trees handed to renderToString would then fail the `instanceof` checks against.
export * from './server.js'
export * from './DOM/elements/DOMElements.js'
export * from './DOM/elements/SVGElements.js'
// SVG and HTML both define `a`, `script`, `style` and `title`. A name that is ambiguous between two
// `export *` sources is dropped from the namespace, but an explicit export takes precedence, so these
// settle each clash: the HTML element keeps the plain name, the SVG one gets an `svg_` prefix.
export { a, script, style, title } from './DOM/elements/DOMElements.js'
export {
  a as svg_a, script as svg_script, style as svg_style, title as svg_title,
} from './DOM/elements/SVGElements.js'
export { domElement, svgElement } from './DOM/domFunctions.js'
