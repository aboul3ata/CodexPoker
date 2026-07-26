import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { actionRequestSchema } from '../shared/contracts'
import type { HealthResponse } from '../shared/runtime'
import { writeLastError } from './bridge'
import { DomainError, MalformedCommandError } from './errors'
import { GameService } from './game-service'
import { ensureDataDirs, pathFromRoot } from './paths'

export function createServer(
  game = new GameService(),
  runtimeId: string = randomUUID(),
  watcherToken = process.env.CODEX_POKER_WATCH_TOKEN ?? randomUUID()
): FastifyInstance {
  const app = Fastify({ logger: false })

  app.setErrorHandler((error, request, reply) => {
    const domainError = error instanceof DomainError ? error : undefined
    const message = error instanceof Error ? error.message : 'Unexpected server error'
    const statusCode = domainError?.statusCode ?? 500
    const code = domainError?.code ?? 'internal_error'
    if (code !== 'internal_error') {
      writeLastError({
        schemaVersion: 1,
        at: new Date().toISOString(),
        command: 'game:act',
        code: code as never,
        message
      })
    }
    reply.status(statusCode).send({ ok: false, code, message })
  })

  app.get('/api/health', async (): Promise<HealthResponse> => ({
    ok: true,
    app: 'codex-poker',
    schemaVersion: 1,
    runtimeId,
    pid: process.pid,
    repoRoot: pathFromRoot(),
    ready: true
  }))

  app.get('/api/state', async () => ({ ok: true, state: game.getSnapshot() }))

  app.post('/api/action', async (request) => {
    const parsed = actionRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new MalformedCommandError(parsed.error.issues[0]?.message)
    return { ok: true, state: game.submitAction(parsed.data) }
  })

  app.post('/api/uplift/fallback', async () => ({ ok: true, state: game.useUpliftFallback() }))

  app.post('/api/fast-forward', async () => ({ ok: true, state: game.fastForwardAfterFold() }))

  app.post('/api/new-hand', async () => ({ ok: true, state: game.startNewHand() }))

  app.get('/events', (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    reply.raw.flushHeaders()
    const send = (state: unknown) => {
      reply.raw.write(`event: state\n`)
      reply.raw.write(`data: ${JSON.stringify(state)}\n\n`)
    }
    const unsubscribe = game.subscribe(send)
    const heartbeat = setInterval(() => reply.raw.write(`: heartbeat\n\n`), 15000)
    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  app.get('/api/codex/events', (request, reply) => {
    if (request.headers['x-codex-poker-watcher'] !== watcherToken) {
      reply.status(403).send({ ok: false, code: 'watcher_unauthorized', message: 'Valid Codex watcher credentials are required.' })
      return
    }
    const after = typeof (request.query as { after?: unknown }).after === 'string'
      ? (request.query as { after: string }).after
      : undefined
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    reply.raw.flushHeaders()
    let lastCursor = after
    const send = (event: { cursor: string }) => {
      if (event.cursor === lastCursor) return
      lastCursor = event.cursor
      reply.raw.write('event: codex-state\n')
      reply.raw.write(`id: ${event.cursor}\n`)
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    const unsubscribe = game.subscribeCodex(send)
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      event: 'codex-watcher-connected',
      runtimeId,
      after: after ?? null
    }))
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15000)
    let leaseExpired = false
    const connectionLease = setTimeout(() => {
      leaseExpired = true
      reply.raw.end()
    }, 60000)
    connectionLease.unref()
    request.raw.on('close', () => {
      clearInterval(heartbeat)
      clearTimeout(connectionLease)
      unsubscribe(leaseExpired ? 0 : 8000)
      console.log(JSON.stringify({
        at: new Date().toISOString(),
        event: 'codex-watcher-disconnected',
        runtimeId,
        lastPublicActionCursor: lastCursor ?? null
      }))
    })
  })

  const clientDist = pathFromRoot('dist/client')
  if (fs.existsSync(clientDist)) {
    app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/'
    })
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        reply.sendFile('index.html')
        return
      }
      reply.status(404).send({ ok: false, message: 'Not found' })
    })
  }

  app.addHook('onClose', async () => {
    game.close()
  })

  return app
}

export async function startServer(port = Number(process.env.PORT ?? 8797), runtimeId = process.env.CODEX_POKER_RUNTIME_ID ?? randomUUID()) {
  ensureDataDirs()
  const delayMs = Number(process.env.CODEX_POKER_API_START_DELAY_MS ?? 0)
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  const app = createServer(undefined, runtimeId)
  await app.listen({ host: '127.0.0.1', port })
  console.log(JSON.stringify({
    event: 'api-ready',
    runtimeId,
    pid: process.pid,
    apiUrl: `http://127.0.0.1:${port}`
  }))
  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
