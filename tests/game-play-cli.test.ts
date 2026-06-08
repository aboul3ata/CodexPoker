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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-play-test-'))
  process.env.CODEX_POKER_DATA_DIR = tempDir
  service = new GameService(new Storage(path.join(tempDir, 'play.sqlite')))
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

async function runGamePlay() {
  return execFileAsync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/cli/game-play.ts'], {
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

describe('game:play CLI', () => {
  it('refuses when Codexxyyy is not to act', async () => {
    await expect(runGamePlay()).rejects.toMatchObject({
      code: 5,
      stderr: expect.stringContaining('Codexxyyy is not to act')
    })
  })

  it('submits Codexxyyy private recommended action and returns safe state output', async () => {
    const before = advanceToUplift()
    const result = await runGamePlay()
    const output = JSON.parse(result.stdout) as {
      played: { seat: string; action: string; amount?: number; publicInfo: string }
      state: GameSnapshot
      suggestedCommands: Record<string, string>
    }
    const serialized = JSON.stringify(output)

    expect(output.played.seat).toBe('uplift')
    expect(output.played.action).toMatch(/fold|check|call|bet|raise/)
    expect(output.played.publicInfo).toContain('private turn context')
    expect(output.state.actionSeq).toBeGreaterThan(before.actionSeq)
    expect(serialized).not.toContain('holeCards')
    expect(serialized).not.toContain('"decision"')
    expect(serialized).not.toContain('"cards"')
  })
})
