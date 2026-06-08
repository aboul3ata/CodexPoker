import fs from 'node:fs'
import path from 'node:path'
import type { CurrentTurnPacket, GameSnapshot } from '../shared/contracts'
import { getBridgeDir } from '../server/paths'
import { getApi } from './client'
import { buildPrivateTurnOutput, validatePrivateTurn } from './private-turn-output'

getApi('/api/state')
  .then((result) => {
    const state = result.state as GameSnapshot | undefined
    if (!state) throw Object.assign(new Error('The running preview did not return a game state.'), { code: 'storage_unavailable' })
    if (state.phase !== 'playing' || state.actingSeatId !== 'uplift') {
      throw Object.assign(new Error('Codexxyyy is not to act. Use game:state for public table context.'), { code: 'not_to_act' })
    }

    const filePath = path.join(getBridgeDir(), 'current-turn.json')
    if (!fs.existsSync(filePath)) {
      throw Object.assign(new Error('No private Codexxyyy turn file is available. Run game:state while Codexxyyy is to act.'), { code: 'not_to_act' })
    }

    const packet = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CurrentTurnPacket
    validatePrivateTurn(state, packet)
    console.log(JSON.stringify(buildPrivateTurnOutput(state, packet, filePath), null, 2))
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
