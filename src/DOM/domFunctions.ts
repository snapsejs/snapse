import type {
  ChildProp, ComponentArguments, ComponentFactory, ComponentFunctionBody,
  ComponentProps, DOMElementArguments, DOMElementAttributes,
  ElementOptions, NodeArguments, RootOptions,
} from './types.js'

import { ElementController } from './nodeControllers/ElementController.js'
import { SVGElementController } from './nodeControllers/SVGElementController.js'
import { ComponentController } from './nodeControllers/ComponentController.js'
import { RootController } from './nodeControllers/RootController.js'
import { NodeController } from './nodeControllers/NodeController.js'
import { StateController } from './nodeControllers/StateController.js'

NodeController.setStateController(StateController)
NodeController.setComponentController(ComponentController)

export const component = <T = ComponentProps>(
  definition: ComponentFunctionBody<T & { children: ChildProp[] }>):
ComponentFactory => (...args: ComponentArguments) =>
  new ComponentController(definition as ComponentFunctionBody<unknown>, args)

export const domElement = <U extends ElementOptions = DOMElementAttributes>(elementName: string) =>
  <T extends DOMElementArguments<U>>(...args: NoInfer<T>) =>
    new ElementController(elementName, args as NodeArguments)

export const svgElement = <U extends ElementOptions = DOMElementAttributes>(elementName: string) =>
  <T extends DOMElementArguments<U>>(...args: NoInfer<T>) =>
    new SVGElementController(elementName, args as NodeArguments)

type RootArguments = ChildProp[] | [RootOptions?, ...ChildProp[]]
export const SnapseRoot = (...args: RootArguments) => new RootController('', args as NodeArguments)
