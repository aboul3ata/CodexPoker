import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { actionRequestSchema, sayRequestSchema } from '../shared/contracts'
import { writeLastError } from './bridge'
import { DomainError, MalformedCommandError } from './errors'
import { GameService } from './game-service'
import { dataDir, ensureDataDirs, pathFromRoot } from './paths'

export function createServer(game = new GameService()): FastifyInstance {
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
        command: request.url.includes('say') ? 'game:say' : 'game:act',
        code: code as never,
        message
      })
    }
    reply.status(statusCode).send({ ok: false, code, message })
  })

  app.get('/api/state', async () => ({ ok: true, state: game.getSnapshot() }))

  app.post('/api/action', async (request) => {
    const parsed = actionRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new MalformedCommandError(parsed.error.issues[0]?.message)
    return { ok: true, state: game.submitAction(parsed.data) }
  })

  app.post('/api/say', async (request) => {
    const parsed = sayRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new MalformedCommandError(parsed.error.issues[0]?.message)
    return { ok: true, state: game.addTableTalk(parsed.data) }
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

export async function startServer(port = Number(process.env.PORT ?? 8797)) {
  ensureDataDirs()
  const app = createServer()
  await app.listen({ host: '127.0.0.1', port })
  fs.writeFileSync(path.join(dataDir, 'server.json'), `${JSON.stringify({ port, url: `http://127.0.0.1:${port}` }, null, 2)}\n`)
  console.log(`CodexPoker server listening on http://127.0.0.1:${port}`)
  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
