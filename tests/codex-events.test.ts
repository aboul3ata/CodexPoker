import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildCodexPublicEvent } from '../src/shared/codex-events'
import type { GameSnapshot } from '../src/shared/contracts'
import { GameService } from '../src/server/game-service'
import { Storage } from '../src/server/storage'

let service: GameService
let tempDir: string

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-events-test-'))
  process.env.CODEX_POKER_DATA_DIR = tempDir
  service = new GameService(new Storage(path.join(tempDir, 'events.sqlite')))
})

afterEach(() => {
  service.close()
  delete process.env.CODEX_POKER_DATA_DIR
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('Codex public events', () => {
  it('redacts cards, legal actions, turn tokens, reviews, and private recommendations', () => {
    const snapshot = service.getSnapshot()
    const event = buildCodexPublicEvent(snapshot)
    const serialized = JSON.stringify(event)

    expect(event.cursor).toBe(`${snapshot.handId}:${snapshot.actionSeq}`)
    expect(event.actingSeatId).toBe(snapshot.actingSeatId)
    expect(serialized).not.toContain('turnToken')
    expect(serialized).not.toContain('legalActions')
    expect(serialized).not.toContain('"cards"')
    expect(serialized).not.toContain('"seats"')
    expect(serialized).not.toContain('"review"')
    expect(serialized).not.toContain('recommendation')
  })

  it('marks Codex connected while a watcher lease is alive and wakes it after Ali acts', async () => {
    const events: ReturnType<typeof buildCodexPublicEvent>[] = []
    const disconnected = service.subscribeCodex((event) => events.push(event))
    let snapshot = service.getSnapshot()

    expect(snapshot.codexConnection).toBe('connected')
    expect(events).toHaveLength(1)

    const action = snapshot.legalActions.find((item) => item.kind === 'call') ?? snapshot.legalActions[0]
    snapshot = service.submitAction({
      seat: 'user',
      turnToken: snapshot.turnToken,
      action: action.kind,
      amount: action.kind === 'bet' || action.kind === 'raise' ? action.min : undefined
    })

    expect(events.at(-1)?.cursor).toBe(`${snapshot.handId}:${snapshot.actionSeq}`)
    expect(events.at(-1)?.actingSeatId).toBe('uplift')
    expect(events.length).toBeGreaterThan(1)

    disconnected()
    expect(service.getSnapshot().codexConnection).toBe('disconnected')
  })

  it('does not leak private state even if a snapshot is augmented unexpectedly', () => {
    const snapshot = {
      ...service.getSnapshot(),
      privateRecommendation: { action: 'raise', cards: ['As', 'Ah'] }
    } as GameSnapshot & { privateRecommendation: unknown }
    const serialized = JSON.stringify(buildCodexPublicEvent(snapshot))

    expect(serialized).not.toContain('privateRecommendation')
    expect(serialized).not.toContain('As')
    expect(serialized).not.toContain('Ah')
  })

  it('expires a watcher lease that never closes cleanly', async () => {
    const events: ReturnType<typeof buildCodexPublicEvent>[] = []
    service.subscribeCodex((event) => events.push(event), 10)

    expect(service.getSnapshot().codexConnection).toBe('connected')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(service.getSnapshot().codexConnection).toBe('disconnected')
  })
})
