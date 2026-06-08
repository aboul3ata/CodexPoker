import { describe, expect, it } from 'vitest'
import { gameActUsage, parseGameActArgs } from '../src/cli/game-act-args'

describe('game:act argument parsing', () => {
  it('accepts valid Uplift actions for the Codex bridge', () => {
    const parsed = parseGameActArgs({
      seat: 'uplift',
      'turn-token': 'hand_1.2.uplift.token',
      action: 'raise',
      amount: '450'
    })

    expect(parsed).toEqual({
      ok: true,
      request: {
        seat: 'uplift',
        turnToken: 'hand_1.2.uplift.token',
        action: 'raise',
        amount: 450
      }
    })
  })

  it('rejects Ali actions because the human acts in the preview', () => {
    const parsed = parseGameActArgs({
      seat: 'user',
      'turn-token': 'hand_1.2.user.token',
      action: 'check'
    })

    expect(parsed).toEqual({
      ok: false,
      message: 'game:act is only for Uplift. Ali acts from the preview controls.'
    })
    expect(gameActUsage).toContain('--seat uplift')
  })

  it('rejects malformed wager amounts before posting to the table API', () => {
    const parsed = parseGameActArgs({
      seat: 'uplift',
      'turn-token': 'hand_1.2.uplift.token',
      action: 'bet',
      amount: '12.5'
    })

    expect(parsed).toEqual({
      ok: false,
      message: 'Amount must be a positive whole-chip value.'
    })
  })

  it('rejects an amount flag without a value', () => {
    const parsed = parseGameActArgs({
      seat: 'uplift',
      'turn-token': 'hand_1.2.uplift.token',
      action: 'bet',
      amount: true
    })

    expect(parsed).toEqual({
      ok: false,
      message: 'Amount must be a positive whole-chip value.'
    })
  })
})
