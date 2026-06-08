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
  return `${result}: ${formatDelta(packet.result.bankrollDelta)} chips, ${formatDelta(packet.result.ratingDelta)} Elo. Want the quick review? I saw ${userLine}. ${packet.lesson}`
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
