import type { CurrentTurnPacket, GameSnapshot, LegalAction, SeatId } from '../shared/contracts'
import { scoreHolding } from '../server/bot-strength'

export function buildPrivateTurnOutput(state: GameSnapshot, packet: CurrentTurnPacket, filePath: string) {
  const recommendation = buildRecommendedAction(packet)
  return {
    ok: true,
    protocol: {
      destination: 'Private Codex decision context',
      privateInfo: 'This output contains Uplift holeCards. Use them only to choose an action; never reveal, summarize, or hint at them in chat before showdown.',
      chatBoundary: 'Only the chatSafe section is safe to say in Codex chat before showdown.'
    },
    chatSafe: {
      mode: 'uplift-private-decision',
      speakAs: 'Uplift',
      publicTableStory: buildPublicTableStory(state),
      suggestedTableLine: buildPrivateDecisionLine(state),
      afterActionInstruction: 'After submitting game:act, use the returned codexChat.suggestedTableLine for any table talk.',
      visibleLineup: state.seats.map((seat) => ({
        seatId: seat.seatId,
        name: seat.name,
        providerLabel: seat.providerLabel,
        modelLabel: seat.modelLabel,
        tableRole: seat.tableRole,
        personality: seat.personality,
        stack: seat.stack,
        bet: seat.bet,
        status: seat.status,
        isToAct: seat.isToAct,
        isFolded: seat.isFolded
      })),
      publicActionHistory: packet.publicActionHistory
    },
    decision: {
      ...packet,
      filePath,
      recommendation,
      actionCommands: packet.legalActions.map((action) => ({
        ...action,
        command: buildActCommand(packet.turnToken, action)
      }))
    }
  }
}

export function validatePrivateTurn(state: GameSnapshot, packet: CurrentTurnPacket) {
  if (state.phase !== 'playing' || state.actingSeatId !== 'uplift') {
    throw Object.assign(new Error('Uplift is not to act. Use game:state for public table context.'), { code: 'not_to_act' })
  }
  if (packet.seat !== 'uplift' || packet.handId !== state.handId || packet.turnToken !== state.turnToken) {
    throw Object.assign(new Error('The private turn file is stale. Run game:state to refresh the live bridge.'), { code: 'stale_turn' })
  }
}

function buildActCommand(turnToken: string, action: LegalAction) {
  return buildActionCommand(turnToken, action.kind, action.kind === 'bet' || action.kind === 'raise' ? action.min ?? action.max : undefined)
}

function buildActionCommand(turnToken: string, action: LegalAction['kind'], amount?: number) {
  const amountArg = action === 'bet' || action === 'raise'
    ? ` --amount ${amount ?? 0}`
    : ''
  return `npm run --silent game:act -- --seat uplift --turn-token ${turnToken} --action ${action}${amountArg}`
}

function buildRecommendedAction(packet: CurrentTurnPacket) {
  const strength = scoreHolding(packet.holeCards, packet.board)
  const legal = packet.legalActions
  const check = legal.find((action) => action.kind === 'check')
  const call = legal.find((action) => action.kind === 'call')
  const fold = legal.find((action) => action.kind === 'fold')
  const bet = legal.find((action) => action.kind === 'bet')
  const raise = legal.find((action) => action.kind === 'raise')
  const toCall = call?.toCall ?? 0
  const cheapCall = toCall > 0 && toCall <= Math.max(100, packet.pot * 0.28)

  if (raise && strength >= 0.74) return recommendation(packet, raise, chooseWager(raise, packet.pot, strength), strength, 'private strength supports pressure')
  if (bet && strength >= 0.62) return recommendation(packet, bet, chooseWager(bet, packet.pot, strength), strength, 'private strength can lead into the pot')
  if (call && (strength >= 0.5 || cheapCall)) return recommendation(packet, call, undefined, strength, cheapCall ? 'price is small enough to continue' : 'private strength can continue')
  if (check) return recommendation(packet, check, undefined, strength, 'checking keeps the pot controlled')
  if (fold) return recommendation(packet, fold, undefined, strength, 'private strength does not justify the price')

  const fallback = legal[0] ?? { kind: 'fold' as const }
  return recommendation(packet, fallback, fallback.kind === 'bet' || fallback.kind === 'raise' ? fallback.min ?? fallback.max : undefined, strength, 'fallback to first legal action')
}

function recommendation(packet: CurrentTurnPacket, action: LegalAction, amount: number | undefined, strength: number, reason: string) {
  return {
    action: action.kind,
    amount,
    strength,
    confidence: strength >= 0.74 ? 'high' : strength >= 0.5 ? 'medium' : 'low',
    reason,
    command: buildActionCommand(packet.turnToken, action.kind, amount)
  }
}

function chooseWager(action: LegalAction, pot: number, strength: number) {
  const min = action.min ?? action.max ?? 0
  const max = action.max ?? min
  const fraction = strength >= 0.84 ? 0.72 : strength >= 0.74 ? 0.55 : 0.42
  const target = Math.max(min, roundToChip(pot * fraction))
  return Math.max(min, Math.min(max, target))
}

function roundToChip(value: number) {
  return Math.max(0, Math.round(value / 50) * 50)
}

function buildPrivateDecisionLine(state: GameSnapshot) {
  const lastAction = state.publicActions.at(-1)
  if (!lastAction) return 'I am looking at the public table texture before choosing my move.'
  return `I am weighing ${lastAction.name}'s ${lastAction.action}${lastAction.amount ? ` for ${lastAction.amount}` : ''} from the public action trail.`
}

function buildPublicTableStory(state: GameSnapshot) {
  const board = state.board.length ? state.board.map(formatCard).join(' ') : 'no community cards yet'
  const lastAction = state.publicActions.at(-1)
  const actionText = lastAction
    ? `${lastAction.name} ${lastAction.action}${lastAction.amount ? ` ${lastAction.amount}` : ''} on ${lastAction.street}`
    : 'no public actions yet'
  return `${state.street}, pot ${state.pot}, board ${board}, last action: ${actionText}.`
}

function formatCard(card: { rank: string; suit: string }) {
  const suit = {
    clubs: 'c',
    diamonds: 'd',
    hearts: 'h',
    spades: 's'
  }[card.suit] ?? card.suit[0]
  return `${card.rank}${suit}`
}
