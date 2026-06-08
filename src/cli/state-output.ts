import fs from 'node:fs'
import path from 'node:path'
import type { CurrentTurnPacket, GameSnapshot } from '../shared/contracts'
import { buildCodexCommands, describeCodexNextStep } from '../shared/codex-advice'
import { getBridgeDir } from '../server/paths'

export function buildSafeStateOutput(state: GameSnapshot) {
  const privateTurn = getMatchingCurrentTurn(state)

  return {
    ok: true,
    protocol: {
      tableTalk: 'Use this Codex chat for Uplift table talk and hand-review back-and-forth; the preview is only the poker table.',
      privateInfo: 'Uplift private cards stay in the private turn file and must not be revealed before showdown.'
    },
    summary: describeCodexNextStep(state),
    codexChat: buildCodexChatGuide(state),
    suggestedCommands: buildCodexCommands(state),
    privateTurn: privateTurn ? buildPrivateTurnReference(privateTurn) : undefined,
    state: {
      handId: state.handId,
      phase: state.phase,
      street: state.street,
      actionSeq: state.actionSeq,
      actingSeatId: state.actingSeatId,
      bridgeStatus: state.bridgeStatus,
      pot: state.pot,
      board: state.board,
      bankroll: state.bankroll,
      rating: state.rating,
      tendencySummary: state.tendencySummary,
      legalActions: state.legalActions,
      seats: state.seats.map((seat) => ({
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
      recentActions: state.publicActions.slice(-10),
      review: state.review
    }
  }
}

function buildPrivateTurnReference(turn: { filePath: string; packet: CurrentTurnPacket }) {
  return {
    available: true,
    handId: turn.packet.handId,
    seat: turn.packet.seat,
    turnToken: turn.packet.turnToken,
    street: turn.packet.street,
    actionSeq: turn.packet.actionSeq,
    filePath: turn.filePath,
    privateInfo: 'Read this file only for Uplift action selection. Never quote, summarize, or hint at the private cards in chat.'
  }
}

function buildCodexChatGuide(state: GameSnapshot) {
  if (state.phase === 'hand-complete') {
    return {
      mode: 'review-offer',
      speakAs: 'Uplift',
      publicTableStory: buildPublicTableStory(state),
      visibleLineup: buildVisibleLineup(state),
      suggestedTableLine: buildSuggestedTableLine(state),
      tableTalkCue: 'Ask Ali in this Codex chat if they want the quick hand review or want to shuffle the next hand.',
      privateGuardrails: [
        'Use npm run --silent game:review only after Ali wants the review.',
        'Discuss what was visible at decision time before mentioning showdown-only information.',
        'Keep the preview focused on the table; do not post review copy into the app UI.'
      ]
    }
  }

  if (state.actingSeatId === 'uplift') {
    return {
      mode: 'uplift-to-act',
      speakAs: 'Uplift',
      publicTableStory: buildPublicTableStory(state),
      visibleLineup: buildVisibleLineup(state),
      suggestedTableLine: buildSuggestedTableLine(state),
      tableTalkCue: 'Banter here as Uplift using only public board/action context, then act with game:act.',
      privateGuardrails: [
        'You may read the private turn file for Uplift action selection only.',
        'Never reveal, summarize, or hint at exact Uplift hole cards before showdown.',
        'Do not move for Ali; only submit an action for --seat uplift.',
        'Run npm run --silent game:turn to inspect privately, or npm run --silent game:play to submit the private recommendation.'
      ]
    }
  }

  if (state.actingSeatId === 'user') {
    return {
      mode: 'ali-to-act',
      speakAs: 'Uplift',
      publicTableStory: buildPublicTableStory(state),
      visibleLineup: buildVisibleLineup(state),
      suggestedTableLine: buildSuggestedTableLine(state),
      tableTalkCue: 'Wait for Ali to act in the preview; light banter in this chat is fine, but do not submit a user action.',
      privateGuardrails: [
        'Do not infer or ask to see Ali hole cards beyond what the preview shows to the user.',
        'Do not use fallback or bot endpoints as normal play.',
        'After Ali acts, run npm run --silent game:state again before deciding for Uplift.'
      ]
    }
  }

  return {
    mode: 'bots-moving',
    speakAs: 'Uplift',
    publicTableStory: buildPublicTableStory(state),
    visibleLineup: buildVisibleLineup(state),
    suggestedTableLine: buildSuggestedTableLine(state),
    tableTalkCue: 'Local bots are resolving the table state; wait for the next user or Uplift decision point.',
    privateGuardrails: [
      'Refresh with npm run --silent game:state before speaking as if a new decision is available.'
    ]
  }
}

function buildSuggestedTableLine(state: GameSnapshot) {
  if (state.phase === 'hand-complete') {
    return 'Hand complete. Want the quick Uplift review, or should we shuffle the next one?'
  }

  const lastAction = state.publicActions.at(-1)
  if (lastAction?.seatId === 'uplift') {
    return `${formatUpliftActionLine(lastAction)} Your move, Ali.`
  }

  if (state.actingSeatId === 'uplift') {
    return `Give one short table line from public context only, then choose an Uplift action. ${buildPublicTableStory(state)}`
  }

  if (state.actingSeatId === 'user') {
    return 'Your move in the preview. I will keep the needle light and the hole cards private.'
  }

  return 'The local seats are resolving quickly; I will wait for the next real decision point.'
}

function buildVisibleLineup(state: GameSnapshot) {
  return state.seats.map((seat) => ({
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
  }))
}

function formatUpliftActionLine(action: { action: string; amount?: number }) {
  if (action.action === 'check') return 'I checked.'
  if (action.action === 'call') return `I called${action.amount ? ` ${action.amount}` : ''}.`
  if (action.action === 'bet') return `I bet${action.amount ? ` ${action.amount}` : ''}.`
  if (action.action === 'raise') return `I raised${action.amount ? ` to ${action.amount}` : ''}.`
  if (action.action === 'fold') return 'I folded.'
  return `I ${action.action}.`
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

function getMatchingCurrentTurn(state: GameSnapshot): { filePath: string; packet: CurrentTurnPacket } | undefined {
  if (state.actingSeatId !== 'uplift' || state.phase !== 'playing') return undefined

  const filePath = path.join(getBridgeDir(), 'current-turn.json')
  if (!fs.existsSync(filePath)) return undefined

  const packet = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CurrentTurnPacket
  if (packet.handId !== state.handId || packet.turnToken !== state.turnToken) return undefined

  return { filePath, packet }
}
