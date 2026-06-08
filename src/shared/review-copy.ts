import type { ActionKind, Card, LatestHandPacket, PublicAction, SeatId } from './contracts'

const seatNames: Record<SeatId, string> = {
  user: 'Ali',
  uplift: 'Uplift',
  pip: 'Pip',
  nova: 'Nova',
  clio: 'Clio',
  atlas: 'Atlas'
}

export function buildReviewBrief(packet: LatestHandPacket) {
  const userLine = getUserLine(packet.publicActions)
  const board = packet.showdown?.board.length ? packet.showdown.board.map(formatCard).join(' ') : 'no board shown'
  const winners = packet.result.winningSeatIds.map((seatId) => seatNames[seatId]).join(', ') || 'unknown'
  const actionSummary = packet.publicActions.map(formatAction).join(' | ') || 'No public actions were recorded.'

  return [
    `Hand: ${packet.handId}`,
    `Result: ${formatDelta(packet.result.bankrollDelta)} chips, ${formatDelta(packet.result.ratingDelta)} Elo`,
    `Bankroll now: ${formatChips(packet.result.bankrollAfter)} chips`,
    `Elo now: ${packet.result.ratingAfter}`,
    `Winner: ${winners}`,
    `Winning hand: ${packet.showdown?.winningHandName ?? 'Last player standing'}`,
    `Board: ${board}`,
    `Ali line: ${userLine}`,
    `Action trail: ${actionSummary}`,
    `Lesson seed: ${packet.lesson}`
  ].join('\n')
}

export function buildReviewMessage(packet: LatestHandPacket) {
  const result = packet.result.bankrollDelta > 0 ? 'Nice pot' : packet.result.bankrollDelta < 0 ? 'Tiny tuition' : 'Break-even note'
  const userLine = getUserLine(packet.publicActions)
  const plan = buildCoachingPlan(packet)
  return `${result}: ${formatDelta(packet.result.bankrollDelta)} chips, ${formatDelta(packet.result.ratingDelta)} Elo. Want the quick review? I saw ${userLine}. ${plan.focusSpot}`
}

export function buildCoachingPlan(packet: LatestHandPacket) {
  const userActions = packet.publicActions.filter((action) => action.seatId === 'user')
  const folded = userActions.some((action) => action.action === 'fold')
  const investedAction = [...userActions].reverse().find((action) => action.amount && action.amount > 0)
  const lastUserAction = userActions.at(-1)
  const biggestPressure = [...packet.publicActions]
    .filter((action) => action.seatId !== 'user' && action.amount)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0]
  const resultLabel = packet.result.bankrollDelta > 0 ? 'won' : packet.result.bankrollDelta < 0 ? 'lost' : 'split'
  const focusStreet = lastUserAction?.street ?? biggestPressure?.street ?? 'preflop'

  const focusSpot = folded && biggestPressure
    ? `The focus spot is your ${focusStreet} fold after ${biggestPressure.name} put ${formatChips(biggestPressure.amount ?? 0)} in.`
    : investedAction
      ? `The focus spot is your ${investedAction.street} ${formatActionKind(investedAction.action)} for ${formatChips(investedAction.amount ?? 0)}.`
      : `The focus spot is the ${focusStreet} decision where the pot story changed.`

  const didWell = folded
    ? 'Good: you let the hand go instead of turning one uncertain street into two expensive ones.'
    : packet.result.bankrollDelta >= 0
      ? 'Good: you found a line that kept the result stable or profitable.'
      : 'Good: you reached a decision point we can learn from instead of guessing after the fact.'

  const adjustment = biggestPressure
    ? `Next hand: before calling pressure, name the bettor, price, and one worse hand that pays you.`
    : 'Next hand: before adding chips, say what worse hands continue and what better hands fold.'

  const reviewScript = [
    `Ask Ali: "Want the quick review?"`,
    `If yes, start with the ${resultLabel} result and the visible action trail.`,
    `Then cover: ${focusSpot}`,
    didWell,
    adjustment
  ]

  return {
    outcome: resultLabel,
    focusSpot,
    didWell,
    adjustment,
    reviewScript
  }
}

function getUserLine(actions: PublicAction[]) {
  const userActions = actions.filter((action) => action.seatId === 'user')
  if (!userActions.length) return 'you stayed quiet this hand'
  return userActions.map((action) => `${action.street} ${formatActionKind(action.action)}${action.amount ? ` ${formatChips(action.amount)}` : ''}`).join(', ')
}

function formatAction(action: PublicAction) {
  return `${action.name} ${action.street} ${formatActionKind(action.action)}${action.amount ? ` ${formatChips(action.amount)}` : ''}`
}

function formatActionKind(action: ActionKind) {
  return action.replace('-', ' ')
}

function formatCard(card: Card) {
  return `${card.rank}${{ hearts: 'h', diamonds: 'd', clubs: 'c', spades: 's' }[card.suit]}`
}

function formatDelta(value: number) {
  return `${value >= 0 ? '+' : ''}${formatChips(value)}`
}

function formatChips(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}
