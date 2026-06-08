import { seatIds } from '../shared/contracts'
import { parseArgs, postApi } from './client'

const args = parseArgs(process.argv.slice(2))
const seat = String(args.seat ?? '')
const turnToken = args['turn-token'] ? String(args['turn-token']) : undefined
const message = String(args.message ?? '')

if (!seatIds.includes(seat as never) || !message) {
  console.error('Usage: npm run game:say -- --seat uplift --turn-token <token> --message "table talk"')
  process.exit(6)
}

postApi('/api/say', { seat, turnToken, message })
  .then((result) => {
    console.log(JSON.stringify({ ok: true, state: result.state }, null, 2))
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
