import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRuntime } from '../src/cli/runtime'

const tempDirs: string[] = []

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

describe('runtime resolution', () => {
  it('prefers an explicit healthy environment URL over a stale runtime manifest', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-runtime-test-'))
    tempDirs.push(dataDir)
    fs.writeFileSync(path.join(dataDir, 'runtime.json'), JSON.stringify({
      schemaVersion: 1,
      runtimeId: 'stale-runtime',
      pid: 999_999,
      apiUrl: 'http://127.0.0.1:59999',
      previewUrl: 'http://127.0.0.1:59998',
      repoRoot: '/stale/repo',
      startedAt: '2026-01-01T00:00:00.000Z'
    }))

    const requests: string[] = []
    const runtime = await resolveRuntime({
      dataDir,
      environmentUrl: 'http://127.0.0.1:4010',
      fetchImpl: async (input) => {
        requests.push(String(input))
        return new Response(JSON.stringify({
          ok: true,
          app: 'codex-poker',
          schemaVersion: 1,
          runtimeId: 'environment-runtime',
          pid: process.pid,
          repoRoot: '/explicit/repo',
          ready: true
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
    })

    expect(runtime.apiUrl).toBe('http://127.0.0.1:4010')
    expect(runtime.source).toBe('environment')
    expect(requests).toEqual(['http://127.0.0.1:4010/api/health'])
  })

  it('ignores a manifest when its process is dead or its health check fails', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-runtime-test-'))
    tempDirs.push(dataDir)
    fs.writeFileSync(path.join(dataDir, 'runtime.json'), JSON.stringify({
      schemaVersion: 1,
      runtimeId: 'stale-runtime',
      pid: 999_999,
      apiUrl: 'http://127.0.0.1:59999',
      previewUrl: 'http://127.0.0.1:59998',
      repoRoot: '/stale/repo',
      startedAt: '2026-01-01T00:00:00.000Z'
    }))

    await expect(resolveRuntime({
      dataDir,
      fallbackUrl: 'http://127.0.0.1:59997',
      fetchImpl: async () => new Response('unavailable', { status: 503 })
    })).rejects.toThrow('No healthy CodexPoker runtime')
  })

  it('rejects a live manifest that belongs to another repo', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-runtime-test-'))
    tempDirs.push(dataDir)
    fs.writeFileSync(path.join(dataDir, 'runtime.json'), JSON.stringify({
      schemaVersion: 1,
      runtimeId: 'foreign-runtime',
      pid: process.pid,
      apiUrl: 'http://127.0.0.1:4011',
      previewUrl: 'http://127.0.0.1:4012',
      repoRoot: '/another/repo',
      startedAt: '2026-01-01T00:00:00.000Z'
    }))

    await expect(resolveRuntime({
      dataDir,
      expectedRepoRoot: '/this/repo',
      fallbackUrl: 'http://127.0.0.1:59997',
      processAlive: () => true,
      fetchImpl: async (input) => String(input).startsWith('http://127.0.0.1:59997')
        ? new Response('unavailable', { status: 503 })
        : new Response(JSON.stringify({
            ok: true,
            app: 'codex-poker',
            schemaVersion: 1,
            runtimeId: 'foreign-runtime',
            pid: process.pid,
            repoRoot: '/another/repo',
            ready: true
          }), { status: 200 })
    })).rejects.toThrow('No healthy CodexPoker runtime')
  })

  it('requires the full CodexPoker health identity', async () => {
    await expect(resolveRuntime({
      environmentUrl: 'http://127.0.0.1:4013',
      fetchImpl: async () => new Response(JSON.stringify({
        ok: true,
        runtimeId: 'lookalike-runtime'
      }), { status: 200 })
    })).rejects.toThrow('Configured CodexPoker server is unhealthy')
  })

  it('rejects non-loopback runtime URLs in local-only mode', async () => {
    await expect(resolveRuntime({
      environmentUrl: 'https://example.com'
    })).rejects.toThrow('must use a loopback URL')
  })
})
