import { JSDOM } from 'jsdom'

export function setupDOM(): void {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
  global.document = dom.window.document
  global.window = dom.window as unknown as (Window & typeof globalThis)
  global.Text = dom.window.Text
  global.Element = dom.window.Element
  global.DocumentFragment = dom.window.DocumentFragment
  global.HTMLElement = dom.window.HTMLElement
  global.SVGElement = dom.window.SVGElement
  global.Node = dom.window.Node
  global.MutationObserver = dom.window.MutationObserver
  global.Event = dom.window.Event
  global.CustomEvent = dom.window.CustomEvent
}
