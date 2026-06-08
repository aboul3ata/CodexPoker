import { describe, expect, it } from 'vitest'
import { scoreHolding } from '../src/server/bot-strength'
import type { Card } from '../src/shared/contracts'

describe('bot hand strength scoring', () => {
  it('rates premium preflop hands above disconnected trash', () => {
    const aces = scoreHolding([card('A', 'spades'), card('A', 'hearts')], [])
    const trash = scoreHolding([card('7', 'clubs'), card('2', 'diamonds')], [])

    expect(aces).toBeGreaterThan(0.9)
    expect(trash).toBeLessThan(0.34)
    expect(aces).toBeGreaterThan(trash)
  })

  it('recognizes made postflop hands and draws', () => {
    const board = [card('K', 'hearts'), card('8', 'hearts'), card('2', 'clubs')]
    const topPair = scoreHolding([card('K', 'spades'), card('Q', 'clubs')], board)
    const flushDraw = scoreHolding([card('A', 'hearts'), card('4', 'hearts')], board)
    const air = scoreHolding([card('9', 'spades'), card('5', 'diamonds')], board)

    expect(topPair).toBeGreaterThan(air)
    expect(flushDraw).toBeGreaterThan(air)
    expect(topPair).toBeGreaterThan(0.6)
  })

  it('rates completed flushes and straights as pressure hands', () => {
    const flush = scoreHolding(
      [card('A', 'hearts'), card('4', 'hearts')],
      [card('K', 'hearts'), card('8', 'hearts'), card('2', 'clubs'), card('J', 'hearts'), card('7', 'diamonds')]
    )
    const straight = scoreHolding(
      [card('9', 'spades'), card('T', 'clubs')],
      [card('J', 'diamonds'), card('Q', 'hearts'), card('2', 'clubs'), card('8', 'spades')]
    )

    expect(flush).toBeGreaterThan(0.84)
    expect(straight).toBeGreaterThan(0.8)
  })
})

function card(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit }
}
