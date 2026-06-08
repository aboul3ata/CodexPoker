import fs from 'node:fs'
import path from 'node:path'
import type { CurrentTurnPacket, LastErrorPacket, LatestHandPacket } from '../shared/contracts'
import { bridgeDir, ensureDataDirs } from './paths'

function writeJsonAtomic(filePath: string, value: unknown) {
  ensureDataDirs()
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(tempPath, filePath)
}

export function writeCurrentTurn(packet: CurrentTurnPacket) {
  writeJsonAtomic(path.join(bridgeDir, 'current-turn.json'), packet)
}

export function clearCurrentTurn() {
  const filePath = path.join(bridgeDir, 'current-turn.json')
  fs.rmSync(filePath, { force: true })
}

export function writeLatestHand(packet: LatestHandPacket) {
  writeJsonAtomic(path.join(bridgeDir, 'latest-hand.json'), packet)
}

export function writeLastError(packet: LastErrorPacket) {
  writeJsonAtomic(path.join(bridgeDir, 'last-error.json'), packet)
}

export function clearLastError() {
  const filePath = path.join(bridgeDir, 'last-error.json')
  fs.rmSync(filePath, { force: true })
}
