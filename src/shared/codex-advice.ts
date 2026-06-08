import type { ActionKind, GameSnapshot, LegalAction } from './contracts'

export type CodexCommandAdvice = {
  act?: string
  say?: string
  review?: string
}

export function chooseCodexAction(actions: LegalAction[]): { kind: ActionKind; amount?: number } {
  const check = actions.find((action) => action.kind === 'check')
  if (check) return { kind: 'check' }
  const call = actions.find((action) => action.kind === 'call')
  if (call && (call.toCall ?? 0) <= 200) return { kind: 'call' }
  const raise = actions.find((action) => action.kind === 'raise')
  if (raise && raise.min && raise.min <= 300) return { kind: 'raise', amount: raise.min }
  const fold = actions.find((action) => action.kind === 'fold')
  return { kind: fold?.kind ?? actions[0]?.kind ?? 'fold' }
}

export function buildCodexCommands(state: Pick<GameSnapshot, 'actingSeatId' | 'phase' | 'legalActions' | 'turnToken'>): CodexCommandAdvice {
  if (state.phase === 'hand-complete') {
    return { review: 'npm run --silent game:review -- --post' }
  }

  if (state.actingSeatId !== 'uplift') return {}

  const action = chooseCodexAction(state.legalActions)
  const amountArg = action.amount ? ` --amount ${action.amount}` : ''
  return {
    act: `npm run --silent game:act -- --seat uplift --turn-token ${state.turnToken} --action ${action.kind}${amountArg}`,
    say: `npm run --silent game:say -- --seat uplift --turn-token ${state.turnToken} --message "I am studying your betting story."`
  }
}

export function describeCodexNextStep(state: Pick<GameSnapshot, 'actingSeatId' | 'phase' | 'bridgeStatus'>) {
  if (state.phase === 'hand-complete') return 'Hand complete. Review the latest hand or start the next one.'
  if (state.actingSeatId === 'uplift') return 'Uplift is waiting for Codex to act or banter.'
  if (state.actingSeatId === 'user') return 'Ali is to act in the preview.'
  if (state.bridgeStatus === 'local-bots-moving') return 'Local bots are moving.'
  return 'The table is between actions.'
}
