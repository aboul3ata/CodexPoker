import { describe, expect, it } from 'vitest'
import { checkNodeVersion } from '../src/cli/doctor-checks'

describe('doctor compatibility checks', () => {
  it('enforces the minor-version floor for Node 20 and Node 22', () => {
    expect(checkNodeVersion('20.18.9').ok).toBe(false)
    expect(checkNodeVersion('20.19.0').ok).toBe(true)
    expect(checkNodeVersion('22.11.0').ok).toBe(false)
    expect(checkNodeVersion('22.12.0').ok).toBe(true)
    expect(checkNodeVersion('23.0.0').ok).toBe(true)
  })
})
