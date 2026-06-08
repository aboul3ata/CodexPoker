import type { GameSnapshot } from './contracts'

export type CodexCommandAdvice = {
  turn?: string
  play?: string
  next?: string
  review?: string
}

export function buildCodexCommands(state: Pick<GameSnapshot, 'actingSeatId' | 'phase'>): CodexCommandAdvice {
  if (state.phase === 'hand-complete') {
    return {
      review: 'npm run --silent game:review',
      next: 'npm run --silent game:next'
    }
  }

  if (state.actingSeatId !== 'uplift') return {}

  return {
    turn: 'npm run --silent game:turn',
    play: 'npm run --silent game:play'
  }
}

export function describeCodexNextStep(state: Pick<GameSnapshot, 'actingSeatId' | 'phase' | 'bridgeStatus'>) {
  if (state.phase === 'hand-complete') return 'Hand complete. Ask Ali in this Codex chat whether they want a review or the next hand.'
  if (state.actingSeatId === 'uplift') return 'Uplift is waiting for Codex to act.'
  if (state.actingSeatId === 'user') return 'Ali is to act in the preview.'
  if (state.bridgeStatus === 'local-bots-moving') return 'Local bots are moving.'
  return 'The table is between actions.'
}
