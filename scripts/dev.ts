import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fetchHealth } from '../src/cli/runtime'
import { runtimeSchemaVersion, type RuntimeManifest } from '../src/shared/runtime'
import { ensureDataDirs, getDataDir, pathFromRoot } from '../src/server/paths'

const runtimeId = process.env.CODEX_POKER_RUNTIME_ID ?? randomUUID()
const watcherToken = randomUUID()
const apiPort = await findOpenPort(Number(process.env.PORT ?? 8797))
const previewPort = await findOpenPort(Number(process.env.CODEX_POKER_PREVIEW_PORT ?? 5173))
const apiUrl = `http://127.0.0.1:${apiPort}`
const previewUrl = `http://127.0.0.1:${previewPort}`
const children: ChildProcess[] = []
let shuttingDown = false

process.on('SIGINT', () => void shutdown('SIGINT', 0))
process.on('SIGTERM', () => void shutdown('SIGTERM', 0))

try {
  ensureDataDirs()
  log('runtime-starting', { runtimeId, pid: process.pid, apiPort, previewPort })

  const api = spawnNode('node_modules/tsx/dist/cli.mjs', ['src/server/index.ts'], {
    PORT: String(apiPort),
    CODEX_POKER_RUNTIME_ID: runtimeId,
    CODEX_POKER_WATCH_TOKEN: watcherToken
  })
  children.push(api)
  await waitForHealth(apiUrl, runtimeId, 12000)
  log('api-verified', { runtimeId, apiUrl })

  const preview = spawnNode('node_modules/vite/bin/vite.js', [
    '--host', '127.0.0.1',
    '--port', String(previewPort),
    '--strictPort'
  ], {
    CODEX_POKER_API_URL: apiUrl
  })
  children.push(preview)
  await waitForHealth(previewUrl, runtimeId, 12000)

  const manifest: RuntimeManifest = {
    schemaVersion: runtimeSchemaVersion,
    runtimeId,
    pid: process.pid,
    apiUrl,
    previewUrl,
    repoRoot: pathFromRoot(),
    startedAt: new Date().toISOString()
  }
  writeWatcherCredential()
  writeRuntimeManifest(manifest)
  log('runtime-ready', {
    runtimeId,
    pid: process.pid,
    apiUrl,
    previewUrl,
    lastPublicActionCursor: null
  })

  api.on('exit', (code, signal) => {
    if (!shuttingDown) {
      log('api-crashed-preview-kept-alive', { runtimeId, childPid: api.pid, code, signal })
    }
  })
  preview.on('exit', (code, signal) => {
    if (!shuttingDown) {
      log('preview-exited', { runtimeId, childPid: preview.pid, code, signal })
      void shutdown('SIGTERM', 1)
    }
  })
} catch (error) {
  log('runtime-start-failed', {
    runtimeId,
    message: error instanceof Error ? error.message : String(error)
  })
  await shutdown('SIGTERM', 1)
}

function spawnNode(entry: string, args: string[], extraEnvironment: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [pathFromRoot(entry), ...args], {
    cwd: pathFromRoot(),
    env: { ...process.env, ...extraEnvironment },
    stdio: 'inherit'
  })
  child.once('error', (error) => {
    log('runtime-child-error', { runtimeId, entry, message: error.message })
  })
  return child
}

async function waitForHealth(baseUrl: string, expectedRuntimeId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let attempt = 0
  while (Date.now() < deadline) {
    attempt += 1
    const health = await fetchHealth(baseUrl, fetch, 500)
    if (health?.runtimeId === expectedRuntimeId) return health
    await new Promise((resolve) => setTimeout(resolve, Math.min(75 * attempt, 500)))
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health`)
}

function writeRuntimeManifest(manifest: RuntimeManifest) {
  const manifestPath = path.join(getDataDir(), 'runtime.json')
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporaryPath, manifestPath)
}

function writeWatcherCredential() {
  const credentialPath = path.join(getDataDir(), 'watcher.json')
  fs.writeFileSync(credentialPath, `${JSON.stringify({
    schemaVersion: 1,
    runtimeId,
    token: watcherToken
  })}\n`, { mode: 0o600 })
}

async function shutdown(signal: NodeJS.Signals, exitCode: number) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal)
  }
  const manifestPath = path.join(getDataDir(), 'runtime.json')
  const credentialPath = path.join(getDataDir(), 'watcher.json')
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Partial<RuntimeManifest>
    if (manifest.runtimeId === runtimeId && manifest.pid === process.pid) fs.unlinkSync(manifestPath)
  } catch {
    // A missing or replaced manifest does not need cleanup.
  }
  try {
    const credential = JSON.parse(fs.readFileSync(credentialPath, 'utf8')) as { runtimeId?: string }
    if (credential.runtimeId === runtimeId) fs.unlinkSync(credentialPath)
  } catch {
    // A missing or replaced credential does not need cleanup.
  }
  log('runtime-stopped', { runtimeId, exitCode })
  process.exit(exitCode)
}

function log(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...details }))
}

export function findOpenPort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      const server = net.createServer()
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          tryPort(port + 1)
        } else {
          reject(error)
        }
      })
      server.once('listening', () => {
        server.close(() => resolve(port))
      })
      server.listen(port, '127.0.0.1')
    }
    tryPort(start)
  })
}
