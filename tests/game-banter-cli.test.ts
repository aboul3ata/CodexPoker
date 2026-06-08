import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-banter-test-'))
  process.env.CODEX_POKER_DATA_DIR = tempDir
  service = new GameService(new Storage(path.join(tempDir, 'banter.sqlite')))
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

async function runGameBanter() {
  return execFileAsync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/cli/game-banter.ts'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEX_POKER_DATA_DIR: tempDir,
      CODEX_POKER_SERVER_URL: serverUrl
    },
    encoding: 'utf8'
  })
}

describe('game:banter CLI', () => {
  it('prints safe public table talk without changing the hand', async () => {
    const before = service.getSnapshot()
    const result = await runGameBanter()
    const after = service.getSnapshot()
    const output = JSON.parse(result.stdout) as {
      protocol: { destination: string; publicOnly: string }
      suggestedMessage: string
      publicContext: { mode: string; visibleLineup: unknown[] }
    }
    const serialized = JSON.stringify(output)

    expect(output.protocol.destination).toBe('Codex chat')
    expect(output.protocol.publicOnly).toContain('does not submit actions')
    expect(output.suggestedMessage.length).toBeGreaterThan(20)
    expect(output.publicContext.visibleLineup).toHaveLength(6)
    expect(after.handId).toBe(before.handId)
    expect(after.actionSeq).toBe(before.actionSeq)
    expect(serialized).not.toContain('"cards"')
    expect(serialized).not.toContain('holeCards')
    expect(serialized).not.toContain('"decision"')
  })
})
