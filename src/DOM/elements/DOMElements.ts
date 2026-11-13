import { domElement } from '../domFunctions.js'
import { ElementController } from '../nodeControllers/ElementController.js'
import type { DOMElementArguments, NodeArguments } from '../types.js'
import type { ElementAttributesOf } from './elementAttributeTypes.js'
import type { State } from '@/state/types/types.js'

// `HTMLInputElement.value` is unconditionally `string` in lib.dom.d.ts regardless of `type`
// (TS has no literal discriminant to narrow by), but `type="number"`/`"range"` inputs are
// semantically numeric and expose `.valueAsNumber`. Overload on the literal `type:` the
// caller passes so a `State<number>` can be bound for those two types specifically, via a
// synthetic element shape that reuses the same ElementAttributesOf<E> machinery as every
// other element (see `ValueTypeOf<E>`/`Stringlike<T>` in elementAttributeTypes.ts) rather
// than inventing new type plumbing - it's still "the type of `.value` for this input", just
// asserted for a configuration the real DOM lib type can't express.
// `.checked` exists on `HTMLInputElement` unconditionally too (not omitted here, unlike
// `value`/`type` above) - removing it would narrow this synthetic shape enough that it stops
// being assignable to plain `HTMLInputElement`, breaking existing call sites whose handlers are
// explicitly typed `(ev: DOMHandlerEvent<'change', HTMLInputElement>) => void`. That leaves
// `CheckedTypeOf<E>` (elementAttributeTypes.ts) also resolving to `boolean` here, so a
// `State<boolean>` would otherwise type-check for `change`/`input` even on this numeric overload
// - `ExcludeAutoBind` below strips that leftover branch back out per overload, since the runtime
// closure in ElementController.ts reads the native property matching `ev.target.type`
// unconditionally and has no other way to know which primitive type was actually intended.
type NumericHTMLInputElement = Omit<HTMLInputElement, 'value' | 'type'> & {
  value: number
  type: 'number' | 'range'
}

// `.checked` is a separate IDL property from `.value` (a checked checkbox can independently
// have any `.value` string), already natively typed `boolean` - no coercion needed, just its
// own overload so `type:` still discriminates which auto-bind branch (`ValueTypeOf`'s `string`
// vs `CheckedTypeOf`'s `boolean`, see elementAttributeTypes.ts) is actually meaningful for the
// input in question.
type CheckboxHTMLInputElement = Omit<HTMLInputElement, 'type'> & {
  type: 'checkbox' | 'radio'
}

// lib.dom.d.ts declares `HTMLInputElement.type` as plain `string`, so the general overload
// below would otherwise structurally accept `type: 'number'|'range'|'checkbox'|'radio'` too (a
// wider type always matches a narrower literal) and TS picks whichever overload matches first -
// silently letting a `State<string>` bind to a numeric/checkbox input, or vice versa.
// Restricting the general overload's `type` to the closed set of *remaining* HTML5 input types
// makes all three overloads mutually exclusive on the literal `type:` the caller passes.
type StandardInputType
  = | 'text' | 'search' | 'tel' | 'url' | 'email' | 'password'
    | 'date' | 'month' | 'week' | 'time' | 'datetime-local'
    | 'file' | 'color' | 'hidden'
    | 'submit' | 'reset' | 'button' | 'image'
type StandardHTMLInputElement = Omit<HTMLInputElement, 'type'> & {
  type: StandardInputType
}

// Strips a leftover, structurally-legal-but-runtime-wrong auto-bind option (see the comment on
// `NumericHTMLInputElement` above) off `change`/`input` for one `ElementAttributesOf<E>` result,
// so exactly one primitive `State<...>` type-checks per `<input>` overload - matching what the
// runtime closure in ElementController.ts actually reads for that `type:`.
type ExcludeAutoBind<Attrs, Excluded> = {
  [K in 'change' | 'input']?: Exclude<Attrs[K & keyof Attrs], Excluded>
}

type NumericInputAttributes
  = Omit<ElementAttributesOf<NumericHTMLInputElement>, 'change' | 'input'>
    & ExcludeAutoBind<ElementAttributesOf<NumericHTMLInputElement>, State<boolean | null | undefined>>
    & { type: 'number' | 'range' }

type CheckboxInputAttributes
  = Omit<ElementAttributesOf<CheckboxHTMLInputElement>, 'change' | 'input'>
    & ExcludeAutoBind<ElementAttributesOf<CheckboxHTMLInputElement>, State<string | null | undefined>>
    & { type: 'checkbox' | 'radio' }

type StandardInputAttributes
  = Omit<ElementAttributesOf<StandardHTMLInputElement>, 'change' | 'input'>
    & ExcludeAutoBind<ElementAttributesOf<StandardHTMLInputElement>, State<boolean | null | undefined>>

function inputFactory(...args: DOMElementArguments<NumericInputAttributes>): ElementController
function inputFactory(...args: DOMElementArguments<CheckboxInputAttributes>): ElementController
function inputFactory(...args: DOMElementArguments<StandardInputAttributes>): ElementController
function inputFactory(...args: NodeArguments): ElementController {
  return new ElementController('input', args)
}

export const a = domElement<ElementAttributesOf<HTMLAnchorElement>>('a')
export const abbr = domElement<ElementAttributesOf<HTMLElement>>('abbr')
export const address = domElement<ElementAttributesOf<HTMLElement>>('address')
export const area = domElement<ElementAttributesOf<HTMLAreaElement>>('area')
export const article = domElement<ElementAttributesOf<HTMLElement>>('article')
export const aside = domElement<ElementAttributesOf<HTMLElement>>('aside')
export const audio = domElement<ElementAttributesOf<HTMLAudioElement>>('audio')
export const b = domElement<ElementAttributesOf<HTMLElement>>('b')
export const base = domElement<ElementAttributesOf<HTMLBaseElement>>('base')
export const bdi = domElement<ElementAttributesOf<HTMLElement>>('bdi')
export const bdo = domElement<ElementAttributesOf<HTMLElement>>('bdo')
export const blockquote = domElement<ElementAttributesOf<HTMLQuoteElement>>('blockquote')
export const body = domElement<ElementAttributesOf<HTMLBodyElement>>('body')
export const br = domElement<ElementAttributesOf<HTMLBRElement>>('br')
export const button = domElement<ElementAttributesOf<HTMLButtonElement>>('button')
export const canvas = domElement<ElementAttributesOf<HTMLCanvasElement>>('canvas')
export const caption = domElement<ElementAttributesOf<HTMLTableCaptionElement>>('caption')
export const cite = domElement<ElementAttributesOf<HTMLElement>>('cite')
export const code = domElement<ElementAttributesOf<HTMLElement>>('code')
export const col = domElement<ElementAttributesOf<HTMLTableColElement>>('col')
export const colgroup = domElement<ElementAttributesOf<HTMLTableColElement>>('colgroup')
export const data = domElement<ElementAttributesOf<HTMLDataElement>>('data')
export const datalist = domElement<ElementAttributesOf<HTMLDataListElement>>('datalist')
export const dd = domElement<ElementAttributesOf<HTMLElement>>('dd')
export const del = domElement<ElementAttributesOf<HTMLModElement>>('del')
export const details = domElement<ElementAttributesOf<HTMLDetailsElement>>('details')
export const dfn = domElement<ElementAttributesOf<HTMLElement>>('dfn')
export const dialog = domElement<ElementAttributesOf<HTMLDialogElement>>('dialog')
export const div = domElement<ElementAttributesOf<HTMLDivElement>>('div')
export const dl = domElement<ElementAttributesOf<HTMLDListElement>>('dl')
export const dt = domElement<ElementAttributesOf<HTMLElement>>('dt')
export const em = domElement<ElementAttributesOf<HTMLElement>>('em')
export const embed = domElement<ElementAttributesOf<HTMLEmbedElement>>('embed')
export const fieldset = domElement<ElementAttributesOf<HTMLFieldSetElement>>('fieldset')
export const figcaption = domElement<ElementAttributesOf<HTMLElement>>('figcaption')
export const figure = domElement<ElementAttributesOf<HTMLElement>>('figure')
export const footer = domElement<ElementAttributesOf<HTMLElement>>('footer')
export const form = domElement<ElementAttributesOf<HTMLFormElement>>('form')
export const h1 = domElement<ElementAttributesOf<HTMLHeadingElement>>('h1')
export const h2 = domElement<ElementAttributesOf<HTMLHeadingElement>>('h2')
export const h3 = domElement<ElementAttributesOf<HTMLHeadingElement>>('h3')
export const h4 = domElement<ElementAttributesOf<HTMLHeadingElement>>('h4')
export const h5 = domElement<ElementAttributesOf<HTMLHeadingElement>>('h5')
export const h6 = domElement<ElementAttributesOf<HTMLHeadingElement>>('h6')
export const head = domElement<ElementAttributesOf<HTMLHeadElement>>('head')
export const header = domElement<ElementAttributesOf<HTMLElement>>('header')
export const hgroup = domElement<ElementAttributesOf<HTMLElement>>('hgroup')
export const hr = domElement<ElementAttributesOf<HTMLHRElement>>('hr')
export const html = domElement<ElementAttributesOf<HTMLHtmlElement>>('html')
export const i = domElement<ElementAttributesOf<HTMLElement>>('i')
export const iframe = domElement<ElementAttributesOf<HTMLIFrameElement>>('iframe')
export const img = domElement<ElementAttributesOf<HTMLImageElement>>('img')
export const input = inputFactory
export const ins = domElement<ElementAttributesOf<HTMLModElement>>('ins')
export const kbd = domElement<ElementAttributesOf<HTMLElement>>('kbd')
export const label = domElement<ElementAttributesOf<HTMLLabelElement>>('label')
export const legend = domElement<ElementAttributesOf<HTMLLegendElement>>('legend')
export const li = domElement<ElementAttributesOf<HTMLLIElement>>('li')
export const link = domElement<ElementAttributesOf<HTMLLinkElement>>('link')
export const main = domElement<ElementAttributesOf<HTMLElement>>('main')
export const map = domElement<ElementAttributesOf<HTMLMapElement>>('map')
export const mark = domElement<ElementAttributesOf<HTMLElement>>('mark')
export const menu = domElement<ElementAttributesOf<HTMLMenuElement>>('menu')
export const meta = domElement<ElementAttributesOf<HTMLMetaElement>>('meta')
export const meter = domElement<ElementAttributesOf<HTMLMeterElement>>('meter')
export const nav = domElement<ElementAttributesOf<HTMLElement>>('nav')
export const noscript = domElement<ElementAttributesOf<HTMLElement>>('noscript')
export const object = domElement<ElementAttributesOf<HTMLObjectElement>>('object')
export const ol = domElement<ElementAttributesOf<HTMLOListElement>>('ol')
export const optgroup = domElement<ElementAttributesOf<HTMLOptGroupElement>>('optgroup')
export const option = domElement<ElementAttributesOf<HTMLOptionElement>>('option')
export const output = domElement<ElementAttributesOf<HTMLOutputElement>>('output')
export const p = domElement<ElementAttributesOf<HTMLParagraphElement>>('p')
export const picture = domElement<ElementAttributesOf<HTMLPictureElement>>('picture')
export const pre = domElement<ElementAttributesOf<HTMLPreElement>>('pre')
export const progress = domElement<ElementAttributesOf<HTMLProgressElement>>('progress')
export const q = domElement<ElementAttributesOf<HTMLQuoteElement>>('q')
export const rp = domElement<ElementAttributesOf<HTMLElement>>('rp')
export const rt = domElement<ElementAttributesOf<HTMLElement>>('rt')
export const ruby = domElement<ElementAttributesOf<HTMLElement>>('ruby')
export const s = domElement<ElementAttributesOf<HTMLElement>>('s')
export const samp = domElement<ElementAttributesOf<HTMLElement>>('samp')
export const script = domElement<ElementAttributesOf<HTMLScriptElement>>('script')
export const search = domElement<ElementAttributesOf<HTMLElement>>('search')
export const section = domElement<ElementAttributesOf<HTMLElement>>('section')
export const select = domElement<ElementAttributesOf<HTMLSelectElement>>('select')
export const slot = domElement<ElementAttributesOf<HTMLSlotElement>>('slot')
export const small = domElement<ElementAttributesOf<HTMLElement>>('small')
export const source = domElement<ElementAttributesOf<HTMLSourceElement>>('source')
export const span = domElement<ElementAttributesOf<HTMLSpanElement>>('span')
export const strong = domElement<ElementAttributesOf<HTMLElement>>('strong')
export const style = domElement<ElementAttributesOf<HTMLStyleElement>>('style')
export const sub = domElement<ElementAttributesOf<HTMLElement>>('sub')
export const summary = domElement<ElementAttributesOf<HTMLElement>>('summary')
export const sup = domElement<ElementAttributesOf<HTMLElement>>('sup')
export const table = domElement<ElementAttributesOf<HTMLTableElement>>('table')
export const tbody = domElement<ElementAttributesOf<HTMLTableSectionElement>>('tbody')
export const td = domElement<ElementAttributesOf<HTMLTableCellElement>>('td')
export const template = domElement<ElementAttributesOf<HTMLTemplateElement>>('template')
export const textarea = domElement<ElementAttributesOf<HTMLTextAreaElement>>('textarea')
export const tfoot = domElement<ElementAttributesOf<HTMLTableSectionElement>>('tfoot')
export const th = domElement<ElementAttributesOf<HTMLTableCellElement>>('th')
export const thead = domElement<ElementAttributesOf<HTMLTableSectionElement>>('thead')
export const time = domElement<ElementAttributesOf<HTMLTimeElement>>('time')
export const title = domElement<ElementAttributesOf<HTMLTitleElement>>('title')
export const tr = domElement<ElementAttributesOf<HTMLTableRowElement>>('tr')
export const track = domElement<ElementAttributesOf<HTMLTrackElement>>('track')
export const u = domElement<ElementAttributesOf<HTMLElement>>('u')
export const ul = domElement<ElementAttributesOf<HTMLUListElement>>('ul')
const cvar = domElement<ElementAttributesOf<HTMLElement>>('var')
export { cvar as var }
export const video = domElement<ElementAttributesOf<HTMLVideoElement>>('video')
export const wbr = domElement<ElementAttributesOf<HTMLElement>>('wbr')
