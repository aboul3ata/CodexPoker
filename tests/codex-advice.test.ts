import { describe, expect, it } from 'vitest'
import type { GameSnapshot } from '../src/shared/contracts'
import { buildCodexCommands, describeCodexNextStep } from '../src/shared/codex-advice'

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
  it('sends Uplift through private turn context instead of public card-blind action advice', () => {
    const commands = buildCodexCommands(baseState)

    expect(commands.banter).toBe('npm run --silent game:banter')
    expect(commands.turn).toBe('npm run --silent game:turn')
    expect(commands.play).toBe('npm run --silent game:play')
    expect(commands).not.toHaveProperty('act')
    expect(commands).not.toHaveProperty('say')
  })

  it('offers only public banter while Ali acts in the preview', () => {
    const commands = buildCodexCommands({
      ...baseState,
      actingSeatId: 'user'
    })

    expect(commands).toEqual({
      banter: 'npm run --silent game:banter'
    })
    expect(commands).not.toHaveProperty('play')
    expect(commands).not.toHaveProperty('act')
  })

  it('offers the review command after completed hands', () => {
    const commands = buildCodexCommands({
      ...baseState,
      phase: 'hand-complete',
      actingSeatId: null
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
