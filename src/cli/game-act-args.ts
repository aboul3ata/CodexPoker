import { actionKinds, type ActionRequest } from '../shared/contracts'

export const gameActUsage = 'Usage: npm run game:act -- --seat uplift --turn-token <token> --action <fold|check|call|bet|raise> --amount <chips?>'

type ParseResult =
  | { ok: true; request: ActionRequest }
  | { ok: false; message: string }

export function parseGameActArgs(args: Record<string, string | boolean>): ParseResult {
  const seat = String(args.seat ?? '')
  const action = String(args.action ?? '')
  const turnToken = String(args['turn-token'] ?? args.turnToken ?? '')
  const rawAmount = args.amount
  let amount: number | undefined

  if (seat !== 'uplift') {
    return { ok: false, message: 'game:act is only for Codexxyyy. Ali acts from the preview controls.' }
  }

  const legalAction = actionKinds.find((kind) => kind === action)
  if (!legalAction || !turnToken) {
    return { ok: false, message: 'Missing or invalid Codexxyyy action command.' }
  }

  if (rawAmount !== undefined) {
    if (typeof rawAmount !== 'string') {
      return { ok: false, message: 'Amount must be a positive whole-chip value.' }
    }
    amount = Number(rawAmount)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      return { ok: false, message: 'Amount must be a positive whole-chip value.' }
    }
  }

  return {
    ok: true,
    request: {
      seat: 'uplift',
      action: legalAction,
      turnToken,
      amount
    }
  }
}
