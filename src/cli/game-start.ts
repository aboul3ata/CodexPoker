import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fetchHealth, isLocalRuntimeManifest, isProcessAlive, readRuntimeManifest } from './runtime'
import { isCodexPokerSupervisor } from './runtime-process'
import { ensureDataDirs, getDataDir, pathFromRoot } from '../server/paths'
import type { RuntimeManifest } from '../shared/runtime'
import { isWatcherCredential } from '../shared/watcher-auth'

const json = process.argv.includes('--json')

startRuntime()
  .then((result) => {
    console.log(JSON.stringify({ ok: true, ...result }, null, json ? 0 : 2))
  })
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      code: 'runtime_start_failed',
      message: error instanceof Error ? error.message : String(error),
      diagnostic: 'Run npm run --silent game:doctor -- --json and inspect data/logs/runtime.log.'
    }, null, json ? 0 : 2))
    process.exit(1)
  })

async function startRuntime() {
  ensureDataDirs()
  const existing = await getHealthyManifest()
  if (process.env.CODEX_POKER_SERVER_URL) {
    if (existing && existing.apiUrl === process.env.CODEX_POKER_SERVER_URL) return output(existing, true)
    throw new Error('CODEX_POKER_SERVER_URL points outside the supervised preview. Unset it before game:start, or use the configured API commands without local play startup.')
  }
  if (existing) return output(existing, true)

  const manifestPath = path.join(getDataDir(), 'runtime.json')
  await stopStaleRuntime()
  repairStaleManifest(manifestPath)

  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const child = spawnSupervisor()
    try {
      const manifest = await waitForRuntimeManifest(child.pid ?? 0, 15000)
      return output(manifest, false)
    } catch (error) {
      lastError = error
      if (child.pid && isProcessAlive(child.pid)) child.kill('SIGTERM')
      await stopStaleRuntime()
      repairStaleManifest(manifestPath)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('CodexPoker runtime failed to start twice.')
}

async function getHealthyManifest() {
  const manifest = readRuntimeManifest()
  if (!manifest || !isLocalRuntimeManifest(manifest, pathFromRoot()) || !isProcessAlive(manifest.pid)) return null
  if (!hasMatchingWatcherCredential(manifest)) return null
  const [apiHealth, previewHealth] = await Promise.all([
    fetchHealth(manifest.apiUrl),
    fetchHealth(manifest.previewUrl)
  ])
  if (
    apiHealth?.runtimeId !== manifest.runtimeId
    || previewHealth?.runtimeId !== manifest.runtimeId
    || apiHealth.repoRoot !== manifest.repoRoot
    || previewHealth.repoRoot !== manifest.repoRoot
  ) return null
  return manifest
}

function hasMatchingWatcherCredential(manifest: RuntimeManifest) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(getDataDir(), 'watcher.json'), 'utf8')) as unknown
    return isWatcherCredential(parsed) && parsed.runtimeId === manifest.runtimeId
  } catch {
    return false
  }
}

function spawnSupervisor() {
  const logDir = path.join(getDataDir(), 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const logFd = fs.openSync(path.join(logDir, 'runtime.log'), 'a', 0o600)
  const child = spawn(process.execPath, [pathFromRoot('node_modules/tsx/dist/cli.mjs'), pathFromRoot('scripts/dev.ts')], {
    cwd: pathFromRoot(),
    detached: true,
    env: process.env,
    stdio: ['ignore', logFd, logFd]
  })
  child.unref()
  fs.closeSync(logFd)
  return child
}

async function waitForRuntimeManifest(supervisorPid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (supervisorPid > 0 && !isProcessAlive(supervisorPid)) {
      throw new Error('The CodexPoker supervisor exited before becoming ready.')
    }
    const manifest = await getHealthyManifest()
    if (manifest) return manifest
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('Timed out waiting for the verified CodexPoker preview.')
}

function repairStaleManifest(manifestPath: string) {
  try {
    fs.unlinkSync(manifestPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const legacyPath = path.join(getDataDir(), 'server.json')
  try {
    fs.unlinkSync(legacyPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function stopStaleRuntime() {
  const manifest = readRuntimeManifest()
  if (!manifest || !isProcessAlive(manifest.pid) || manifest.repoRoot !== pathFromRoot()) return
  if (!isCodexPokerSupervisor(manifest.pid, manifest.repoRoot)) {
    throw new Error(`Refusing to stop PID ${manifest.pid}: it is not the verified CodexPoker supervisor for this repo.`)
  }
  process.kill(manifest.pid, 'SIGTERM')
  const deadline = Date.now() + 3000
  while (Date.now() < deadline && isProcessAlive(manifest.pid)) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  if (isProcessAlive(manifest.pid)) {
    throw new Error(`Stale CodexPoker supervisor ${manifest.pid} did not stop cleanly.`)
  }
}

function output(manifest: RuntimeManifest, reused: boolean) {
  return {
    schemaVersion: manifest.schemaVersion,
    runtimeId: manifest.runtimeId,
    pid: manifest.pid,
    apiUrl: manifest.apiUrl,
    previewUrl: manifest.previewUrl,
    reused,
    startedAt: manifest.startedAt
  }
}
