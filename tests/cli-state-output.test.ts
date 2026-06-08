import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSafeStateOutput } from '../src/cli/state-output'
import type { CurrentTurnPacket, GameSnapshot, SeatId } from '../src/shared/contracts'

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
      modelLabel: 'Preview player',
      tableRole: 'Hero seat',
      personality: 'Pressure-tests Uplift with live decisions.',
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
      providerLabel: 'Codex',
      modelLabel: 'This Codex session',
      tableRole: 'Chat rival',
      personality: 'Banter in chat, private cards stay private.',
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
      modelLabel: 'Heuristic caller v0',
      tableRole: 'Loose caller',
      personality: 'Likes seeing flops and paying small prices.',
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
      modelLabel: 'Heuristic pressure v0',
      tableRole: 'Pot builder',
      personality: 'Finds small bets when the table slows down.',
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
      modelLabel: 'Heuristic archivist v0',
      tableRole: 'Pattern seat',
      personality: 'Checks often, then remembers who blinked.',
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
      modelLabel: 'Heuristic stack v0',
      tableRole: 'Stack bully',
      personality: 'Pushes when the price stays manageable.',
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
    expect(output.state.seats.find((seat) => seat.seatId === 'uplift')?.modelLabel).toBe('This Codex session')
    expect(output.state.seats.find((seat) => seat.seatId === 'atlas')?.tableRole).toBe('Stack bully')
    expect(output.codexChat.visibleLineup).toHaveLength(6)
    expect(output.codexChat.visibleLineup.find((seat) => seat.seatId === 'uplift')?.tableRole).toBe('Chat rival')
    expect(output.codexChat.visibleLineup.every((seat) => !('cards' in seat))).toBe(true)
    expect(output.codexChat.mode).toBe('ali-to-act')
    expect(output.codexChat.suggestedTableLine).toContain('Your move')
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
    expect(output.codexChat.suggestedTableLine).toContain('public context only')
    expect(output.codexChat.privateGuardrails.join(' ')).toContain('private turn file')
    expect(output.codexChat.privateGuardrails.join(' ')).toContain('game:turn')
    expect(output.suggestedCommands).toEqual({ turn: 'npm run --silent game:turn' })
    expect(output.suggestedCommands).not.toHaveProperty('act')
    expect(output.codexChat.visibleLineup.find((seat) => seat.seatId === 'nova')?.modelLabel).toBe('Heuristic pressure v0')
    expect(guide).not.toContain('spades')
    expect(guide).not.toContain('clubs')
  })

  it('redacts the private turn packet from default state output', () => {
    const previousDataDir = process.env.CODEX_POKER_DATA_DIR
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-state-'))
    process.env.CODEX_POKER_DATA_DIR = tempDir

    try {
      const bridgeDir = path.join(tempDir, 'bridge')
      fs.mkdirSync(bridgeDir, { recursive: true })
      const seatAmounts = buildSeatAmounts(0)
      const packet: CurrentTurnPacket = {
        schemaVersion: 1,
        handId: 'hand_test',
        seat: 'uplift',
        turnToken: 'hand_test.12.uplift.token',
        street: 'flop',
        actionSeq: 12,
        holeCards: [
          { rank: '2', suit: 'diamonds' },
          { rank: '9', suit: 'spades' }
        ],
        board: baseState.board,
        pot: 1200,
        stacks: buildSeatAmounts(9800),
        bets: seatAmounts,
        position: Object.fromEntries(Object.keys(seatAmounts).map((seatId) => [seatId, 'middle'])) as Record<SeatId, string>,
        legalActions: [{ kind: 'fold' }, { kind: 'call', toCall: 150 }],
        publicActionHistory: baseState.publicActions,
        userTendencies: baseState.tendencySummary
      }
      fs.writeFileSync(path.join(bridgeDir, 'current-turn.json'), `${JSON.stringify(packet)}\n`, 'utf8')

      const output = buildSafeStateOutput({
        ...baseState,
        actingSeatId: 'uplift',
        bridgeStatus: 'waiting-for-codex',
        turnToken: packet.turnToken,
        legalActions: packet.legalActions
      })
      const serialized = JSON.stringify(output)

      expect(output.privateTurn?.available).toBe(true)
      expect(output.privateTurn?.filePath).toContain('current-turn.json')
      expect(serialized).not.toContain('holeCards')
      expect(serialized).not.toContain('diamonds')
      expect(serialized).not.toContain('spades')
    } finally {
      if (previousDataDir) process.env.CODEX_POKER_DATA_DIR = previousDataDir
      else delete process.env.CODEX_POKER_DATA_DIR
      fs.rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('suggests a public chat line after Uplift acts without revealing cards', () => {
    const output = buildSafeStateOutput({
      ...baseState,
      publicActions: [
        ...baseState.publicActions,
        {
          seq: 13,
          seatId: 'uplift',
          name: 'Uplift',
          street: 'flop',
          action: 'raise',
          amount: 400,
          at: '2026-06-08T14:46:03.254Z'
        }
      ]
    })
    const serialized = JSON.stringify(output.codexChat)

    expect(output.codexChat.suggestedTableLine).toBe('I raised to 400. Your move, Ali.')
    expect(serialized).not.toContain('spades')
    expect(serialized).not.toContain('clubs')
  })
})

function buildSeatAmounts(value: number): Record<SeatId, number> {
  return {
    user: value,
    uplift: value,
    pip: value,
    nova: value,
    clio: value,
    atlas: value
  }
}
