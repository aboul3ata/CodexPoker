import type { ActionKind, Card, GameSnapshot, PublicAction, SeatId } from './contracts'

const seatNames: Record<SeatId, string> = {
  user: 'Ali',
  uplift: 'Codexxyyy',
  pip: 'Pip',
  nova: 'Nova',
  clio: 'Clio',
  atlas: 'Atlas'
}

export function buildBanterMessage(state: GameSnapshot) {
  const lastAction = state.publicActions.at(-1)
  const board = state.board.length ? `board is ${state.board.map(formatCard).join(' ')}` : 'board is still tucked away'
  const pot = `${formatChips(state.pot)} in the middle`

  if (state.phase === 'hand-complete') {
    return 'Hand complete. Want the quick Codexxyyy review, or should I shuffle the next one?'
  }

  if (state.actingSeatId === 'uplift') {
    return `My turn from this chat. Publicly, ${pot}, ${board}${lastAction ? `, and ${formatAction(lastAction)}.` : '.'}`
  }

  if (state.actingSeatId === 'user') {
    if (lastAction?.seatId === 'uplift') {
      return `${formatUpliftActionLine(lastAction)} Your move, Ali. I am staying public-side and letting the preview hold the cards.`
    }
    if (lastAction) {
      return `Your move, Ali. ${formatAction(lastAction)}; ${pot}, ${board}. I will keep the needle light.`
    }
    return 'Your move, Ali. Fresh felt, clean slate, and I am staying out of your hole cards.'
  }

  return `Local seats are resolving. ${pot}, ${board}; I will jump back in at the next real decision.`
}

export function buildBanterContext(state: GameSnapshot) {
  const lastAction = state.publicActions.at(-1)
  return {
    mode: state.phase === 'hand-complete'
      ? 'review-offer'
      : state.actingSeatId === 'uplift'
        ? 'uplift-to-act'
        : state.actingSeatId === 'user'
          ? 'ali-to-act'
          : 'bots-moving',
    publicStory: buildPublicStory(state),
    lastAction: lastAction ? {
      seq: lastAction.seq,
      seatId: lastAction.seatId,
      name: lastAction.name,
      street: lastAction.street,
      action: lastAction.action,
      amount: lastAction.amount
    } : undefined,
    visibleLineup: state.seats.map((seat) => ({
      seatId: seat.seatId,
      name: seat.name,
      providerLabel: seat.providerLabel,
      modelLabel: seat.modelLabel,
      tableRole: seat.tableRole,
      stack: seat.stack,
      bet: seat.bet,
      status: seat.status,
      isToAct: seat.isToAct,
      isFolded: seat.isFolded
    }))
  }
}

function buildPublicStory(state: GameSnapshot) {
  const board = state.board.length ? state.board.map(formatCard).join(' ') : 'no community cards yet'
  const lastAction = state.publicActions.at(-1)
  const actionText = lastAction ? formatAction(lastAction) : 'no public actions yet'
  const actor = state.actingSeatId ? `${seatNames[state.actingSeatId]} to act` : 'between actions'
  return `${state.street}, pot ${formatChips(state.pot)}, board ${board}, ${actor}, last action: ${actionText}.`
}

function formatAction(action: PublicAction) {
  return `${action.name} ${formatActionKind(action.action)}${action.amount ? ` ${formatChips(action.amount)}` : ''} on ${action.street}`
}

function formatUpliftActionLine(action: PublicAction) {
  if (action.action === 'check') return 'I checked.'
  if (action.action === 'call') return `I called${action.amount ? ` ${formatChips(action.amount)}` : ''}.`
  if (action.action === 'bet') return `I bet${action.amount ? ` ${formatChips(action.amount)}` : ''}.`
  if (action.action === 'raise') return `I raised${action.amount ? ` to ${formatChips(action.amount)}` : ''}.`
  if (action.action === 'fold') return 'I folded.'
  return `I ${formatActionKind(action.action)}.`
}

function formatActionKind(action: ActionKind) {
  return action.replace('-', ' ')
}

function formatCard(card: Card) {
  return `${card.rank}${{ hearts: 'h', diamonds: 'd', clubs: 'c', spades: 's' }[card.suit]}`
}

function formatChips(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}
