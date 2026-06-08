import { describe, expect, it } from 'vitest'
import type { GameSnapshot, SeatId } from '../src/shared/contracts'
import { buildBanterContext, buildBanterMessage } from '../src/shared/banter-copy'

const baseState: GameSnapshot = {
  schemaVersion: 1,
  handId: 'hand_banter',
  phase: 'playing',
  street: 'flop',
  actionSeq: 4,
  turnToken: 'hand_banter.4.user.token',
  actingSeatId: 'user',
  board: [
    { rank: 'A', suit: 'hearts' },
    { rank: '7', suit: 'clubs' },
    { rank: '2', suit: 'diamonds' }
  ],
  pot: 600,
  seats: [
    seat('user', 'Ali', true),
    seat('uplift', 'Uplift', false),
    seat('pip', 'Pip', false),
    seat('nova', 'Nova', false),
    seat('clio', 'Clio', false),
    seat('atlas', 'Atlas', false)
  ],
  legalActions: [{ kind: 'fold' }, { kind: 'call', toCall: 100 }],
  publicActions: [
    { seq: 4, seatId: 'uplift', name: 'Uplift', street: 'flop', action: 'bet', amount: 200, at: '2026-06-08T16:00:00.000Z' }
  ],
  bankroll: 10000,
  rating: 1000,
  history: [],
  tendencySummary: 'VPIP-ish 12%, preflop raise 4%, folds logged 2.',
  sessionGoal: 'Win two pots or catch one good fold',
  bridgeStatus: 'user-to-act'
}

describe('banter copy', () => {
  it('builds public table talk for Ali turns without exposing hidden cards', () => {
    const message = buildBanterMessage(baseState)
    const context = buildBanterContext(baseState)
    const serialized = JSON.stringify({ message, context })

    expect(message).toContain('Your move, Ali')
    expect(message).toContain('I bet 200')
    expect(context.mode).toBe('ali-to-act')
    expect(serialized).not.toContain('"cards"')
    expect(serialized).not.toContain('spades')
    expect(serialized).not.toContain('private')
  })

  it('keeps Uplift turns public and points back to this chat', () => {
    const message = buildBanterMessage({
      ...baseState,
      actingSeatId: 'uplift',
      bridgeStatus: 'waiting-for-codex'
    })

    expect(message).toContain('My turn from this chat')
    expect(message).toContain('600 in the middle')
    expect(message).not.toContain('hole')
  })
})

function seat(seatId: SeatId, name: string, isToAct: boolean): GameSnapshot['seats'][number] {
  return {
    seatId,
    seatIndex: ['user', 'uplift', 'pip', 'nova', 'clio', 'atlas'].indexOf(seatId),
    name,
    kind: seatId === 'user' ? 'human' : seatId === 'uplift' ? 'codex' : 'bot',
    providerLabel: seatId === 'user' ? 'Human' : seatId === 'uplift' ? 'Codex' : 'Local bot',
    modelLabel: seatId === 'uplift' ? 'This Codex session' : 'Preview model',
    tableRole: seatId === 'user' ? 'Hero seat' : 'Table seat',
    personality: `${name} personality.`,
    stack: 10000,
    bet: 0,
    isButton: false,
    isToAct,
    isFolded: false,
    status: isToAct ? 'thinking' : 'ready',
    cards: [
      { rank: 'K', suit: 'spades' },
      { rank: 'Q', suit: 'spades' }
    ]
  }
}
