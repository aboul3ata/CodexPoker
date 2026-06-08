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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-loop-test-'))
  process.env.CODEX_POKER_DATA_DIR = tempDir
  service = new GameService(new Storage(path.join(tempDir, 'loop.sqlite')))
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

async function runGameLoop() {
  const result = await execFileAsync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/cli/game-loop.ts'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEX_POKER_DATA_DIR: tempDir,
      CODEX_POKER_SERVER_URL: serverUrl
    },
    encoding: 'utf8'
  })
  return JSON.parse(result.stdout) as {
    loop: { status: string; steps: Array<{ kind: string; action?: string; publicInfo: string }> }
    state: GameSnapshot
    suggestedCommands: Record<string, string>
  }
}

function submitUser(preferred: 'call' | 'fold' | 'raise' = 'call') {
  const state = service.getSnapshot()
  const action = state.legalActions.find((item) => item.kind === preferred) ?? state.legalActions[0]
  return service.submitAction({
    seat: 'user',
    turnToken: state.turnToken,
    action: action.kind,
    amount: action.kind === 'bet' || action.kind === 'raise' ? action.min : undefined
  })
}

describe('game:loop CLI', () => {
  it('does not mutate the table while Ali is to act', async () => {
    const before = service.getSnapshot()
    const output = await runGameLoop()
    const after = service.getSnapshot()

    expect(output.loop.status).toBe('waiting-for-ali')
    expect(output.loop.steps).toHaveLength(0)
    expect(output.state.actingSeatId).toBe('user')
    expect(after.handId).toBe(before.handId)
    expect(after.actionSeq).toBe(before.actionSeq)
  })

  it('submits Uplift and stops at the next Ali or review point without leaking private cards', async () => {
    const upliftState = submitUser('call')
    expect(upliftState.actingSeatId).toBe('uplift')

    const output = await runGameLoop()
    const serialized = JSON.stringify(output)

    expect(output.loop.steps.some((step) => step.kind === 'uplift-action')).toBe(true)
    expect(output.state.actingSeatId === 'user' || output.state.phase === 'hand-complete').toBe(true)
    expect(serialized).not.toContain('holeCards')
    expect(serialized).not.toContain('"decision"')
    expect(serialized).not.toContain('"cards"')
  })

  it('fast-forwards to review after Ali folds instead of waiting on Uplift', async () => {
    const folded = submitUser('fold')
    expect(folded.seats.find((seat) => seat.seatId === 'user')?.isFolded).toBe(true)

    const output = await runGameLoop()

    expect(output.loop.steps.some((step) => step.kind === 'fast-forward-after-fold')).toBe(true)
    expect(output.state.phase).toBe('hand-complete')
    expect(output.loop.status).toBe('review-ready')
  })
})
