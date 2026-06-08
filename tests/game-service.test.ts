import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CurrentTurnPacket, GameSnapshot, LatestHandPacket } from '../src/shared/contracts'
import { StaleTurnError } from '../src/server/errors'
import { GameService } from '../src/server/game-service'
import { Storage } from '../src/server/storage'

let service: GameService
let tempDir: string
let previousDataDir: string | undefined

beforeEach(() => {
  previousDataDir = process.env.CODEX_POKER_DATA_DIR
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-test-'))
  process.env.CODEX_POKER_DATA_DIR = tempDir
  service = new GameService(new Storage(path.join(tempDir, 'test.sqlite')))
})

afterEach(() => {
  service.close()
  if (previousDataDir) {
    process.env.CODEX_POKER_DATA_DIR = previousDataDir
  } else {
    delete process.env.CODEX_POKER_DATA_DIR
  }
  fs.rmSync(tempDir, { recursive: true, force: true })
})

function userAction(state: GameSnapshot, preferred: 'call' | 'check' | 'fold' = 'call') {
  const action = state.legalActions.find((item) => item.kind === preferred) ?? state.legalActions[0]
  return service.submitAction({
    seat: 'user',
    turnToken: state.turnToken,
    action: action.kind,
    amount: action.kind === 'bet' || action.kind === 'raise' ? action.min : undefined
  })
}

describe('GameService', () => {
  it('starts a real hidden-information hand for the user', () => {
    const state = service.getSnapshot()
    const user = state.seats.find((seat) => seat.seatId === 'user')
    const uplift = state.seats.find((seat) => seat.seatId === 'uplift')

    expect(state.phase).toBe('playing')
    expect(user?.cards).toHaveLength(2)
    expect(uplift?.cards).toBeUndefined()
    expect(state.legalActions.length).toBeGreaterThan(0)
    expect(state.pot).toBeGreaterThan(0)
    expect(uplift?.modelLabel).toBe('This Codex session')
    expect(state.seats.find((seat) => seat.seatId === 'atlas')?.tableRole).toBe('Stack bully')
  })

  it('pauses on Uplift and writes a sanitized Codex bridge packet', () => {
    let state = service.getSnapshot()
    state = userAction(state)

    expect(state.actingSeatId).toBe('uplift')
    expect(state.bridgeStatus).toBe('waiting-for-codex')

    const packet = JSON.parse(fs.readFileSync(path.join(tempDir, 'bridge/current-turn.json'), 'utf8')) as CurrentTurnPacket
    expect(packet.seat).toBe('uplift')
    expect(packet.turnToken).toBe(state.turnToken)
    expect(packet.holeCards).toHaveLength(2)
    expect(JSON.stringify(packet)).not.toContain('"userSeatCards"')
    expect(JSON.stringify(packet)).not.toContain('"deck"')
    expect(JSON.stringify(packet)).not.toContain('"seed"')
  })

  it('repairs a missing current-turn packet while Uplift is active', () => {
    let state = service.getSnapshot()
    state = userAction(state)
    const packetPath = path.join(tempDir, 'bridge/current-turn.json')

    expect(state.actingSeatId).toBe('uplift')
    fs.rmSync(packetPath, { force: true })
    expect(fs.existsSync(packetPath)).toBe(false)

    service.getSnapshot()

    const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8')) as CurrentTurnPacket
    expect(packet.handId).toBe(state.handId)
    expect(packet.turnToken).toBe(state.turnToken)
  })

  it('clears the current-turn packet after Uplift acts', () => {
    let state = service.getSnapshot()
    state = userAction(state)
    expect(state.actingSeatId).toBe('uplift')
    expect(fs.existsSync(path.join(tempDir, 'bridge/current-turn.json'))).toBe(true)

    const action = state.legalActions.find((item) => item.kind === 'check') ?? state.legalActions[0]
    state = service.submitAction({
      seat: 'uplift',
      turnToken: state.turnToken,
      action: action.kind,
      amount: action.kind === 'bet' || action.kind === 'raise' ? action.min : undefined
    })

    if (state.actingSeatId !== 'uplift') {
      expect(fs.existsSync(path.join(tempDir, 'bridge/current-turn.json'))).toBe(false)
    }
  })

  it('rejects stale Codex actions without mutating the active turn', () => {
    let state = service.getSnapshot()
    state = userAction(state)

    expect(() =>
      service.submitAction({
        seat: 'uplift',
        turnToken: 'stale-token',
        action: state.legalActions[0].kind,
        amount: state.legalActions[0].min
      })
    ).toThrow(StaleTurnError)
    expect(service.getSnapshot().actingSeatId).toBe('uplift')
  })

  it('fast-forwards after the user folds and records accounting/review data', () => {
    let state = service.getSnapshot()
    state = userAction(state, 'fold')
    state = service.fastForwardAfterFold()

    expect(state.phase).toBe('hand-complete')
    expect(state.review).toBeDefined()
    expect(state.bankroll).toBeGreaterThan(0)
    expect(state.board).toEqual(state.review?.board)
    expect(state.pot).toBe(state.review?.finalPot)
    expect(state.history).toHaveLength(1)
    expect(state.history[0].bankroll).toBe(state.bankroll)
    expect(state.history[0].rating).toBe(state.rating)
    expect(state.review?.publicActions.some((action) => action.seatId === 'user' && action.action === 'fold')).toBe(true)
    expect(fs.existsSync(path.join(tempDir, 'bridge/latest-hand.json'))).toBe(true)
    const packet = JSON.parse(fs.readFileSync(path.join(tempDir, 'bridge/latest-hand.json'), 'utf8')) as LatestHandPacket
    expect(packet.result.bankrollAfter).toBe(state.bankroll)
    expect(packet.result.ratingAfter).toBe(state.rating)
    expect(packet.lesson).toBe(state.review?.lesson)
    expect(packet.showdown?.board).toEqual(state.review?.board)
  })

  it('plays repeated hands without losing table-chip conservation or hanging', () => {
    for (let hand = 0; hand < 10; hand += 1) {
      let state = service.getSnapshot()
      let guard = 0
      while (state.phase !== 'hand-complete' && guard < 200) {
        guard += 1
        if (state.actingSeatId === 'user') {
          const preferred = state.legalActions.some((action) => action.kind === 'check') ? 'check' : 'call'
          state = userAction(state, preferred)
        } else if (state.actingSeatId === 'uplift') {
          state = service.useUpliftFallback()
        } else {
          throw new Error(`Unexpected acting seat: ${state.actingSeatId}`)
        }
      }

      expect(guard).toBeLessThan(200)
      expect(state.phase).toBe('hand-complete')
      const totalStacks = state.seats.reduce((sum, seat) => sum + seat.stack, 0)
      expect(totalStacks).toBe(60000)
      expect(state.history.length).toBe(hand + 1)
      const vpip = Number(state.tendencySummary.match(/VPIP-ish (\\d+)%/)?.[1] ?? 0)
      expect(vpip).toBeLessThanOrEqual(100)
      state = service.startNewHand()
    }
  })
})
