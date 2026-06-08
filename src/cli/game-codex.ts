import type { GameSnapshot } from '../shared/contracts'
import { buildBanterContext, buildBanterMessage } from '../shared/banter-copy'
import { getApi } from './client'
import { buildSafeStateOutput } from './state-output'

getApi('/api/state')
  .then((result) => {
    const state = result.state as GameSnapshot | undefined
    if (!state) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })

    const safeState = buildSafeStateOutput(state)
    console.log(JSON.stringify({
      ok: true,
      protocol: {
        destination: 'Codex chat',
        purpose: 'Use this as the one-command Codex loop guide for table talk, Uplift turns, and hand reviews.',
        privateInfo: 'This output is public-safe. It never prints Uplift hole cards, never prints Ali hidden cards, and never submits an action.'
      },
      summary: safeState.summary,
      mode: safeState.codexChat.mode,
      suggestedMessage: buildBanterMessage(state),
      nextInstruction: buildNextInstruction(state),
      suggestedCommands: safeState.suggestedCommands,
      privateTurn: safeState.privateTurn,
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

function buildNextInstruction(state: GameSnapshot) {
  if (state.phase === 'hand-complete') {
    return 'Ask Ali whether they want the quick review. If yes, run npm run --silent game:review -- --mode accepted. If not, run npm run --silent game:next.'
  }
  if (state.actingSeatId === 'uplift') {
    return 'Say the public-safe table line if useful, then run npm run --silent game:loop to submit Uplift from private context and stop at Ali or review.'
  }
  if (state.actingSeatId === 'user') {
    return 'Say the public-safe table line if useful, then wait for Ali to act in the preview.'
  }
  return 'Run npm run --silent game:loop to resolve any automatic table movement, then stop at Ali or review.'
}
