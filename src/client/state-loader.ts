import type { GameSnapshot } from '../shared/contracts'

type StateLoaderOptions = {
  attempts?: number
  fetchImpl?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  initialDelayMs?: number
  requestTimeoutMs?: number
}

export async function fetchStateWithRetry({
  attempts = 8,
  fetchImpl = fetch,
  sleep = defaultSleep,
  initialDelayMs = 150,
  requestTimeoutMs = 2000
}: StateLoaderOptions = {}): Promise<GameSnapshot> {
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl('/api/state', {
        signal: AbortSignal.timeout(requestTimeoutMs)
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json() as { state?: GameSnapshot }
      if (!payload.state) throw new Error('The server returned no game state.')
      return payload.state
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await sleep(Math.min(initialDelayMs * 2 ** attempt, 1500))
      }
    }
  }

  const detail = lastError instanceof Error ? ` (${lastError.message})` : ''
  throw new Error(`Unable to reach the local poker server${detail}. Retry the connection or return to Codex chat for diagnostics.`)
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}
