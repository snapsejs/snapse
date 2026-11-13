// @vitest-environment jsdom
import { TrackHistory, component, flush, state } from 'snapse'
import { button, div, output } from 'snapse/DOM'
import { describe, expect, it } from 'vitest'
import type { State } from 'snapse'
import { mount } from './testHelpers.js'

// Verified source for the README "TrackHistory" section.

//#region trackhistory-basic
const Counter = component(() => {
  const s = state({ count: 0 })
  const history = new TrackHistory(s)

  return div(
    output(s.count),
    button({ click: () => s.count.set(s.count + 1) }, 'Increment'),
    button({ click: history.undo, disabled: history.undoEmpty }, 'Undo'),
    button({ click: history.redo, disabled: history.redoEmpty }, 'Redo'),
  )
})
//#endregion

type Board = { items: string[], selectedItem: string[] }

const duplicateStateLimitation = (board: State<Board>) => {
  //#region trackhistory-duplicate
  // NOT supported: selectedItem now holds the very same State that also lives in
  // items, so TrackHistory sees one child stored in two places and cannot track it.
  board.selectedItem.set([board.items[42]!])
  //#endregion
}

// Illustrative only (a documented limitation, not a runnable example): exported so it
//  compiles and is checked by the type checker without being flagged as unused.
export { duplicateStateLimitation }

describe('README examples: TrackHistory', () => {
  it('records and undoes state changes with TrackHistory', () => {
    const root = mount(Counter())
    const [increment, undo] = [...root.querySelectorAll('button')]
    const readout = () => root.querySelector('output')!.textContent
    expect(readout()).toBe('0')
    increment!.click()
    flush()
    expect(readout()).toBe('1')
    undo!.click()
    flush()
    expect(readout()).toBe('0')
  })
})
