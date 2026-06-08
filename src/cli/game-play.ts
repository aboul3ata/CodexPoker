import fs from 'node:fs'
import path from 'node:path'
import type { ActionRequest, CurrentTurnPacket, GameSnapshot } from '../shared/contracts'
import { getBridgeDir } from '../server/paths'
import { getApi, postApi } from './client'
import { buildSafeStateOutput } from './state-output'
import { buildRecommendedAction, validatePrivateTurn } from './private-turn-output'

getApi('/api/state')
  .then(async (result) => {
    const currentState = result.state as GameSnapshot | undefined
    if (!currentState) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })
    if (currentState.phase !== 'playing' || currentState.actingSeatId !== 'uplift') {
      throw Object.assign(new Error('Codexxyyy is not to act. Keep playing in the preview or run game:state for context.'), { code: 'not_to_act' })
    }

    const filePath = path.join(getBridgeDir(), 'current-turn.json')
    if (!fs.existsSync(filePath)) {
      throw Object.assign(new Error('No private Codexxyyy turn file is available. Run game:state while Codexxyyy is to act.'), { code: 'not_to_act' })
    }

    const packet = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CurrentTurnPacket
    validatePrivateTurn(currentState, packet)
    const recommendation = buildRecommendedAction(packet)
    const request: ActionRequest = {
      seat: 'uplift',
      turnToken: packet.turnToken,
      action: recommendation.action,
      amount: recommendation.amount
    }
    const played = await postApi('/api/action', request)
    const state = played.state as GameSnapshot | undefined
    if (!state) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })

    console.log(JSON.stringify({
      ...buildSafeStateOutput(state),
      played: {
        seat: 'uplift',
        action: recommendation.action,
        amount: recommendation.amount,
        publicInfo: 'Codexxyyy action was selected from private turn context; only this submitted action is safe for table talk.'
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
