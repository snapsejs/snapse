import { CONTROLLER_FLAG_IS_CONTEXT_TRANSPARENT, NodeController } from './NodeController.js'
import { startCapturingStateCalls, stopCapturingStateCalls } from '@/state/state.js'
import type { ChildProp, ComponentFunctionBody, ComponentOptions } from '../types.js'
import type { RenderError } from '../util/RenderError.js'
import type { State } from '@/state/types/types.js'
import { orFunction } from '@/state/stateInternals/internalFunctions.js'
import { transforms } from '@/state/transforms/transforms.js'

export class ComponentController extends NodeController {
  orValue: ChildProp
  renderError?: RenderError

  protected buildNode(
    properties: ComponentOptions | undefined,
    namedStates?: Record<PropertyKey, State>,
    stateContext?: NodeController,
  ) {
    const target = stateContext!
    startCapturingStateCalls(namedStates)
    let args
    let captured
    try {
      const componentArgs = { ...(properties ?? {}), children: this.c!, renderError: this.renderError }
      if (this.orValue && this.def!.constructor.name === 'AsyncFunction') {
        const componentPromise = (this.def as ((a: ComponentOptions) => Promise<ChildProp>))(componentArgs)
        const delayedComponent = new transforms.PromiseTransform(componentPromise).execute()!
        args = new transforms.FunctionTransform(
          delayedComponent,
          orFunction,
          [delayedComponent, this.orValue],
        ).execute() as ChildProp
      } else {
        args = (this.def as ComponentFunctionBody)(componentArgs)
      }
    } finally {
      captured = stopCapturingStateCalls()
    }
    const { namedStates: newNamedStates, subscriptions } = captured
    subscriptions?.forEach(unsub => target.addCleanup(unsub))
    this.parseArgs([args])
    return newNamedStates
  }

  or(v: ChildProp) {
    this.orValue = v
    return this
  }
}

ComponentController.prototype.flg = CONTROLLER_FLAG_IS_CONTEXT_TRANSPARENT
