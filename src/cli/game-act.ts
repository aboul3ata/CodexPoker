import type { GameSnapshot } from '../shared/contracts'
import { parseArgs, postApi } from './client'
import { gameActUsage, parseGameActArgs } from './game-act-args'
import { buildSafeStateOutput } from './state-output'

const parsed = parseGameActArgs(parseArgs(process.argv.slice(2)))

if (!parsed.ok) {
  console.error(parsed.message)
  console.error(gameActUsage)
  process.exit(6)
}

postApi('/api/action', parsed.request)
  .then((result) => {
    const state = result.state as GameSnapshot | undefined
    if (!state) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })
    console.log(JSON.stringify(buildSafeStateOutput(state), null, 2))
  })
  .catch((error: Error & { code?: string }) => {
    console.error(`${error.code ?? 'error'}: ${error.message}`)
    const exits: Record<string, number> = {
      invalid_action: 2,
      stale_turn: 3,
      wrong_seat: 4,
      not_to_act: 5,
      malformed_command: 6,
      storage_unavailable: 7
    }
    process.exit(exits[error.code ?? ''] ?? 1)
  })
