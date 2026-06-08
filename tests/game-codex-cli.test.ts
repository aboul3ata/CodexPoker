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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-guide-test-'))
  process.env.CODEX_POKER_DATA_DIR = tempDir
  service = new GameService(new Storage(path.join(tempDir, 'guide.sqlite')))
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

async function runGameCodex() {
  const result = await execFileAsync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/cli/game-codex.ts'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEX_POKER_DATA_DIR: tempDir,
      CODEX_POKER_SERVER_URL: serverUrl
    },
    encoding: 'utf8'
  })
  return JSON.parse(result.stdout) as {
    mode: string
    suggestedMessage: string
    nextInstruction: string
    suggestedCommands: Record<string, string>
    privateTurn?: { available: boolean; filePath: string }
    publicContext: { visibleLineup: unknown[] }
  }
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

describe('game:codex CLI', () => {
  it('guides public banter while Ali acts without mutating the hand', async () => {
    const before = service.getSnapshot()
    const output = await runGameCodex()
    const after = service.getSnapshot()
    const serialized = JSON.stringify(output)

    expect(output.mode).toBe('ali-to-act')
    expect(output.suggestedMessage).toContain('Your move')
    expect(output.nextInstruction).toContain('wait for Ali')
    expect(output.suggestedCommands).toEqual({
      loop: 'npm run --silent game:loop',
      banter: 'npm run --silent game:banter'
    })
    expect(output.publicContext.visibleLineup).toHaveLength(6)
    expect(after.handId).toBe(before.handId)
    expect(after.actionSeq).toBe(before.actionSeq)
    expect(serialized).not.toContain('"cards"')
    expect(serialized).not.toContain('holeCards')
    expect(serialized).not.toContain('"decision"')
  })

  it('routes Codexxyyy turns to game:loop without printing private cards', async () => {
    advanceToUplift()
    const output = await runGameCodex()
    const serialized = JSON.stringify(output)

    expect(output.mode).toBe('uplift-to-act')
    expect(output.suggestedMessage).toContain('My turn from this chat')
    expect(output.nextInstruction).toContain('game:loop')
    expect(output.suggestedCommands).toEqual({
      loop: 'npm run --silent game:loop',
      banter: 'npm run --silent game:banter',
      turn: 'npm run --silent game:turn',
      play: 'npm run --silent game:play'
    })
    expect(output.privateTurn?.available).toBe(true)
    expect(output.privateTurn?.filePath).toContain('current-turn.json')
    expect(serialized).not.toContain('holeCards')
    expect(serialized).not.toContain('"decision"')
    expect(serialized).not.toContain('"cards"')
  })

  it('guides the opt-in review flow after a completed hand', async () => {
    const completed = completeCurrentHand()
    const output = await runGameCodex()

    expect(output.mode).toBe('review-offer')
    expect(output.suggestedMessage).toContain('Want the quick Codexxyyy review')
    expect(output.nextInstruction).toContain('game:review -- --mode accepted')
    expect(output.nextInstruction).toContain('game:next')
    expect(output.suggestedCommands).toEqual({
      loop: 'npm run --silent game:loop',
      review: 'npm run --silent game:review',
      next: 'npm run --silent game:next'
    })
    expect(service.getSnapshot().handId).toBe(completed.handId)
  })
})
