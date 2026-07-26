import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fetchHealth, getDataDir, isLocalRuntimeManifest, isProcessAlive, readRuntimeManifest } from './runtime'
import { checkNodeVersion } from './doctor-checks'
import { isCodexPokerSupervisor } from './runtime-process'
import { pathFromRoot } from '../server/paths'
import { isWatcherCredential } from '../shared/watcher-auth'

const json = process.argv.includes('--json')
const require = createRequire(import.meta.url)

const report = await runDoctor()
console.log(JSON.stringify(report, null, json ? 0 : 2))
if (!report.ok) process.exitCode = 1

async function runDoctor() {
  const node = checkNodeVersion(process.versions.node)
  const sqlite = checkSqlite()
  const skillPath = pathFromRoot('.agents/skills/codex-poker/SKILL.md')
  const skill = {
    ok: fs.existsSync(skillPath),
    path: skillPath
  }
  const manifest = readRuntimeManifest()
  const manifestValid = Boolean(manifest && isLocalRuntimeManifest(manifest, pathFromRoot()))
  const watcherCredential = readWatcherCredential(manifest?.runtimeId)
  const processCheck = manifestValid && manifest
    ? {
        ok: isProcessAlive(manifest.pid) && isCodexPokerSupervisor(manifest.pid, manifest.repoRoot),
        pid: manifest.pid
      }
    : { ok: false, message: manifest ? 'Runtime manifest is invalid for this repo.' : 'No runtime manifest.' }
  const [apiHealth, previewHealth, preferredPreviewPortAvailable] = await Promise.all([
    manifestValid && manifest ? fetchHealth(manifest.apiUrl) : Promise.resolve(null),
    manifestValid && manifest ? fetchHealth(manifest.previewUrl) : Promise.resolve(null),
    isPortAvailable(5173)
  ])
  const runtime = {
    ok: Boolean(
      manifest
      && manifestValid
      && processCheck.ok
      && apiHealth?.runtimeId === manifest.runtimeId
      && previewHealth?.runtimeId === manifest.runtimeId
      && apiHealth.repoRoot === manifest.repoRoot
      && previewHealth.repoRoot === manifest.repoRoot
      && watcherCredential.ok
    ),
    manifest,
    process: processCheck,
    apiHealth,
    previewReachable: Boolean(previewHealth),
    preferredPreviewPort: {
      port: 5173,
      available: preferredPreviewPortAvailable,
      note: preferredPreviewPortAvailable
        ? 'Available for a new runtime.'
        : manifest?.previewUrl.endsWith(':5173')
          ? 'Occupied by the current CodexPoker runtime.'
          : 'Occupied; game:start will discover another port.'
    }
  }

  return {
    ok: node.ok && sqlite.ok && skill.ok && runtime.ok,
    schemaVersion: 1,
    node,
    npm: {
      detected: process.env.npm_config_user_agent?.match(/npm\/([^ ]+)/)?.[1] ?? null,
      required: '10.9.8'
    },
    sqlite,
    skill,
    runtime,
    watcherCredential,
    browser: {
      ok: runtime.previewReachable,
      note: runtime.previewReachable
        ? 'The verified preview URL is reachable and can be opened by the Codex in-app Browser.'
        : 'Start the runtime before opening the Codex in-app Browser.'
    }
  }
}

function readWatcherCredential(runtimeId: string | undefined) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(getDataDir(), 'watcher.json'), 'utf8')) as unknown
    const matches = Boolean(runtimeId && isWatcherCredential(parsed) && parsed.runtimeId === runtimeId)
    return {
      ok: matches,
      message: matches
        ? 'Watcher credential matches the active runtime.'
        : 'Watcher credential is missing or does not match the active runtime.'
    }
  } catch {
    return { ok: false, message: 'Watcher credential is missing or invalid.' }
  }
}

function checkSqlite() {
  try {
    const Database = require('better-sqlite3') as new (filename: string) => { close(): void }
    const database = new Database(':memory:')
    database.close()
    return { ok: true, message: 'better-sqlite3 loaded and opened an in-memory database.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}
