import { beforeEach, describe, expect, it } from 'vitest'
import { setupDOM } from '../functionalTests/common/dom.js'
import { SnapseRoot, flush, state } from '@/index.js'
import { div } from '@/DOM/elements/DOMElements.js'
import { StateController } from '@/DOM/nodeControllers/StateController.js'
import v8 from 'node:v8'
import vm from 'node:vm'

const cc = process.env.CC_BUILD === 'true'

const gc = vm.runInNewContext((v8.setFlagsFromString('--expose-gc'), 'gc')) as () => void
const collect = async () => {
  for (let i = 0; i < 4; i++) {
    gc()
    await new Promise(r => setTimeout(r, 5))
  }
}

const trackCreatedStateControllers = () => {
  const refs: WeakRef<StateController>[] = []
  const proto = StateController.prototype as unknown as { build: (...a: unknown[]) => unknown }
  const orig = proto.build
  proto.build = function (this: StateController, ...args: unknown[]) {
    refs.push(new WeakRef(this))
    return orig.apply(this, args)
  }
  return { refs, restore: () => (proto.build = orig) }
}

describe('removed child retention', () => {
  beforeEach(() => {
    setupDOM()
  })

  it.skipIf(cc).each([
    ['replaced', ['x', 'y']],
    ['cleared', []],
  ])('does not retain the controllers of %s rows', async (_name, newRows) => {
    const s = state({ rows: ['a', 'b', 'c'] })
    const { refs, restore } = trackCreatedStateControllers()
    SnapseRoot(div(s.rows.map(row => div(row))))
    flush()
    restore()
    const listControllerCount = 1
    expect(refs.length).toBeGreaterThan(listControllerCount)
    s.rows.set(newRows)
    flush()
    expect(document.body.textContent).toBe(newRows.join(''))
    await collect()
    expect(refs.filter(r => r.deref() !== undefined).length).toBe(listControllerCount)
  })
})
