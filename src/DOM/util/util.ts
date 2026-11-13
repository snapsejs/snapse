import type { ChildNode } from '@/DOM/types.js'
import { destate } from '@/state/state.js'

export const isNode = (v: unknown): v is ChildNode => destate<unknown>(v) != null
