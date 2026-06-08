import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const dataDir = process.env.CODEX_POKER_DATA_DIR
  ? path.resolve(process.env.CODEX_POKER_DATA_DIR)
  : path.join(rootDir, 'data')

export const bridgeDir = path.join(dataDir, 'bridge')
export const dbPath = process.env.CODEX_POKER_DB_PATH
  ? path.resolve(process.env.CODEX_POKER_DB_PATH)
  : path.join(dataDir, 'codex-poker.sqlite')

export function ensureDataDirs() {
  fs.mkdirSync(bridgeDir, { recursive: true })
}

export function pathFromRoot(...parts: string[]) {
  return path.join(rootDir, ...parts)
}
