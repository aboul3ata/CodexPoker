import { describe, expect, it } from 'vitest'
import { isCodexPokerSupervisorCommand } from '../src/cli/runtime-process'

describe('runtime process ownership', () => {
  it('matches only this repo supervisor command', () => {
    const repoRoot = '/Users/example/CodexPoker'

    expect(isCodexPokerSupervisorCommand(
      `/usr/bin/node ${repoRoot}/node_modules/tsx/dist/cli.mjs ${repoRoot}/scripts/dev.ts`,
      repoRoot
    )).toBe(true)
    expect(isCodexPokerSupervisorCommand('/usr/bin/node other-service.js', repoRoot)).toBe(false)
    expect(isCodexPokerSupervisorCommand(
      '/usr/bin/node /Users/example/OtherRepo/scripts/dev.ts',
      repoRoot
    )).toBe(false)
    expect(isCodexPokerSupervisorCommand(
      `/usr/bin/node unrelated.js --note ${repoRoot}/scripts/dev.ts --keep-running`,
      repoRoot
    )).toBe(false)
  })
})
