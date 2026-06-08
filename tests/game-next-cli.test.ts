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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-next-test-'))
  process.env.CODEX_POKER_DATA_DIR = tempDir
  service = new GameService(new Storage(path.join(tempDir, 'next.sqlite')))
  app = createServer(service)
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.')
  serverUrl = `http://127.0.0.1:${address.port}`
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

async function runGameNext() {
  const result = await execFileAsync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/cli/game-next.ts'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEX_POKER_DATA_DIR: tempDir,
      CODEX_POKER_SERVER_URL: serverUrl
    },
    encoding: 'utf8'
  })
  return result.stdout
}

function completeCurrentHand() {
  let state = service.getSnapshot()
  let guard = 0
  while (state.phase !== 'hand-complete' && guard < 40) {
    guard += 1
    if (state.actingSeatId === 'uplift') {
      state = service.useUpliftFallback()
      continue
    }
    if (state.actingSeatId === 'user') {
      const fold = state.legalActions.find((action) => action.kind === 'fold') ?? state.legalActions[0]
      state = service.submitAction({
        seat: 'user',
        turnToken: state.turnToken,
        action: fold.kind,
        amount: fold.kind === 'bet' || fold.kind === 'raise' ? fold.min : undefined
      })
      if (state.phase !== 'hand-complete') state = service.fastForwardAfterFold()
      continue
    }
    throw new Error(`Unexpected actor: ${state.actingSeatId}`)
  }
  expect(state.phase).toBe('hand-complete')
  return state
}

describe('game:next CLI', () => {
  it('refuses to interrupt an active hand', async () => {
    await expect(runGameNext()).rejects.toMatchObject({
      code: 5,
      stderr: expect.stringContaining('game:next is only available after a completed hand')
    })
  })

  it('starts the next hand after a completed hand', async () => {
    const completed = completeCurrentHand()
    expect(completed.review).toBeDefined()

    const output = JSON.parse(await runGameNext()) as { state: GameSnapshot }

    expect(output.state.phase).toBe('playing')
    expect(output.state.review).toBeUndefined()
    expect(output.state.handId).not.toBe(completed.handId)
  })
})
