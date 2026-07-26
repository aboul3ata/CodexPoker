import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from '../src/server'
import { GameService } from '../src/server/game-service'
import { Storage } from '../src/server/storage'

const execFileAsync = promisify(execFile)
let app: ReturnType<typeof createServer>
let game: GameService
let tempDir: string
let apiUrl: string

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-watch-integration-'))
  process.env.CODEX_POKER_DATA_DIR = tempDir
  game = new GameService(new Storage(path.join(tempDir, 'integration.sqlite')))
  app = createServer(game, 'integration-runtime', 'integration-watcher-token-1234567890')
  apiUrl = await app.listen({ host: '127.0.0.1', port: 0 })
})

afterEach(async () => {
  await app.close()
  delete process.env.CODEX_POKER_DATA_DIR
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('Codex watcher handoff', () => {
  it('wakes on Ali action, stays public-safe, then lets game:loop act for Codexxyyy', async () => {
    const initial = game.getSnapshot()
    expect(initial.actingSeatId).toBe('user')
    fs.writeFileSync(path.join(tempDir, 'watcher.json'), JSON.stringify({
      schemaVersion: 1,
      runtimeId: 'integration-runtime',
      token: 'integration-watcher-token-1234567890'
    }))
    const commandEnvironment = {
      ...process.env,
      CODEX_POKER_DATA_DIR: tempDir,
      CODEX_POKER_SERVER_URL: apiUrl
    }
    const watcher = execFileAsync(process.execPath, [
      path.resolve('node_modules/tsx/dist/cli.mjs'),
      path.resolve('src/cli/game-watch.ts'),
      '--timeout-ms',
      '5000'
    ], {
      cwd: path.resolve('.'),
      env: commandEnvironment
    })
    await waitFor(() => game.getSnapshot().codexConnection === 'connected')
    expect(game.getSnapshot().codexConnection).toBe('connected')

    const action = initial.legalActions.find((item) => item.kind === 'call') ?? initial.legalActions[0]
    const afterAli = game.submitAction({
      seat: 'user',
      turnToken: initial.turnToken,
      action: action.kind,
      amount: action.kind === 'bet' || action.kind === 'raise' ? action.min : undefined
    })
    expect(afterAli.actingSeatId).toBe('uplift')

    const watcherResult = await watcher
    const watcherOutput = JSON.parse(watcherResult.stdout)
    expect(watcherOutput.reason).toBe('state-changed')
    expect(watcherOutput.event.actingSeatId).toBe('uplift')
    expect(watcherResult.stdout).not.toContain('turnToken')
    expect(watcherResult.stdout).not.toContain('legalActions')
    expect(watcherResult.stdout).not.toContain('"cards"')
    expect(game.getSnapshot().codexConnection).toBe('connected')

    const { stdout } = await execFileAsync(process.execPath, [
      path.resolve('node_modules/tsx/dist/cli.mjs'),
      path.resolve('src/cli/game-loop.ts')
    ], {
      cwd: path.resolve('.'),
      env: commandEnvironment
    })
    const loopOutput = JSON.parse(stdout)
    const final = game.getSnapshot()

    expect(loopOutput.loop.steps[0].kind).toBe('uplift-action')
    expect(final.actionSeq).toBeGreaterThan(afterAli.actionSeq)
    expect(stdout).not.toContain('holeCards')
    expect(stdout).not.toContain('turnToken')

  })
})

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Timed out waiting for watcher connection.')
}
