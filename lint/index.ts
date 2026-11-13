import { noBooleanStateArgument } from './noBooleanStateArgument.ts'
import { noStateTruthiness } from './noStateTruthiness.ts'

export default {
  rules: {
    'no-boolean-state-argument': noBooleanStateArgument,
    'no-state-truthiness': noStateTruthiness,
  },
}
