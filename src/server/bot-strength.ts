import type { Card } from '../shared/contracts'

const rankValues: Record<Card['rank'], number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
}

export function scoreHolding(holeCards: Card[] | null | undefined, board: Card[]) {
  if (!holeCards || holeCards.length < 2) return 0.5
  return board.length ? scorePostflop(holeCards, board) : scorePreflop(holeCards)
}

function scorePreflop(holeCards: Card[]) {
  const [a, b] = holeCards
  const high = Math.max(rankValues[a.rank], rankValues[b.rank])
  const low = Math.min(rankValues[a.rank], rankValues[b.rank])
  const gap = high - low
  const suited = a.suit === b.suit
  const broadways = [a, b].filter((card) => rankValues[card.rank] >= 10).length

  if (a.rank === b.rank) return clamp(0.54 + high / 34)

  let score = 0.18 + ((high + low - 4) / 24) * 0.42
  if (suited) score += 0.08
  if (gap === 1) score += 0.07
  else if (gap === 2) score += 0.04
  else if (gap <= 4) score += 0.02
  else score -= 0.04
  score += broadways * 0.05
  if (high === 14) score += 0.04
  if (high < 9 && !suited && gap > 3) score -= 0.08

  return clamp(score)
}

function scorePostflop(holeCards: Card[], board: Card[]) {
  const cards = [...holeCards, ...board]
  const counts = rankCounts(cards)
  const pairCounts = [...counts.values()].sort((a, b) => b - a)
  const flushCount = Math.max(...suitCounts(cards).values())
  const straight = hasStraight(cards)

  let made = 0.25
  if (pairCounts[0] >= 4) made = 0.97
  else if (pairCounts[0] >= 3 && pairCounts[1] >= 2) made = 0.91
  else if (flushCount >= 5) made = 0.86
  else if (straight) made = 0.82
  else if (pairCounts[0] >= 3) made = 0.72
  else if (pairCounts[0] >= 2 && pairCounts[1] >= 2) made = 0.64
  else if (pairCounts[0] >= 2) made = pairScore(holeCards, board, counts)
  else made = highCardScore(holeCards)

  const flushDraw = flushCount === 4 ? 0.08 : 0
  const straightDraw = hasStraightDraw(cards) ? 0.06 : 0
  return clamp(made + flushDraw + straightDraw)
}

function pairScore(holeCards: Card[], board: Card[], counts: Map<number, number>) {
  const boardHigh = Math.max(...board.map((card) => rankValues[card.rank]))
  const pairedHoleRanks = holeCards
    .map((card) => rankValues[card.rank])
    .filter((rank) => counts.get(rank) && counts.get(rank)! >= 2)
  const bestPair = pairedHoleRanks.length ? Math.max(...pairedHoleRanks) : 0
  if (!bestPair) return 0.38
  if (bestPair >= boardHigh) return 0.58 + bestPair / 100
  return 0.44 + bestPair / 120
}

function highCardScore(holeCards: Card[]) {
  const high = Math.max(...holeCards.map((card) => rankValues[card.rank]))
  return 0.2 + high / 60
}

function rankCounts(cards: Card[]) {
  const counts = new Map<number, number>()
  for (const card of cards) {
    const rank = rankValues[card.rank]
    counts.set(rank, (counts.get(rank) ?? 0) + 1)
  }
  return counts
}

function suitCounts(cards: Card[]) {
  const counts = new Map<Card['suit'], number>()
  for (const card of cards) counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1)
  return counts
}

function hasStraight(cards: Card[]) {
  return bestRunLength(cards) >= 5
}

function hasStraightDraw(cards: Card[]) {
  return bestRunLength(cards) >= 4
}

function bestRunLength(cards: Card[]) {
  const ranks = new Set(cards.map((card) => rankValues[card.rank]))
  if (ranks.has(14)) ranks.add(1)
  const sorted = [...ranks].sort((a, b) => a - b)
  let best = 0
  let current = 0
  let previous = -10
  for (const rank of sorted) {
    current = rank === previous + 1 ? current + 1 : 1
    best = Math.max(best, current)
    previous = rank
  }
  return best
}

function clamp(value: number) {
  return Math.max(0.05, Math.min(0.98, Number(value.toFixed(3))))
}
