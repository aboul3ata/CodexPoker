import type { GameSnapshot } from '../shared/contracts'
import { buildBanterContext, buildBanterMessage } from '../shared/banter-copy'
import { getApi } from './client'

getApi('/api/state')
  .then((result) => {
    const state = result.state as GameSnapshot | undefined
    if (!state) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })

    console.log(JSON.stringify({
      ok: true,
      protocol: {
        destination: 'Codex chat',
        publicOnly: 'This command uses only public table state. It does not inspect Uplift private turn files and does not submit actions.',
        privateInfo: 'Do not infer or reveal hidden cards. Ali acts in the preview; Uplift acts with game:play only on Uplift turns.'
      },
      suggestedMessage: buildBanterMessage(state),
      publicContext: buildBanterContext(state)
    }, null, 2))
  })
  .catch((error: Error & { code?: string }) => {
    console.error(`${error.code ?? 'error'}: ${error.message}`)
    const exits: Record<string, number> = {
      storage_unavailable: 7
    }
    process.exit(exits[error.code ?? ''] ?? 1)
  })
