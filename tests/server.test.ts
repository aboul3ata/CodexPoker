import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from '../src/server'
import { GameService } from '../src/server/game-service'
import { Storage } from '../src/server/storage'

let app: ReturnType<typeof createServer>
let tempDir: string
let previousDataDir: string | undefined

beforeEach(() => {
  previousDataDir = process.env.CODEX_POKER_DATA_DIR
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-server-test-'))
  process.env.CODEX_POKER_DATA_DIR = tempDir
  app = createServer(new GameService(new Storage(path.join(tempDir, 'server.sqlite'))))
})

afterEach(async () => {
  await app.close()
  if (previousDataDir) {
    process.env.CODEX_POKER_DATA_DIR = previousDataDir
  } else {
    delete process.env.CODEX_POKER_DATA_DIR
  }
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('Fastify API', () => {
  it('returns state and accepts a legal user action', async () => {
    const stateResponse = await app.inject({ method: 'GET', url: '/api/state' })
    expect(stateResponse.statusCode).toBe(200)
    const statePayload = stateResponse.json()
    const state = statePayload.state
    const action = state.legalActions.find((item: { kind: string }) => item.kind === 'call') ?? state.legalActions[0]

    const actionResponse = await app.inject({
      method: 'POST',
      url: '/api/action',
      payload: {
        seat: 'user',
        turnToken: state.turnToken,
        action: action.kind,
        amount: action.min
      }
    })

    expect(actionResponse.statusCode).toBe(200)
    expect(actionResponse.json().state.actionSeq).toBeGreaterThan(state.actionSeq)
  })

  it('maps malformed commands to a safe response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/action',
      payload: { seat: 'uplift', action: 'dance' }
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('malformed_command')
  })
})
