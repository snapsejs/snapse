import type { State } from '@/state/types/types.js'
import { transforms } from './transforms/transforms.js'

export const compute = <T>(computeFunction: () => T): State<T> =>
  new transforms.ComputeTransform(computeFunction).execute() as State<T>
