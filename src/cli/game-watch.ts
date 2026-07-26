import fs from 'node:fs'
import path from 'node:path'
import type { GameSnapshot } from '../shared/contracts'
import { buildCodexPublicEvent, publicEventCursor, type CodexPublicEvent } from '../shared/codex-events'
import { isWatcherCredential } from '../shared/watcher-auth'
import { parseArgs } from './client'
import { getDataDir, resolveRuntime } from './runtime'

const args = parseArgs(process.argv.slice(2))
const timeoutMs = typeof args['timeout-ms'] === 'string' ? Number(args['timeout-ms']) : 55000

watchForTableChange()
  .then((result) => console.log(JSON.stringify({ ok: true, ...result })))
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      code: (error as Error & { code?: string }).code ?? 'watch_failed',
      message: error instanceof Error ? error.message : String(error)
    }))
    process.exit(1)
  })

async function watchForTableChange() {
  const runtime = await resolveRuntime()
  const stateResponse = await fetch(`${runtime.apiUrl}/api/state`)
  if (!stateResponse.ok) throw new Error(`State request failed with HTTP ${stateResponse.status}.`)
  const statePayload = await stateResponse.json() as { state?: GameSnapshot }
  if (!statePayload.state) throw new Error('The runtime returned no table state.')
  const state = statePayload.state

  if (state.phase === 'hand-complete' || state.actingSeatId === 'uplift') {
    return {
      reason: 'actionable',
      event: buildCodexPublicEvent(state)
    }
  }

  const after = typeof args.after === 'string' ? args.after : publicEventCursor(state)
  const credential = readWatcherCredential(runtime.runtimeId)
  const controller = new AbortController()
  const timer = timeoutMs > 0
    ? setTimeout(() => controller.abort(new Error('watch_timeout')), timeoutMs)
    : undefined

  try {
    const response = await fetch(`${runtime.apiUrl}/api/codex/events?after=${encodeURIComponent(after)}`, {
      headers: {
        accept: 'text/event-stream',
        'x-codex-poker-watcher': credential.token
      },
      signal: controller.signal
    })
    if (!response.ok || !response.body) throw new Error(`Codex event stream failed with HTTP ${response.status}.`)
    const event = await readNextCodexEvent(response.body, controller)
    return { reason: 'state-changed', event }
  } catch (error) {
    if (
      (controller.signal.aborted && timeoutMs > 0)
      || (error instanceof Error && error.message === 'Codex event stream closed before the table changed.')
    ) {
      return {
        reason: 'still-waiting',
        event: buildCodexPublicEvent(state)
      }
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
    controller.abort()
  }
}

function readWatcherCredential(runtimeId: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(getDataDir(), 'watcher.json'), 'utf8')) as unknown
    if (isWatcherCredential(parsed) && parsed.runtimeId === runtimeId) return parsed
  } catch {
    // Fall through to the actionable error.
  }
  throw new Error('No watcher credential matches the active runtime. Run npm run --silent game:start -- --json.')
}

async function readNextCodexEvent(stream: ReadableStream<Uint8Array>, controller: AbortController): Promise<CodexPublicEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) throw new Error('Codex event stream closed before the table changed.')
    buffer += decoder.decode(value, { stream: true })
    let separator = buffer.indexOf('\n\n')
    while (separator >= 0) {
      const block = buffer.slice(0, separator)
      buffer = buffer.slice(separator + 2)
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')
      if (data) {
        controller.abort()
        return JSON.parse(data) as CodexPublicEvent
      }
      separator = buffer.indexOf('\n\n')
    }
  }
}
