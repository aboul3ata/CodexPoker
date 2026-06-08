import type { GameSnapshot } from '../shared/contracts'
import { getApi, postApi } from './client'
import { buildSafeStateOutput } from './state-output'

getApi('/api/state')
  .then(async (current) => {
    const currentState = current.state as GameSnapshot | undefined
    if (!currentState) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })
    if (currentState.phase !== 'hand-complete') {
      throw Object.assign(new Error('game:next is only available after a completed hand. Keep playing in the preview.'), { code: 'not_to_act' })
    }

    const result = await postApi('/api/new-hand')
    const state = result.state as GameSnapshot | undefined
    if (!state) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })
    console.log(JSON.stringify(buildSafeStateOutput(state), null, 2))
  })
  .catch((error: Error & { code?: string }) => {
    console.error(`${error.code ?? 'error'}: ${error.message}`)
    const exits: Record<string, number> = {
      not_to_act: 5,
      storage_unavailable: 7
    }
    process.exit(exits[error.code ?? ''] ?? 1)
  })
