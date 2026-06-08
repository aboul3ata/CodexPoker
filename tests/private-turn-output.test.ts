import { describe, expect, it } from 'vitest'
import { buildPrivateTurnOutput, validatePrivateTurn } from '../src/cli/private-turn-output'
import type { CurrentTurnPacket, GameSnapshot, SeatId } from '../src/shared/contracts'

const baseState: GameSnapshot = {
  schemaVersion: 1,
  handId: 'hand_private',
  phase: 'playing',
  street: 'flop',
  actionSeq: 8,
  turnToken: 'hand_private.8.uplift.token',
  actingSeatId: 'uplift',
  board: [
    { rank: 'K', suit: 'hearts' },
    { rank: '8', suit: 'clubs' },
    { rank: '2', suit: 'diamonds' }
  ],
  pot: 900,
  seats: [
    seat('user', 'Ali', 'Human', 'Preview player', 'Hero seat', true),
    seat('uplift', 'Codexxyyy', 'Codex', 'This Codex session', 'Chat rival', false),
    seat('pip', 'Pip', 'Local bot', 'Heuristic caller v0', 'Loose caller', false),
    seat('nova', 'Nova', 'Local bot', 'Heuristic pressure v0', 'Pot builder', false),
    seat('clio', 'Clio', 'Local bot', 'Heuristic archivist v0', 'Pattern seat', false),
    seat('atlas', 'Atlas', 'Local bot', 'Heuristic stack v0', 'Stack bully', false)
  ],
  legalActions: [{ kind: 'fold' }, { kind: 'call', toCall: 150 }, { kind: 'raise', min: 300, max: 9800 }],
  publicActions: [
    { seq: 7, seatId: 'atlas', name: 'Atlas', street: 'flop', action: 'bet', amount: 150, at: '2026-06-08T15:00:00.000Z' }
  ],
  bankroll: 10000,
  rating: 1000,
  history: [],
  tendencySummary: 'VPIP-ish 22%, preflop raise 8%, folds logged 3.',
  sessionGoal: 'Win two pots or catch one good fold',
  bridgeStatus: 'waiting-for-codex'
}

const packet: CurrentTurnPacket = {
  schemaVersion: 1,
  handId: baseState.handId,
  seat: 'uplift',
  turnToken: baseState.turnToken,
  street: 'flop',
  actionSeq: baseState.actionSeq,
  holeCards: [
    { rank: 'A', suit: 'spades' },
    { rank: 'T', suit: 'spades' }
  ],
  board: baseState.board,
  pot: baseState.pot,
  stacks: seatAmounts(9800),
  bets: seatAmounts(0),
  position: {
    user: 'button',
    uplift: 'small blind',
    pip: 'big blind',
    nova: 'under the gun',
    clio: 'middle',
    atlas: 'cutoff'
  },
  legalActions: baseState.legalActions,
  publicActionHistory: baseState.publicActions,
  userTendencies: baseState.tendencySummary
}

describe('private Codexxyyy turn output', () => {
  it('keeps chatSafe public while decision contains the private cards', () => {
    const output = buildPrivateTurnOutput(baseState, packet, '/tmp/current-turn.json')

    expect(JSON.stringify(output.decision)).toContain('holeCards')
    expect(JSON.stringify(output.decision)).toContain('spades')
    expect(JSON.stringify(output.chatSafe)).not.toContain('holeCards')
    expect(JSON.stringify(output.chatSafe)).not.toContain('spades')
    expect(output.chatSafe.visibleLineup.every((item) => !('cards' in item))).toBe(true)
    expect(output.decision.recommendation.action).toBe('call')
    expect(output.decision.recommendation.command).toContain('--action call')
    expect(output.decision.recommendation.reason).toContain('price')
    expect(output.decision.actionCommands.find((item) => item.kind === 'raise')?.command).toContain('--amount 300')
    expect(output.protocol.chatBoundary).toContain('chatSafe')
  })

  it('recommends private pressure for a strong Codexxyyy holding', () => {
    const output = buildPrivateTurnOutput(baseState, {
      ...packet,
      board: [
        { rank: 'J', suit: 'diamonds' },
        { rank: 'Q', suit: 'hearts' },
        { rank: '2', suit: 'clubs' },
        { rank: '8', suit: 'spades' }
      ],
      holeCards: [
        { rank: '9', suit: 'spades' },
        { rank: 'T', suit: 'clubs' }
      ],
      pot: 1200
    }, '/tmp/current-turn.json')

    expect(output.decision.recommendation.action).toBe('raise')
    expect(output.decision.recommendation.amount).toBeGreaterThanOrEqual(300)
    expect(output.decision.recommendation.confidence).toBe('high')
    expect(output.decision.recommendation.command).toContain('--action raise')
    expect(JSON.stringify(output.chatSafe)).not.toContain('spades')
    expect(JSON.stringify(output.chatSafe)).not.toContain('clubs')
  })

  it('rejects stale or non-Codexxyyy private turn packets', () => {
    expect(() => validatePrivateTurn({ ...baseState, actingSeatId: 'user', bridgeStatus: 'user-to-act' }, packet)).toThrow('Codexxyyy is not to act')
    expect(() => validatePrivateTurn(baseState, { ...packet, turnToken: 'stale' })).toThrow('stale')
  })
})

function seat(
  seatId: SeatId,
  name: string,
  providerLabel: string,
  modelLabel: string,
  tableRole: string,
  isToAct: boolean
): GameSnapshot['seats'][number] {
  return {
    seatId,
    seatIndex: ['user', 'uplift', 'pip', 'nova', 'clio', 'atlas'].indexOf(seatId),
    name,
    kind: seatId === 'user' ? 'human' : seatId === 'uplift' ? 'codex' : 'bot',
    providerLabel,
    modelLabel,
    tableRole,
    personality: `${name} personality.`,
    stack: 9800,
    bet: 0,
    isButton: false,
    isToAct,
    isFolded: false,
    status: isToAct ? 'thinking' : 'ready'
  }
}

function seatAmounts(value: number): Record<SeatId, number> {
  return {
    user: value,
    uplift: value,
    pip: value,
    nova: value,
    clio: value,
    atlas: value
  }
}
