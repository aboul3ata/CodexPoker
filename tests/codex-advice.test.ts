import { describe, expect, it } from 'vitest'
import type { GameSnapshot } from '../src/shared/contracts'
import { buildCodexCommands, chooseCodexAction, describeCodexNextStep } from '../src/shared/codex-advice'

const baseState: Pick<GameSnapshot, 'actingSeatId' | 'phase' | 'legalActions' | 'turnToken' | 'bridgeStatus'> = {
  actingSeatId: 'uplift',
  phase: 'playing',
  legalActions: [
    { kind: 'fold' },
    { kind: 'call', toCall: 150 },
    { kind: 'raise', min: 300, max: 10000 }
  ],
  turnToken: 'hand_1.2.uplift.token',
  bridgeStatus: 'waiting-for-codex'
}

describe('Codex command advice', () => {
  it('prefers non-fold legal actions for Uplift turn commands', () => {
    expect(chooseCodexAction(baseState.legalActions)).toEqual({ kind: 'call' })

    const commands = buildCodexCommands(baseState)
    expect(commands.act).toContain('--seat uplift')
    expect(commands.act).toContain('--action call')
    expect(commands).not.toHaveProperty('say')
  })

  it('offers the review command after completed hands', () => {
    const commands = buildCodexCommands({
      ...baseState,
      phase: 'hand-complete',
      actingSeatId: null,
      legalActions: []
    })

    expect(commands).toEqual({
      review: 'npm run --silent game:review',
      next: 'npm run --silent game:next'
    })
  })

  it('summarizes the next table state for Codex', () => {
    expect(describeCodexNextStep(baseState)).toContain('waiting for Codex')
    expect(describeCodexNextStep({ ...baseState, actingSeatId: 'user', bridgeStatus: 'user-to-act' })).toContain('Ali is to act')
  })
})
