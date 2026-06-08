import { z } from 'zod'

export const seatIds = ['user', 'uplift', 'pip', 'nova', 'clio', 'atlas'] as const
export type SeatId = (typeof seatIds)[number]

export const actionKinds = ['fold', 'check', 'call', 'bet', 'raise'] as const
export type ActionKind = (typeof actionKinds)[number]

export type Card = {
  rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'
  suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river'
export type GamePhase = 'playing' | 'hand-complete'

export type LegalAction = {
  kind: ActionKind
  min?: number
  max?: number
  toCall?: number
}

export type SeatView = {
  seatId: SeatId
  seatIndex: number
  name: string
  kind: 'human' | 'codex' | 'bot'
  providerLabel: string
  stack: number
  bet: number
  isButton: boolean
  isToAct: boolean
  isFolded: boolean
  status: 'ready' | 'thinking' | 'fallback' | 'folded' | 'winner'
  cards?: Card[]
  revealedCards?: Card[]
}

export type ChatMessage = {
  id: string
  seatId: SeatId
  name: string
  message: string
  at: string
  tone: 'banter' | 'system' | 'coach'
}

export type PublicAction = {
  seq: number
  seatId: SeatId
  name: string
  street: Street
  action: ActionKind
  amount?: number
  at: string
}

export type ReviewSnapshot = {
  handId: string
  completedAt: string
  bankrollDelta: number
  ratingDelta: number
  winningSeatIds: SeatId[]
  winningHandName: string
  lesson: string
  publicActions: PublicAction[]
  showdownCards: Partial<Record<SeatId, Card[]>>
}

export type GameSnapshot = {
  schemaVersion: 1
  handId: string
  phase: GamePhase
  street: Street
  actionSeq: number
  turnToken: string
  actingSeatId: SeatId | null
  board: Card[]
  pot: number
  seats: SeatView[]
  legalActions: LegalAction[]
  publicActions: PublicAction[]
  chat: ChatMessage[]
  bankroll: number
  rating: number
  tendencySummary: string
  sessionGoal: string
  bridgeStatus: 'waiting-for-codex' | 'local-bots-moving' | 'user-to-act' | 'hand-complete'
  review?: ReviewSnapshot
}

export const actionRequestSchema = z.object({
  seat: z.enum(seatIds),
  turnToken: z.string().min(1),
  action: z.enum(actionKinds),
  amount: z.number().int().positive().optional()
})

export type ActionRequest = z.infer<typeof actionRequestSchema>

export const sayRequestSchema = z.object({
  seat: z.enum(seatIds),
  turnToken: z.string().optional(),
  message: z.string().trim().min(1).max(240)
})

export type SayRequest = z.infer<typeof sayRequestSchema>

export type CurrentTurnPacket = {
  schemaVersion: 1
  handId: string
  seat: 'uplift'
  turnToken: string
  street: Street
  actionSeq: number
  holeCards: Card[]
  board: Card[]
  pot: number
  stacks: Record<SeatId, number>
  bets: Record<SeatId, number>
  position: Record<SeatId, string>
  legalActions: LegalAction[]
  publicActionHistory: PublicAction[]
  userTendencies: string
}

export type LatestHandPacket = {
  schemaVersion: 1
  handId: string
  completedAt: string
  userSeat: 'user'
  result: {
    bankrollDelta: number
    ratingDelta: number
    winningSeatIds: SeatId[]
  }
  visibleDecisionSnapshots: PublicAction[]
  publicActions: PublicAction[]
  showdown?: {
    board: Card[]
    revealedHands: Partial<Record<SeatId, Card[]>>
    winningHandName: string
  }
  reviewPrompt: string
}

export type LastErrorPacket = {
  schemaVersion: 1
  at: string
  command: 'game:act' | 'game:say'
  handId?: string
  turnToken?: string
  code: 'invalid_action' | 'stale_turn' | 'wrong_seat' | 'not_to_act' | 'malformed_command' | 'storage_unavailable'
  message: string
}
