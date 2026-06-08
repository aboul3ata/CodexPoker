import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LatestHandPacket } from '../src/shared/contracts'

let tempDir: string
let packetPath: string
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const packet: LatestHandPacket = {
  schemaVersion: 1,
  handId: 'hand_review_cli',
  completedAt: '2026-06-08T14:00:00.000Z',
  userSeat: 'user',
  result: {
    bankrollDelta: -150,
    bankrollAfter: 9850,
    ratingDelta: -2,
    ratingAfter: 998,
    winningSeatIds: ['uplift']
  },
  visibleDecisionSnapshots: [],
  publicActions: [
    { seq: 1, seatId: 'user', name: 'Ali', street: 'preflop', action: 'call', amount: 100, at: '2026-06-08T14:00:01.000Z' },
    { seq: 2, seatId: 'uplift', name: 'Uplift', street: 'flop', action: 'bet', amount: 200, at: '2026-06-08T14:00:02.000Z' },
    { seq: 3, seatId: 'user', name: 'Ali', street: 'flop', action: 'fold', at: '2026-06-08T14:00:03.000Z' }
  ],
  lesson: 'Ask what story the raise is telling before paying.',
  showdown: {
    board: [
      { rank: 'A', suit: 'clubs' },
      { rank: '9', suit: 'hearts' },
      { rank: '2', suit: 'spades' }
    ],
    revealedHands: {},
    winningHandName: 'Last player standing'
  },
  reviewPrompt: 'Review hand_review_cli.'
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-poker-review-test-'))
  packetPath = path.join(tempDir, 'latest-hand.json')
  fs.writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`)
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('game:review CLI', () => {
  it('emits a structured coaching plan for Codex chat', () => {
    const stdout = execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/cli/game-review.ts', '--file', packetPath], {
      cwd: repoRoot,
      encoding: 'utf8'
    })
    const output = JSON.parse(stdout) as {
      coachingPlan: {
        focusSpot: string
        didWell: string
        adjustment: string
        reviewScript: string[]
      }
      protocol: { destination: string }
    }

    expect(output.protocol.destination).toBe('Codex chat')
    expect(output.coachingPlan.focusSpot).toContain('flop fold')
    expect(output.coachingPlan.didWell).toContain('let the hand go')
    expect(output.coachingPlan.adjustment).toContain('before calling pressure')
    expect(output.coachingPlan.reviewScript[0]).toContain('Want the quick review?')
  })
})
