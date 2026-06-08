import type { CurrentTurnPacket, GameSnapshot, LegalAction, SeatId } from '../shared/contracts'

export function buildPrivateTurnOutput(state: GameSnapshot, packet: CurrentTurnPacket, filePath: string) {
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
  const amount = action.kind === 'bet' || action.kind === 'raise'
    ? ` --amount ${action.min ?? action.max ?? 0}`
    : ''
  return `npm run --silent game:act -- --seat uplift --turn-token ${turnToken} --action ${action.kind}${amount}`
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
