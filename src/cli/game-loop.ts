import fs from 'node:fs'
import path from 'node:path'
import type { ActionRequest, CurrentTurnPacket, GameSnapshot } from '../shared/contracts'
import { getBridgeDir } from '../server/paths'
import { getApi, postApi } from './client'
import { buildRecommendedAction, validatePrivateTurn } from './private-turn-output'
import { buildSafeStateOutput } from './state-output'

type LoopStep = {
  kind: 'uplift-action' | 'fast-forward-after-fold'
  action?: string
  amount?: number
  publicInfo: string
}

getApi('/api/state')
  .then(async (result) => {
    let state = result.state as GameSnapshot | undefined
    if (!state) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })

    const steps: LoopStep[] = []
    let guard = 0

    while (state.phase === 'playing' && guard < 12) {
      guard += 1

      if (hasUserFolded(state)) {
        const result = await postApi('/api/fast-forward')
        state = requireState(result.state)
        steps.push({
          kind: 'fast-forward-after-fold',
          publicInfo: 'Ali folded, so the rest of the hand was simulated to the result.'
        })
        break
      }

      if (state.actingSeatId !== 'uplift') break

      const filePath = path.join(getBridgeDir(), 'current-turn.json')
      if (!fs.existsSync(filePath)) {
        await getApi('/api/state')
      }
      if (!fs.existsSync(filePath)) {
        throw Object.assign(new Error('No private Codexxyyy turn file is available. Run game:state while Codexxyyy is to act.'), { code: 'not_to_act' })
      }

      const packet = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CurrentTurnPacket
      validatePrivateTurn(state, packet)
      const recommendation = buildRecommendedAction(packet)
      const request: ActionRequest = {
        seat: 'uplift',
        turnToken: packet.turnToken,
        action: recommendation.action,
        amount: recommendation.amount
      }
      const played = await postApi('/api/action', request)
      state = requireState(played.state)
      steps.push({
        kind: 'uplift-action',
        action: recommendation.action,
        amount: recommendation.amount,
        publicInfo: 'Codexxyyy acted from private turn context; no hidden cards are included in this output.'
      })
    }

    console.log(JSON.stringify({
      ...buildSafeStateOutput(state),
      loop: {
        status: loopStatus(state),
        steps,
        next: loopNext(state),
        publicInfo: 'Run game:loop after each Ali message or preview action. It will act only for Codexxyyy or fast-forward after Ali folds.'
      }
    }, null, 2))
  })
  .catch((error: Error & { code?: string }) => {
    console.error(`${error.code ?? 'error'}: ${error.message}`)
    const exits: Record<string, number> = {
      invalid_action: 2,
      stale_turn: 3,
      wrong_seat: 4,
      not_to_act: 5,
      malformed_command: 6,
      storage_unavailable: 7
    }
    process.exit(exits[error.code ?? ''] ?? 1)
  })

function requireState(state: unknown): GameSnapshot {
  if (!state) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })
  return state as GameSnapshot
}

function hasUserFolded(state: GameSnapshot) {
  return Boolean(state.seats.find((seat) => seat.seatId === 'user')?.isFolded)
}

function loopStatus(state: GameSnapshot) {
  if (state.phase === 'hand-complete') return 'review-ready'
  if (state.actingSeatId === 'user') return 'waiting-for-ali'
  if (state.actingSeatId === 'uplift') return 'uplift-still-to-act'
  return 'table-advancing'
}

function loopNext(state: GameSnapshot) {
  if (state.phase === 'hand-complete') return 'Ask Ali whether they want the review or the next hand.'
  if (state.actingSeatId === 'user') return 'Ali should act in the preview.'
  if (state.actingSeatId === 'uplift') return 'Run npm run --silent game:loop again to submit Codexxyyy safely.'
  return 'Run npm run --silent game:loop again after the table updates.'
}
