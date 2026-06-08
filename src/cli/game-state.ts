import type { GameSnapshot } from '../shared/contracts'
import { buildCodexCommands, describeCodexNextStep } from '../shared/codex-advice'
import { getApi } from './client'

getApi('/api/state')
  .then((result) => {
    const state = result.state as GameSnapshot | undefined
    if (!state) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })

    const payload = {
      ok: true,
      summary: describeCodexNextStep(state),
      suggestedCommands: buildCodexCommands(state),
      state: {
        handId: state.handId,
        phase: state.phase,
        street: state.street,
        actionSeq: state.actionSeq,
        actingSeatId: state.actingSeatId,
        bridgeStatus: state.bridgeStatus,
        pot: state.pot,
        board: state.board,
        bankroll: state.bankroll,
        rating: state.rating,
        tendencySummary: state.tendencySummary,
        legalActions: state.legalActions,
        seats: state.seats.map((seat) => ({
          seatId: seat.seatId,
          name: seat.name,
          providerLabel: seat.providerLabel,
          stack: seat.stack,
          bet: seat.bet,
          status: seat.status,
          isToAct: seat.isToAct,
          isFolded: seat.isFolded
        })),
        recentActions: state.publicActions.slice(-10),
        recentChat: state.chat.slice(-6),
        review: state.review
      }
    }

    console.log(JSON.stringify(payload, null, 2))
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
