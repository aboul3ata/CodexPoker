import fs from 'node:fs'
import path from 'node:path'
import type { CurrentTurnPacket, GameSnapshot } from '../shared/contracts'
import { buildCodexCommands, describeCodexNextStep } from '../shared/codex-advice'
import { getBridgeDir } from '../server/paths'

export function buildSafeStateOutput(state: GameSnapshot) {
  return {
    ok: true,
    protocol: {
      tableTalk: 'Use this Codex chat for Uplift table talk and hand-review back-and-forth; the preview is only the poker table.',
      privateInfo: 'codexTurn.holeCards are private to Uplift/Codex and must not be revealed before showdown.'
    },
    summary: describeCodexNextStep(state),
    suggestedCommands: buildCodexCommands(state),
    codexTurn: getMatchingCurrentTurn(state),
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
      review: state.review
    }
  }
}

function getMatchingCurrentTurn(state: GameSnapshot) {
  if (state.actingSeatId !== 'uplift' || state.phase !== 'playing') return undefined

  const filePath = path.join(getBridgeDir(), 'current-turn.json')
  if (!fs.existsSync(filePath)) return undefined

  const packet = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CurrentTurnPacket
  if (packet.handId !== state.handId || packet.turnToken !== state.turnToken) return undefined

  return {
    handId: packet.handId,
    seat: packet.seat,
    turnToken: packet.turnToken,
    street: packet.street,
    holeCards: packet.holeCards,
    board: packet.board,
    pot: packet.pot,
    legalActions: packet.legalActions,
    publicActionHistory: packet.publicActionHistory,
    userTendencies: packet.userTendencies
  }
}
