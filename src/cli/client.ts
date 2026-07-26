import { resolveRuntime } from './runtime'

type ApiResult = {
  ok: boolean
  state?: unknown
  code?: string
  message?: string
}

export async function postApi(pathname: string, body?: unknown): Promise<ApiResult> {
  const init: RequestInit = { method: 'POST' }
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const runtime = await resolveRuntime()
  const response = await fetch(`${runtime.apiUrl}${pathname}`, init)
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
  const runtime = await resolveRuntime()
  const response = await fetch(`${runtime.apiUrl}${pathname}`)
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
