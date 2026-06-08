import { describe, expect, it } from 'vitest'
import type { LatestHandPacket } from '../src/shared/contracts'
import { buildCoachingPlan, buildReviewBrief, buildReviewMessage } from '../src/shared/review-copy'

const packet: LatestHandPacket = {
  schemaVersion: 1,
  handId: 'hand_test',
  completedAt: '2026-06-08T14:00:00.000Z',
  userSeat: 'user',
  result: {
    bankrollDelta: -150,
    bankrollAfter: 9850,
    ratingDelta: -2,
    ratingAfter: 998,
    winningSeatIds: ['uplift']
  },
  visibleDecisionSnapshots: [],
  publicActions: [
    { seq: 1, seatId: 'user', name: 'Ali', street: 'preflop', action: 'call', amount: 100, at: '2026-06-08T14:00:01.000Z' },
    { seq: 2, seatId: 'uplift', name: 'Uplift', street: 'flop', action: 'bet', amount: 200, at: '2026-06-08T14:00:02.000Z' },
    { seq: 3, seatId: 'user', name: 'Ali', street: 'flop', action: 'fold', at: '2026-06-08T14:00:03.000Z' }
  ],
  lesson: 'Ask what story the raise is telling before paying.',
  showdown: {
    board: [
      { rank: 'A', suit: 'clubs' },
      { rank: '9', suit: 'hearts' },
      { rank: '2', suit: 'spades' }
    ],
    revealedHands: {},
    winningHandName: 'Last player standing'
  },
  reviewPrompt: 'Review hand_test.'
}

describe('review copy', () => {
  it('builds a compact Codex-facing hand brief from the latest hand packet', () => {
    const brief = buildReviewBrief(packet)

    expect(brief).toContain('Result: -150 chips, -2 Elo')
    expect(brief).toContain('Bankroll now: 9,850 chips')
    expect(brief).toContain('Elo now: 998')
    expect(brief).toContain('Winner: Uplift')
    expect(brief).toContain('Ali line: preflop call 100, flop fold')
    expect(brief).toContain('Lesson seed: Ask what story the raise is telling before paying.')
  })

  it('builds a concise Uplift review invitation for Codex chat', () => {
    const message = buildReviewMessage(packet)

    expect(message).toContain('Tiny tuition')
    expect(message).toContain('Want the quick review?')
    expect(message).toContain('preflop call 100, flop fold')
    expect(message).toContain('focus spot')
  })

  it('does not call a break-even hand a win', () => {
    const message = buildReviewMessage({
      ...packet,
      result: { ...packet.result, bankrollDelta: 0, ratingDelta: 0 }
    })

    expect(message).toContain('Break-even note')
  })

  it('builds a structured coaching plan for chat review', () => {
    const plan = buildCoachingPlan(packet)

    expect(plan.outcome).toBe('lost')
    expect(plan.focusSpot).toContain('flop fold')
    expect(plan.focusSpot).toContain('Uplift')
    expect(plan.didWell).toContain('let the hand go')
    expect(plan.adjustment).toContain('before calling pressure')
    expect(plan.reviewScript[0]).toContain('Want the quick review?')
  })
})
