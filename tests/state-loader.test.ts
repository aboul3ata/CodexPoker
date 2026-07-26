import { describe, expect, it, vi } from 'vitest'
import { fetchStateWithRetry } from '../src/client/state-loader'

describe('initial state loading', () => {
  it('survives a delayed backend instead of getting stuck on the loader', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('proxy unavailable', { status: 502 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        state: { handId: 'ready-hand' }
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const sleep = vi.fn().mockResolvedValue(undefined)

    const state = await fetchStateWithRetry({
      attempts: 3,
      fetchImpl,
      sleep,
      initialDelayMs: 10
    })

    expect(state.handId).toBe('ready-hand')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('returns an actionable error after bounded retries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }))

    await expect(fetchStateWithRetry({
      attempts: 2,
      fetchImpl,
      sleep: async () => undefined,
      initialDelayMs: 1
    })).rejects.toThrow('Unable to reach the local poker server')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('times out a request that connects but never responds', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    }))

    await expect(fetchStateWithRetry({
      attempts: 1,
      fetchImpl,
      requestTimeoutMs: 5
    })).rejects.toThrow('Unable to reach the local poker server')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
