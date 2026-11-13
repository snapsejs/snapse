import { DEV } from '@/common/dev.js'
import {
  CONTROLLER_FLAG_IS_ELEMENT,
  MODE_CSR, MODE_HYDRATE, MODE_RENDER, NodeController,
} from './NodeController.js'
import { StateController } from './StateController.js'
import { CallbackTransform } from '@/state/transforms/CallbackTransform.js'
import { transforms } from '@/state/transforms/transforms.js'
import type { DOMElementAttributes, DOMEventListener, DOMHandlerEvent, HydrationContext } from '../types.js'
import { destate, getLightState, isAnyState, isState, peek } from '@/state/state.js'
import { camelToKebab, isPOJO } from '@/common/util.js'
import { fastFlush } from '@/state/stateInternals/notify.js'
import { assertWritable, refresh, updateValue } from '@/state/stateInternals/stateUpdate.js'
import { throwIfPoisoned } from '@/state/stateInternals/poison.js'
import { isArray } from '@/common/shorthands.js'

type PropertyBinding = { ctl: ElementController, prop: string, subkey?: string }
type EventArgs = [EventListenerOrEventListenerObject, (EventListenerOptions | boolean)?]

const collectClassNames = (v: unknown, classNames: string[]) => {
  const dv = peek(v)
  throwIfPoisoned(dv)
  if (typeof dv === 'string') {
    classNames.push(dv)
  } else if (isArray(dv)) {
    for (const subValue of dv) collectClassNames(subValue, classNames)
  } else if (isPOJO(dv)) {
    const classObject = v as Record<string, unknown>
    for (const className in classObject) {
      const rawEnabled = peek(classObject[className])
      throwIfPoisoned(rawEnabled)
      if (rawEnabled) classNames.push(className)
    }
  }
  return classNames
}

const calculateClassString = (v: unknown) => collectClassNames(v, []).join(' ')

const refreshClassStates = (v: unknown): void => {
  const ls = getLightState(v)
  if (ls) refresh(ls)
  const value = ls ? ls.v : v
  if (isArray(value)) {
    for (const subValue of value) refreshClassStates(subValue)
  } else if (isPOJO(value)) {
    const classObject = value as Record<string, unknown>
    for (const className in classObject) refreshClassStates(classObject[className])
  }
}

// Keys whose string or number value is not simply set as an attribute
const nonAttributeKeys = new Set(['innerHTML', 'value', 'checked', 'selected', 'autofocus'])

const isLifecycleKey = (key: string) =>
  key === 'nodeCreated' || key === 'nodeRemoved' || key === 'nodeInserted'

const isAutoBindableEventKey = (key: string) => key === 'input' || key === 'change'

const isEventListener = (v: unknown) => typeof v === 'function'
  ? !isState(v)
  : typeof (v as EventListenerObject | null)?.handleEvent === 'function'

const isEventListenerTuple = (v: unknown) => isArray(v) && isEventListener(v[0])

const isPlainArray = (v: unknown): v is unknown[] => {
  return v != null && Object.getPrototypeOf(v) === Array.prototype
}

const isReactiveClassObject = (classObject: Record<string, unknown>) => {
  for (const className in classObject) {
    if (isAnyState(classObject[className])) return true
  }
  return false
}

const isReactiveClassValue = (v: unknown): boolean =>
  isAnyState(v)
  || (isPlainArray(v) && (v as unknown[]).some(isReactiveClassValue))
  || (isPOJO(v) && isReactiveClassObject(v as Record<string, unknown>))

export class ElementController extends NodeController {
  // Rarely set, so it is not declared as a field: one more would not fit in the object
  declare private eventListeners?: Record<string, EventArgs>

  protected makeElement(tagName: string): HTMLElement | SVGElement {
    return (this.ctx?.md === MODE_RENDER ? this.ctx.doc! : document).createElement(tagName)
  }

  override remove(removeNode = true) {
    super.remove(removeNode)
    if (removeNode && this.eventListeners) this.eventListeners = undefined
  }

  protected buildNode(
    properties: DOMElementAttributes | undefined, _namedStates: unknown,
    stateContext: NodeController | undefined, hydrationContext: HydrationContext,
  ) {
    const target = stateContext!
    if (this.ctx?.md === MODE_HYDRATE) {
      this.removeExcessNodes(hydrationContext)
      if (!(hydrationContext.nxt instanceof HTMLElement || hydrationContext.nxt instanceof SVGElement)) {
        // Covered by buildtest, undetected by vite coverage
        /* v8 ignore else */
        if (DEV) throw Error('Hydration failed due to DOM mismatch')
        /* v8 ignore next */
        throw Error(undefined)
      }
      this.el = hydrationContext.nxt
      hydrationContext.nxt = hydrationContext.nxt.nextSibling
    } else {
      this.el = this.makeElement(this.def as string)
    }
    if (properties) {
      for (const key in properties) {
        const value = (properties as Record<string, unknown>)[key]
        if (key === 'class') {
          const isReactive = typeof value !== 'string' && isReactiveClassValue(value)
          if (isReactive) refreshClassStates(value)
          this.handleProp(key, typeof value === 'string'
            ? value
            : isReactive
              ? new transforms.LightStateFunctionTransform(undefined, calculateClassString, [value]).execute()
              : calculateClassString(value), target)
        } else if (key === 'style') {
          const styleObject = value as Record<string, unknown>
          for (const styleKey in styleObject) {
            this.handleProp(key, styleObject[styleKey], target, camelToKebab(styleKey))
          }
        } else {
          this.handleProp(key, value, target)
        }
      }
    }
  }

  private joinPropArray(a: unknown[]) {
    return a.filter(v => peek(v) != null).join('')
  }

  private handleProp(key: string, value: unknown, stateContext: NodeController, subkey?: string) {
    if ((typeof value === 'string' || typeof value === 'number') && !subkey && !nonAttributeKeys.has(key)
      && (value !== '' || key !== 'class')) {
      this.el!.setAttribute(key, String(value))
      return
    }
    const joinedValue = isPlainArray(value) && !isEventListenerTuple(destate(value))
      ? (value.some(isAnyState)
          ? new transforms.LightStateFunctionTransform(undefined, this.joinPropArray, [value]).execute()
          : this.joinPropArray(value))
      : value
    const joinedValueLightState = this.updateProperty(key, joinedValue, subkey, stateContext)
    if (joinedValueLightState) {
      this.addSub(new CallbackTransform<unknown, PropertyBinding>(
        joinedValueLightState, ElementController.propertyChanged, { ctl: this, prop: key, subkey },
      ), stateContext)
    }
  }

  private static propertyChanged(newValue: unknown, binding?: PropertyBinding) {
    binding!.ctl.applyUpdate(newValue, binding!.prop, binding!.subkey)
  }

  private applyUpdate(newValue: unknown, key: string, subkey?: string) {
    try {
      this.updateProperty(key, newValue, subkey)
    } catch (e) {
      this.handleReactiveError(e)
    }
  }

  private updateProperty(key: string, value: unknown, subkey?: string, target?: NodeController) {
    let ls = getLightState(value)
    if (ls) refresh(ls)
    let dv = ls ? ls.v : value
    throwIfPoisoned(dv)
    if (key === 'innerHTML') {
      this.el!.innerHTML = String(dv)
    } else if (key === 'style') {
      this.el!.style!.setProperty(subkey as string, dv as string)
    } else if (this.ctx?.md !== MODE_RENDER && (key === 'value' || key === 'checked' || key === 'selected')) {
      (this.el as unknown as Record<string, unknown>)[key] = dv
    } else if (
      (this.eventListeners && key in this.eventListeners)
      || ((typeof dv === 'function' || isEventListenerTuple(dv)) && !isLifecycleKey(key))
      || (ls && isAutoBindableEventKey(key))
    ) {
      if (this.ctx?.md !== MODE_RENDER) {
        if (this.eventListeners && key in this.eventListeners) {
          this.el!.removeEventListener(key, ...this.eventListeners[key]!)
          delete this.eventListeners[key]
        } else if (dv !== null && typeof dv !== 'function' && !isArray(dv)
          // A computed handler that is undefined has no handler yet, rather than being a binding
          && (dv !== undefined || !ls!.tf)) {
          const stateToUpdate = ls!
          assertWritable(stateToUpdate)
          dv = (ev: DOMHandlerEvent<'input', HTMLInputElement>) => {
            const checked = ev.target.type === 'checkbox' || ev.target.type === 'radio'
            const numeric = ev.target.type === 'number' || ev.target.type === 'range'
            updateValue(
              stateToUpdate,
              checked ? ev.target.checked : numeric ? ev.target.valueAsNumber : ev.target.value,
            )
          }
          ls = undefined
        }
        if (dv != null) {
          const tuple = isArray(dv) ? dv as EventArgs : undefined
          const rawHandler = (tuple ? tuple[0] : dv) as EventArgs[0]
          const listenerOptions = tuple?.[1]
          const wrapped: EventListenerOrEventListenerObject = typeof rawHandler === 'function'
            ? (e: Event) => fastFlush(rawHandler, e)
            : {
                handleEvent: (e: Event) =>
                  fastFlush(ev => (rawHandler as EventListenerObject).handleEvent(ev), e),
              }
          this.el!.addEventListener(key, wrapped, listenerOptions)
          // Only a listener that a later reactive update can replace needs to be removable
          if (ls || !target) (this.eventListeners ??= {})[key] = [wrapped, listenerOptions]
        }
      }
    } else if (key === 'autofocus' && this.ctx?.md === MODE_CSR) {
      // Explicitly apply focus instead, see below
    } else if (typeof dv === 'string' || typeof dv === 'number' || typeof dv === 'bigint') {
      // An empty class list is no class attribute
      if (dv === '' && key === 'class') this.el!.removeAttribute(key)
      else this.el!.setAttribute(key, String(dv))
    } else if (dv === null || dv === false) {
      this.el!.removeAttribute(key)
    } else if (dv === true) {
      this.el!.setAttribute(key, '')
    } else if (this.ctx?.md === MODE_RENDER && isLifecycleKey(key)) {
      // Rendering markup creates, inserts and removes no live nodes
    } else if (key === 'nodeCreated') {
      (dv as DOMEventListener | undefined)?.({ target: this.el })
    } else if (key === 'nodeRemoved') {
      if (ls) {
        // Covered by buildtest, undetected by vite coverage
        /* v8 ignore else */
        if (DEV) throw TypeError('nodeRemoved cannot be a reactive State')
        /* v8 ignore next */
        throw TypeError(undefined)
      }
      target!.addCleanup(dv as () => void)
    } else if (key === 'nodeInserted') {
      const callback = dv as DOMEventListener | undefined
      if (this.ctx?.md === MODE_HYDRATE) callback?.({ target: this.el })
      else if (callback) this.deferUntilConnected(() => callback({ target: this.el }))
    }
    if (key === 'autofocus' && dv && this.ctx?.md === MODE_CSR) {
      this.deferUntilConnected(() => this.el!.focus())
    }
    return ls
  }

  private deferUntilConnected(fn: () => void) {
    const el = this.el!
    StateController.registerPendingCall(() => {
      if (el.isConnected) fn()
    })
  }
}

ElementController.prototype.flg = CONTROLLER_FLAG_IS_ELEMENT
