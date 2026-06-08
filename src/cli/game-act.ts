import { actionKinds, seatIds } from '../shared/contracts'
import type { GameSnapshot } from '../shared/contracts'
import { parseArgs, postApi } from './client'
import { buildSafeStateOutput } from './state-output'

const args = parseArgs(process.argv.slice(2))
const seat = String(args.seat ?? '')
const action = String(args.action ?? '')
const turnToken = String(args['turn-token'] ?? args.turnToken ?? '')
const amount = args.amount ? Number(args.amount) : undefined

if (!seatIds.includes(seat as never) || !actionKinds.includes(action as never) || !turnToken) {
  console.error('Usage: npm run game:act -- --seat uplift --turn-token <token> --action <fold|check|call|bet|raise> --amount <chips?>')
  process.exit(6)
}

postApi('/api/action', { seat, action, turnToken, amount })
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
