import fs from 'node:fs'
import path from 'node:path'
import { isRuntimeManifest, type HealthResponse, type RuntimeManifest } from '../shared/runtime'

export type ResolvedRuntime = {
  apiUrl: string
  previewUrl?: string
  runtimeId: string
  pid?: number
  source: 'environment' | 'manifest' | 'fallback'
  manifest?: RuntimeManifest
}

type ResolveRuntimeOptions = {
  dataDir?: string
  environmentUrl?: string
  fallbackUrl?: string
  fetchImpl?: typeof fetch
  processAlive?: (pid: number) => boolean
  timeoutMs?: number
  expectedRepoRoot?: string
}

export async function resolveRuntime({
  dataDir = getDataDir(),
  environmentUrl = process.env.CODEX_POKER_SERVER_URL,
  fallbackUrl = 'http://127.0.0.1:8797',
  fetchImpl = fetch,
  processAlive = isProcessAlive,
  timeoutMs = 800,
  expectedRepoRoot = path.resolve('.')
}: ResolveRuntimeOptions = {}): Promise<ResolvedRuntime> {
  if (environmentUrl) {
    assertLoopbackUrl(environmentUrl)
    const health = await fetchHealth(environmentUrl, fetchImpl, timeoutMs)
    if (!health) throw new Error(`Configured CodexPoker server is unhealthy: ${environmentUrl}`)
    return {
      apiUrl: environmentUrl,
      runtimeId: health.runtimeId,
      pid: health.pid,
      source: 'environment'
    }
  }

  const manifest = readRuntimeManifest(dataDir)
  if (manifest && isLocalRuntimeManifest(manifest, expectedRepoRoot) && processAlive(manifest.pid)) {
    const health = await fetchHealth(manifest.apiUrl, fetchImpl, timeoutMs)
    if (health?.runtimeId === manifest.runtimeId && health.repoRoot === expectedRepoRoot) {
      return {
        apiUrl: manifest.apiUrl,
        previewUrl: manifest.previewUrl,
        runtimeId: manifest.runtimeId,
        pid: manifest.pid,
        source: 'manifest',
        manifest
      }
    }
  }

  assertLoopbackUrl(fallbackUrl)
  const fallbackHealth = await fetchHealth(fallbackUrl, fetchImpl, timeoutMs)
  if (fallbackHealth?.repoRoot === expectedRepoRoot) {
    return {
      apiUrl: fallbackUrl,
      runtimeId: fallbackHealth.runtimeId,
      pid: fallbackHealth.pid,
      source: 'fallback'
    }
  }

  throw new Error('No healthy CodexPoker runtime is available. Run npm run --silent game:start -- --json.')
}

export async function fetchHealth(apiUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 800): Promise<HealthResponse | null> {
  try {
    const response = await fetchImpl(`${apiUrl}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!response.ok) return null
    const payload = await response.json() as Partial<HealthResponse>
    if (
      payload.ok !== true
      || payload.app !== 'codex-poker'
      || payload.schemaVersion !== 1
      || payload.ready !== true
      || typeof payload.runtimeId !== 'string'
      || typeof payload.pid !== 'number'
      || typeof payload.repoRoot !== 'string'
    ) return null
    return {
      ok: true,
      app: 'codex-poker',
      schemaVersion: 1,
      runtimeId: payload.runtimeId,
      pid: payload.pid,
      repoRoot: payload.repoRoot,
      ready: true
    }
  } catch {
    return null
  }
}

export function isLoopbackUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:'
      && !url.username
      && !url.password
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

export function isLocalRuntimeManifest(manifest: RuntimeManifest, expectedRepoRoot: string) {
  return manifest.repoRoot === expectedRepoRoot
    && isLoopbackUrl(manifest.apiUrl)
    && isLoopbackUrl(manifest.previewUrl)
}

function assertLoopbackUrl(value: string) {
  if (!isLoopbackUrl(value)) {
    throw new Error(`CodexPoker local-only mode must use a loopback URL: ${value}`)
  }
}

export function readRuntimeManifest(dataDir = getDataDir()): RuntimeManifest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, 'runtime.json'), 'utf8')) as unknown
    return isRuntimeManifest(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function getDataDir() {
  return process.env.CODEX_POKER_DATA_DIR
    ? path.resolve(process.env.CODEX_POKER_DATA_DIR)
    : path.resolve('data')
}

export function isProcessAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
