import { LightStateFunctionTransform } from './LightStateFunctionTransform.js'
import { transforms } from './transforms.js'

export class MapValueTransform<T extends unknown[] = unknown[]> extends LightStateFunctionTransform<T> {
}

transforms.MapValueTransform = MapValueTransform
