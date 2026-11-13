import type { Transform } from './Transform.js'
import type { ChainFunctionTransform } from './ChainFunctionTransform.js'
import type { MapArrayTransform } from './MapArrayTransform.js'
import type { CallbackTransform } from './CallbackTransform.js'
import type { OptTransform } from './OptTransform.js'
import type { ComputeTransform } from './ComputeTransform.js'
import type { LightStateFunctionTransform } from './LightStateFunctionTransform.js'
import type { FunctionTransform } from './FunctionTransform.js'
import type { IsTransform } from './IsTransform.js'
import type { PromiseTransform } from './PromiseTransform.js'
import type { SubscribeTransform } from './SubscribeTransform.js'
import type { DOMRootTransform } from './DOMRootTransform.js'
import type { MapValueTransform } from './MapValueTransform.js'

type Transforms = {
  Transform: typeof Transform
  ChainFunctionTransform: typeof ChainFunctionTransform
  MapArrayTransform: typeof MapArrayTransform
  MapValueTransform: typeof MapValueTransform
  CallbackTransform: typeof CallbackTransform
  OptTransform: typeof OptTransform
  ComputeTransform: typeof ComputeTransform
  LightStateFunctionTransform: typeof LightStateFunctionTransform
  IsTransform: typeof IsTransform
  PromiseTransform: typeof PromiseTransform
  FunctionTransform: typeof FunctionTransform
  SubscribeTransform: typeof SubscribeTransform
  DOMRootTransform: typeof DOMRootTransform
}

export const transforms = {} as Transforms
