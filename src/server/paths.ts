import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function getDataDir() {
  return process.env.CODEX_POKER_DATA_DIR
    ? path.resolve(process.env.CODEX_POKER_DATA_DIR)
    : path.join(rootDir, 'data')
}

export function getBridgeDir() {
  return path.join(getDataDir(), 'bridge')
}

export function getDbPath() {
  return process.env.CODEX_POKER_DB_PATH
    ? path.resolve(process.env.CODEX_POKER_DB_PATH)
    : path.join(getDataDir(), 'codex-poker.sqlite')
}

export function ensureDataDirs() {
  fs.mkdirSync(getBridgeDir(), { recursive: true })
}

export function pathFromRoot(...parts: string[]) {
  return path.join(rootDir, ...parts)
}
