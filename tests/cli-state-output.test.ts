import { describe, expect, it } from 'vitest'
import { buildSafeStateOutput } from '../src/cli/state-output'
import type { GameSnapshot } from '../src/shared/contracts'

const baseState: GameSnapshot = {
  schemaVersion: 1,
  handId: 'hand_test',
  phase: 'playing',
  street: 'flop',
  actionSeq: 12,
  turnToken: 'hand_test.12.user.token',
  actingSeatId: 'user',
  board: [
    { rank: '4', suit: 'hearts' },
    { rank: 'K', suit: 'hearts' },
    { rank: 'Q', suit: 'hearts' }
  ],
  pot: 1200,
  seats: [
    {
      seatId: 'user',
      seatIndex: 0,
      name: 'Ali',
      kind: 'human',
      providerLabel: 'Human',
      stack: 10200,
      bet: 0,
      isButton: true,
      isToAct: true,
      isFolded: false,
      status: 'thinking',
      cards: [
        { rank: 'A', suit: 'spades' },
        { rank: 'J', suit: 'clubs' }
      ]
    },
    {
      seatId: 'uplift',
      seatIndex: 1,
      name: 'Uplift',
      kind: 'codex',
      providerLabel: 'Codex bridge',
      stack: 9800,
      bet: 0,
      isButton: false,
      isToAct: false,
      isFolded: false,
      status: 'ready',
      cards: [
        { rank: 'K', suit: 'spades' },
        { rank: '7', suit: 'clubs' }
      ]
    },
    {
      seatId: 'pip',
      seatIndex: 2,
      name: 'Pip',
      kind: 'bot',
      providerLabel: 'Local bot',
      stack: 9800,
      bet: 0,
      isButton: false,
      isToAct: false,
      isFolded: false,
      status: 'ready'
    },
    {
      seatId: 'nova',
      seatIndex: 3,
      name: 'Nova',
      kind: 'bot',
      providerLabel: 'Local bot',
      stack: 9800,
      bet: 0,
      isButton: false,
      isToAct: false,
      isFolded: false,
      status: 'ready'
    },
    {
      seatId: 'clio',
      seatIndex: 4,
      name: 'Clio',
      kind: 'bot',
      providerLabel: 'Local bot',
      stack: 9800,
      bet: 0,
      isButton: false,
      isToAct: false,
      isFolded: false,
      status: 'ready'
    },
    {
      seatId: 'atlas',
      seatIndex: 5,
      name: 'Atlas',
      kind: 'bot',
      providerLabel: 'Local bot',
      stack: 9800,
      bet: 0,
      isButton: false,
      isToAct: false,
      isFolded: false,
      status: 'ready'
    }
  ],
  legalActions: [{ kind: 'check' }, { kind: 'bet', min: 100, max: 10200 }],
  publicActions: [
    {
      seq: 12,
      seatId: 'atlas',
      name: 'Atlas',
      street: 'flop',
      action: 'check',
      at: '2026-06-08T14:45:56.254Z'
    }
  ],
  bankroll: 10400,
  rating: 1005,
  history: [],
  tendencySummary: 'VPIP-ish 13%, preflop raise 0%, folds logged 15.',
  sessionGoal: 'Win two pots or catch one good fold',
  bridgeStatus: 'user-to-act'
}

describe('safe CLI state output', () => {
  it('strips hidden seat cards from bridge command responses', () => {
    const output = buildSafeStateOutput(baseState)
    const serialized = JSON.stringify(output)

    expect(serialized).not.toContain('"cards"')
    expect(serialized).not.toContain('"revealedCards"')
    expect(serialized).not.toContain('spades')
    expect(serialized).not.toContain('clubs')
    expect(output.state.seats.every((seat) => !('cards' in seat))).toBe(true)
    expect(output.protocol.tableTalk).toContain('Use this Codex chat')
    expect(output.protocol.privateInfo).toContain('must not be revealed')
    expect(output.state).not.toHaveProperty('recentChat')
    expect(output.state).not.toHaveProperty('chat')
    expect(output.codexChat.mode).toBe('ali-to-act')
    expect(output.codexChat.tableTalkCue).toContain('Wait for Ali to act')
    expect(output.codexChat.publicTableStory).toContain('last action: Atlas check on flop')
    expect(output.codexChat.privateGuardrails.join(' ')).toContain('Do not use fallback')
  })

  it('guides Uplift turns toward chat banter without exposing private cards in the public guide', () => {
    const output = buildSafeStateOutput({
      ...baseState,
      actingSeatId: 'uplift',
      bridgeStatus: 'waiting-for-codex',
      turnToken: 'hand_test.12.uplift.token',
      legalActions: [{ kind: 'fold' }, { kind: 'call', toCall: 150 }]
    })
    const guide = JSON.stringify(output.codexChat)

    expect(output.codexChat.mode).toBe('uplift-to-act')
    expect(output.codexChat.tableTalkCue).toContain('Banter here as Uplift')
    expect(output.codexChat.privateGuardrails.join(' ')).toContain('codexTurn.holeCards')
    expect(guide).not.toContain('spades')
    expect(guide).not.toContain('clubs')
  })
})
