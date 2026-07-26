export type WatcherCredential = {
  schemaVersion: 1
  runtimeId: string
  token: string
}

export function isWatcherCredential(value: unknown): value is WatcherCredential {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WatcherCredential>
  return candidate.schemaVersion === 1
    && typeof candidate.runtimeId === 'string'
    && typeof candidate.token === 'string'
    && candidate.token.length >= 32
}
