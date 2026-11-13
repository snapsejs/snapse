// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ServerComment, ServerElement, ServerText } from '@/DOM/server/serverNodes.js'
import { serializeChildren } from '@/DOM/server/serialize.js'

const html = (el: ServerElement) => serializeChildren(el)

describe('server node stand-ins', () => {
  it('should append when there is no reference node, and splice when there is', () => {
    const parent = new ServerElement('div')
    const a = new ServerText('a')
    const c = new ServerText('c')
    parent.insertBefore(a)
    parent.insertBefore(c)
    parent.insertBefore(new ServerText('b'), c)
    expect(html(parent)).toBe('abc')
  })

  it('should treat an unknown reference node as an append', () => {
    const parent = new ServerElement('div')
    parent.insertBefore(new ServerText('a'))
    parent.insertBefore(new ServerText('b'), new ServerText('orphan'))
    expect(html(parent)).toBe('ab')
  })

  it('should track and clear parentNode across insertion and removal', () => {
    const parent = new ServerElement('div')
    const child = new ServerText('x')
    parent.insertBefore(child)
    expect(child.parentNode).toBe(parent)
    parent.removeChild(child)
    expect(child.parentNode).toBeUndefined()
    expect(html(parent)).toBe('')
  })

  it('should remove itself from its parent via remove()', () => {
    const parent = new ServerElement('div')
    const child = new ServerElement('span')
    parent.insertBefore(child)
    child.remove()
    expect(html(parent)).toBe('')
    // A second removal is a no-op rather than an error
    expect(() => child.remove()).not.toThrow()
  })

  it('should ignore removal of a node it does not hold', () => {
    const parent = new ServerElement('div')
    const kept = new ServerText('a')
    parent.insertBefore(kept)
    parent.removeChild(new ServerText('other'))
    expect(html(parent)).toBe('a')
  })

  it('should expose text through textContent', () => {
    const text = new ServerText('a')
    expect(text.textContent).toBe('a')
    text.textContent = 'b'
    expect(text.data).toBe('b')
    const parent = new ServerElement('div')
    parent.insertBefore(text)
    expect(html(parent)).toBe('b')
  })

  it('should add, replace and drop style properties', () => {
    const el = new ServerElement('div')
    el.style.setProperty('color', 'red')
    expect(el.attrs.get('style')).toBe('color: red;')
    el.style.setProperty('margin-top', '1px')
    expect(el.attrs.get('style')).toBe('color: red; margin-top: 1px;')
    el.style.setProperty('color', 'blue')
    expect(el.attrs.get('style')).toBe('color: blue; margin-top: 1px;')
    el.style.setProperty('margin-top', null)
    expect(el.attrs.get('style')).toBe('color: blue;')
    el.style.setProperty('color', '')
    expect(el.attrs.has('style')).toBe(false)
  })

  it('should set and remove attributes, coercing values to strings', () => {
    const el = new ServerElement('div')
    el.setAttribute('id', 'a')
    el.setAttribute('tabindex', 3 as unknown as string)
    expect(el.attrs.get('tabindex')).toBe('3')
    el.removeAttribute('id')
    expect(el.attrs.has('id')).toBe(false)
  })

  it('should drop existing children when innerHTML is assigned', () => {
    const el = new ServerElement('div')
    el.insertBefore(new ServerText('gone'))
    el.innerHTML = '<b>raw</b>'
    const parent = new ServerElement('div')
    parent.insertBefore(el)
    expect(html(parent)).toBe('<div><b>raw</b></div>')
  })

  it('should serialize comments verbatim', () => {
    const parent = new ServerElement('div')
    parent.insertBefore(new ServerComment('note'))
    expect(html(parent)).toBe('<!--note-->')
  })

  it('should carry the DOM node type numbering', () => {
    expect(new ServerElement('div').nodeType).toBe(1)
    expect(new ServerText('a').nodeType).toBe(3)
    expect(new ServerComment('a').nodeType).toBe(8)
  })
})
