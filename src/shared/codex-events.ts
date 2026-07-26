import type { GamePhase, GameSnapshot, PublicAction, SeatId, Street } from './contracts'

export type CodexPublicEvent = {
  schemaVersion: 1
  cursor: string
  handId: string
  phase: GamePhase
  street: Street
  actionSeq: number
  actingSeatId: SeatId | null
  bridgeStatus: GameSnapshot['bridgeStatus']
  pot: number
  board: GameSnapshot['board']
  publicActions: PublicAction[]
}

export function publicEventCursor(state: Pick<GameSnapshot, 'handId' | 'actionSeq'>) {
  return `${state.handId}:${state.actionSeq}`
}

export function buildCodexPublicEvent(state: GameSnapshot): CodexPublicEvent {
  return {
    schemaVersion: 1,
    cursor: publicEventCursor(state),
    handId: state.handId,
    phase: state.phase,
    street: state.street,
    actionSeq: state.actionSeq,
    actingSeatId: state.actingSeatId,
    bridgeStatus: state.bridgeStatus,
    pot: state.pot,
    board: state.board,
    publicActions: state.publicActions
  }
}
