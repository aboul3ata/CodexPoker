import { spawn } from 'node:child_process'
import net from 'node:net'

const apiPort = await findOpenPort(Number(process.env.PORT ?? 8797))
const apiUrl = `http://127.0.0.1:${apiPort}`
console.log(`CodexPoker API target: ${apiUrl}`)

const children = [
  spawn('npm', ['run', 'dev:server'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: String(apiPort), CODEX_POKER_SERVER_URL: apiUrl }
  }),
  spawn('npm', ['run', 'dev:client'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, CODEX_POKER_API_URL: apiUrl }
  })
]

function shutdown(signal: NodeJS.Signals) {
  for (const child of children) child.kill(signal)
  process.exit(signal === 'SIGINT' ? 0 : 1)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown('SIGTERM')
  })
}

function findOpenPort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      const server = net.createServer()
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          tryPort(port + 1)
        } else {
          reject(error)
        }
      })
      server.once('listening', () => {
        server.close(() => resolve(port))
      })
      server.listen(port, '127.0.0.1')
    }
    tryPort(start)
  })
}
