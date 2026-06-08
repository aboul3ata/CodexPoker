import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GameSnapshot } from '../src/shared/contracts'
import { createServer } from '../src/server'
import { GameService } from '../src/server/game-service'
import { Storage } from '../src/server/storage'

let service: GameService
let app: ReturnType<typeof createServer>
let tempDir: string
let serverUrl: string
let previousDataDir: string | undefined
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const execFileAsync = promisify(execFile)

beforeEach(async () => {
  previousDataDir = process.env.CODEX_POKER_DATA_DIR
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-turn-test-'))
  process.env.CODEX_POKER_DATA_DIR = tempDir
  service = new GameService(new Storage(path.join(tempDir, 'turn.sqlite')))
  app = createServer(service)
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.')
  serverUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  await app.close()
  service.close()
  if (previousDataDir) {
    process.env.CODEX_POKER_DATA_DIR = previousDataDir
  } else {
    delete process.env.CODEX_POKER_DATA_DIR
  }
  fs.rmSync(tempDir, { recursive: true, force: true })
})

async function runGameTurn() {
  return execFileAsync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/cli/game-turn.ts'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEX_POKER_DATA_DIR: tempDir,
      CODEX_POKER_SERVER_URL: serverUrl
    },
    encoding: 'utf8'
  })
}

function advanceToUplift() {
  let state = service.getSnapshot()
  if (state.actingSeatId === 'uplift') return state
  const action = state.legalActions.find((item) => item.kind === 'call') ?? state.legalActions[0]
  state = service.submitAction({
    seat: 'user',
    turnToken: state.turnToken,
    action: action.kind,
    amount: action.kind === 'bet' || action.kind === 'raise' ? action.min : undefined
  })
  expect(state.actingSeatId).toBe('uplift')
  return state
}

describe('game:turn CLI', () => {
  it('refuses to expose private context when Codexxyyy is not to act', async () => {
    await expect(runGameTurn()).rejects.toMatchObject({
      code: 5,
      stderr: expect.stringContaining('Codexxyyy is not to act')
    })
  })

  it('prints a validated private decision packet only for the active Codexxyyy turn', async () => {
    const state = advanceToUplift()
    const result = await runGameTurn()
    const output = JSON.parse(result.stdout) as {
      chatSafe: { visibleLineup: Array<Record<string, unknown>> }
      decision: { handId: string; turnToken: string; holeCards: unknown[]; actionCommands: Array<{ command: string }> }
    }

    expect(output.decision.handId).toBe(state.handId)
    expect(output.decision.turnToken).toBe(state.turnToken)
    expect(output.decision.holeCards).toHaveLength(2)
    expect(output.decision.actionCommands[0].command).toContain('game:act')
    expect(JSON.stringify(output.chatSafe)).not.toContain('holeCards')
    expect(output.chatSafe.visibleLineup.every((seat) => !('cards' in seat))).toBe(true)
  })

  it('repairs a stale private turn file before printing the active decision packet', async () => {
    const state = advanceToUplift()
    const packetPath = path.join(tempDir, 'bridge/current-turn.json')
    const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'))
    fs.writeFileSync(packetPath, JSON.stringify({ ...packet, turnToken: `${state.turnToken}.stale` }), 'utf8')

    const result = await runGameTurn()
    const output = JSON.parse(result.stdout) as { decision: { turnToken: string } }

    expect(output.decision.turnToken).toBe(state.turnToken)
  })
})
