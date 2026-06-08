import fs from 'node:fs'
import path from 'node:path'

type ApiResult = {
  ok: boolean
  state?: unknown
  code?: string
  message?: string
}

function getServerUrl() {
  const serverFile = path.join(getDataDir(), 'server.json')
  if (fs.existsSync(serverFile)) {
    const parsed = JSON.parse(fs.readFileSync(serverFile, 'utf8')) as { url?: string }
    if (parsed.url) return parsed.url
  }
  return process.env.CODEX_POKER_SERVER_URL ?? 'http://127.0.0.1:8797'
}

function getDataDir() {
  return process.env.CODEX_POKER_DATA_DIR
    ? path.resolve(process.env.CODEX_POKER_DATA_DIR)
    : path.resolve('data')
}

export async function postApi(pathname: string, body?: unknown): Promise<ApiResult> {
  const init: RequestInit = { method: 'POST' }
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const response = await fetch(`${getServerUrl()}${pathname}`, init)
  const payload = (await response.json()) as ApiResult
  if (!response.ok) {
    const error = new Error(payload.message ?? `HTTP ${response.status}`) as Error & { code?: string; status?: number }
    error.code = payload.code
    error.status = response.status
    throw error
  }
  return payload
}

export async function getApi(pathname: string): Promise<ApiResult> {
  const response = await fetch(`${getServerUrl()}${pathname}`)
  const payload = (await response.json()) as ApiResult
  if (!response.ok) {
    const error = new Error(payload.message ?? `HTTP ${response.status}`) as Error & { code?: string; status?: number }
    error.code = payload.code
    error.status = response.status
    throw error
  }
  return payload
}

export function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
    } else {
      args[key] = next
      i += 1
    }
  }
  return args
}
