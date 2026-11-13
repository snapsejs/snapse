import { destate } from '@/state/state.js'
import type { ChangeRecord } from '@/state/types/types.js'
import { CallbackTransform } from './CallbackTransform.js'
import type { ChangeAggregateTransform } from './ChangeAggregateTransform.js'
import { Transform } from './Transform.js'

export class ChangeCallbackTransform<T = unknown> extends CallbackTransform<T, ChangeRecord> {
  override execute() {
    const agg = this.srcLs.tf as ChangeAggregateTransform
    const records = agg.drain()
    if (!records.length) return
    const v = destate(this.srcLs)
    for (let i = 0; i < records.length; i++) {
      if (i === records.length - 1) records[i]!['done'] = true
      // Isolated per record: these were already drained from `agg` above, so a throw here must not
      // lose the remaining already-drained records in this same batch.
      try {
        this.hookFunction!(v, records[i])
      } catch (e) {
        Transform.throwDelayed(e)
      }
    }
  }
}
