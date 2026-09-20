import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RuntimeManifest } from '../src/shared/runtime'

let supervisor: ChildProcess | undefined
let occupiedPort: net.Server | undefined
let tempDir: string | undefined

afterEach(async () => {
  if (supervisor && supervisor.exitCode === null && supervisor.signalCode === null) {
    supervisor.kill('SIGTERM')
    await new Promise((resolve) => supervisor?.once('exit', resolve))
  }
  if (occupiedPort) await new Promise<void>((resolve) => occupiedPort?.close(() => resolve()))
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
  supervisor = undefined
  occupiedPort = undefined
  tempDir = undefined
})

describe('runtime supervisor', () => {
  it('waits for a delayed API and discovers a preview port when 5173 is occupied', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-supervisor-test-'))
    occupiedPort = net.createServer()
    await new Promise<void>((resolve, reject) => {
      occupiedPort?.once('error', reject)
      occupiedPort?.listen(0, '127.0.0.1', resolve)
    })

    supervisor = spawn(process.execPath, [
      path.resolve('node_modules/tsx/dist/cli.mjs'),
      path.resolve('scripts/dev.ts')
    ], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        CODEX_POKER_DATA_DIR: tempDir,
        CODEX_POKER_API_START_DELAY_MS: '300',
        PORT: '18897',
        CODEX_POKER_PREVIEW_PORT: String((occupiedPort!.address() as net.AddressInfo).port)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const manifest = await waitForManifest(path.join(tempDir, 'runtime.json'))
    expect(manifest.apiUrl).toBe('http://127.0.0.1:18897')
    expect(manifest.previewUrl).not.toBe(`http://127.0.0.1:${(occupiedPort!.address() as net.AddressInfo).port}`)
    const health = await (await fetch(`${manifest.previewUrl}/api/health`)).json() as { runtimeId: string }
    expect(health.runtimeId).toBe(manifest.runtimeId)
  }, 15000)
})

async function waitForManifest(manifestPath: string): Promise<RuntimeManifest> {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as RuntimeManifest
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error('Timed out waiting for runtime manifest.')
}
