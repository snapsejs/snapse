import type { ChangeRecord, SubscribeCallback, ValueOfState } from './types/types.js'
import { subscribeWith } from './state.js'
import { ChangeAggregateTransform } from './transforms/ChangeAggregateTransform.js'
import { ChangeCallbackTransform } from './transforms/ChangeCallbackTransform.js'

// Calls _callback_ with a record of each change within _state_, as TrackHistory needs. Kept apart from
//   subscribe, so that the change tracking is only bundled with TrackHistory.
export const subscribeChanges = <S>(
  state: S, callback: SubscribeCallback<ValueOfState<S>, ChangeRecord>,
): () => void => subscribeWith(state, ls => {
  const target = ChangeAggregateTransform.forState(ls)
  return [target, new ChangeCallbackTransform(target, callback as SubscribeCallback)]
})
