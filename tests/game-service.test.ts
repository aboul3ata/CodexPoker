import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

function tableChipTotal(state: GameSnapshot) {
  return state.seats.reduce((sum, seat) => sum + seat.stack + seat.bet, 0)
}

function isBotSeat(seatId: string) {
  return seatId !== 'user' && seatId !== 'uplift'
}

function variedUserAction(state: GameSnapshot, hand: number, step: number) {
  const legal = state.legalActions
  const wager = legal.find((action) => action.kind === 'raise') ?? legal.find((action) => action.kind === 'bet')
  const check = legal.find((action) => action.kind === 'check')
  const call = legal.find((action) => action.kind === 'call')
  const fold = legal.find((action) => action.kind === 'fold')
  const shouldFold = Boolean(fold && !check && (hand + step) % 6 === 0)

  if (shouldFold) return userAction(state, 'fold')

  if (wager && (hand + step) % 5 === 0) {
    const min = wager.min ?? 0
    const max = wager.max ?? min
    const amount = Math.min(max, min + (((hand + step) % 4) * 50))
    return service.submitAction({
      seat: 'user',
      turnToken: state.turnToken,
      action: wager.kind,
      amount
    })
  }

  if (check) return userAction(state, 'check')
  if (call) return userAction(state, 'call')
  return userAction(state, 'fold')
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

  it('pauses on Codexxyyy and writes a sanitized Codex bridge packet', () => {
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

  it('repairs a missing current-turn packet while Codexxyyy is active', () => {
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

  it('clears the current-turn packet after Codexxyyy acts', () => {
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

  it('surfaces real raise, reraise, and check decisions from the poker engine', () => {
    let state = service.getSnapshot()
    const openingRaise = state.legalActions.find((action) => action.kind === 'raise')
    expect(openingRaise).toBeDefined()

    state = service.submitAction({
      seat: 'user',
      turnToken: state.turnToken,
      action: 'raise',
      amount: openingRaise?.min
    })

    expect(state.actingSeatId).toBe('uplift')
    expect(state.legalActions.some((action) => action.kind === 'raise')).toBe(true)

    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      state = service.startNewHand()
      let sawUserCheck = false
      let guard = 0

      while (!sawUserCheck && guard < 80) {
        guard += 1
        if (state.phase === 'hand-complete') {
          state = service.startNewHand()
          continue
        }

        if (state.actingSeatId === 'user') {
          if (state.legalActions.some((action) => action.kind === 'check')) {
            sawUserCheck = true
            break
          }
          const call = state.legalActions.find((action) => action.kind === 'call')
          const raise = state.legalActions.find((action) => action.kind === 'raise')
          const action = call ?? raise ?? state.legalActions[0]
          state = service.submitAction({
            seat: 'user',
            turnToken: state.turnToken,
            action: action.kind,
            amount: action.kind === 'bet' || action.kind === 'raise' ? action.min : undefined
          })
          continue
        }

        if (state.actingSeatId === 'uplift') {
          state = service.useUpliftFallback()
          continue
        }

        throw new Error(`Unexpected acting seat: ${state.actingSeatId}`)
      }

      expect(sawUserCheck).toBe(true)
    } finally {
      random.mockRestore()
    }
  })

  it('makes local bots fold to expensive pressure with marginal holdings', () => {
    let sawBotFold = false

    for (let hand = 0; hand < 40 && !sawBotFold; hand += 1) {
      let state = service.startNewHand()
      if (state.actingSeatId !== 'user') continue

      const raise = state.legalActions.find((action) => action.kind === 'raise')
      if (!raise) continue

      const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
      try {
        state = service.submitAction({
          seat: 'user',
          turnToken: state.turnToken,
          action: 'raise',
          amount: raise.max ?? raise.min
        })

        if (state.actingSeatId === 'uplift') state = service.useUpliftFallback()
      } finally {
        random.mockRestore()
      }

      sawBotFold = state.publicActions.some((action) => isBotSeat(action.seatId) && action.action === 'fold')
    }

    expect(sawBotFold).toBe(true)
  })

  it('does not display an all-in raise as a fold', () => {
    let state = service.startNewHand()
    expect(state.actingSeatId).toBe('user')
    const raise = state.legalActions.find((action) => action.kind === 'raise')
    expect(raise?.max).toBeGreaterThan(0)

    state = service.submitAction({
      seat: 'user',
      turnToken: state.turnToken,
      action: 'raise',
      amount: raise?.max
    })

    const user = state.seats.find((seat) => seat.seatId === 'user')
    expect(state.publicActions.at(-1)?.action).toBe('raise')
    expect(user?.stack).toBe(0)
    expect(user?.bet).toBeGreaterThan(0)
    expect(user?.isFolded).toBe(false)
    expect(user?.status).not.toBe('folded')
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
    expect(state.review?.winningSeatIds.length).toBeGreaterThan(0)
    for (const winner of state.review?.winningSeatIds ?? []) {
      expect(state.seats.find((seat) => seat.seatId === winner)?.status).toBe('winner')
    }
    expect(state.review?.publicActions.some((action) => action.seatId === 'user' && action.action === 'fold')).toBe(true)
    expect(fs.existsSync(path.join(tempDir, 'bridge/latest-hand.json'))).toBe(true)
    const packet = JSON.parse(fs.readFileSync(path.join(tempDir, 'bridge/latest-hand.json'), 'utf8')) as LatestHandPacket
    expect(packet.result.bankrollAfter).toBe(state.bankroll)
    expect(packet.result.ratingAfter).toBe(state.rating)
    expect(packet.lesson).toBe(state.review?.lesson)
    expect(packet.showdown?.board).toEqual(state.review?.board)
  })

  it('plays repeated hands without losing table-chip conservation or hanging', () => {
    for (let hand = 0; hand < 75; hand += 1) {
      let state = service.getSnapshot()
      const startingTableTotal = tableChipTotal(state)
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
      expect(state.review?.winningSeatIds.length).toBeGreaterThan(0)
      expect(tableChipTotal(state)).toBe(startingTableTotal)
      for (const seat of state.seats) {
        expect(seat.stack).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(seat.stack)).toBe(true)
      }
      for (const winner of state.review?.winningSeatIds ?? []) {
        expect(state.seats.find((seat) => seat.seatId === winner)?.status).toBe('winner')
      }
      expect(state.history.length).toBe(Math.min(hand + 1, 12))
      const vpip = Number(state.tendencySummary.match(/VPIP-ish (\\d+)%/)?.[1] ?? 0)
      expect(vpip).toBeLessThanOrEqual(100)
      state = service.startNewHand()
    }
  })

  it('survives varied multi-hand play with bridge packets and history intact', () => {
    for (let hand = 0; hand < 120; hand += 1) {
      let state = service.getSnapshot()
      const startingTableTotal = tableChipTotal(state)
      let guard = 0

      while (state.phase !== 'hand-complete' && guard < 250) {
        guard += 1

        if (state.actingSeatId === 'user') {
          const previousSeq = state.actionSeq
          state = variedUserAction(state, hand, guard)
          expect(state.actionSeq).toBeGreaterThanOrEqual(previousSeq + 1)
          if (state.phase === 'playing' && state.seats.find((seat) => seat.seatId === 'user')?.isFolded) {
            state = service.fastForwardAfterFold()
          }
          continue
        }

        if (state.actingSeatId === 'uplift') {
          const packetPath = path.join(tempDir, 'bridge/current-turn.json')
          expect(fs.existsSync(packetPath)).toBe(true)
          const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8')) as CurrentTurnPacket
          expect(packet.handId).toBe(state.handId)
          expect(packet.turnToken).toBe(state.turnToken)
          expect(packet.holeCards).toHaveLength(2)
          state = service.useUpliftFallback()
          if (state.actingSeatId !== 'uplift') expect(fs.existsSync(packetPath)).toBe(false)
          continue
        }

        throw new Error(`Unexpected acting seat: ${state.actingSeatId}`)
      }

      expect(guard).toBeLessThan(250)
      expect(state.phase).toBe('hand-complete')
      expect(state.review).toBeDefined()
      expect(tableChipTotal(state)).toBe(startingTableTotal)
      expect(state.review?.publicActions).toHaveLength(state.actionSeq)
      expect(state.review?.bankrollAfter).toBe(state.bankroll)
      expect(state.review?.ratingAfter).toBe(state.rating)
      expect(state.history.length).toBe(Math.min(hand + 1, 12))
      expect(fs.existsSync(path.join(tempDir, 'bridge/current-turn.json'))).toBe(false)
      expect(fs.existsSync(path.join(tempDir, 'bridge/latest-hand.json'))).toBe(true)

      for (const seat of state.seats) {
        expect(Number.isInteger(seat.stack)).toBe(true)
        expect(Number.isInteger(seat.bet)).toBe(true)
        expect(seat.stack).toBeGreaterThanOrEqual(0)
        expect(seat.bet).toBe(0)
      }

      state = service.startNewHand()
      expect(state.phase).toBe('playing')
      for (const seat of state.seats) {
        expect(Number.isInteger(seat.stack)).toBe(true)
        expect(Number.isInteger(seat.bet)).toBe(true)
        expect(seat.stack).toBeGreaterThanOrEqual(0)
        expect(seat.bet).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
