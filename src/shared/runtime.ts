export const runtimeSchemaVersion = 1 as const

export type RuntimeManifest = {
  schemaVersion: typeof runtimeSchemaVersion
  runtimeId: string
  pid: number
  apiUrl: string
  previewUrl: string
  repoRoot: string
  startedAt: string
}

export type HealthResponse = {
  ok: true
  app: 'codex-poker'
  schemaVersion: 1
  runtimeId: string
  pid: number
  repoRoot: string
  ready: true
}

export function isRuntimeManifest(value: unknown): value is RuntimeManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RuntimeManifest>
  return candidate.schemaVersion === runtimeSchemaVersion
    && typeof candidate.runtimeId === 'string'
    && Number.isInteger(candidate.pid)
    && typeof candidate.apiUrl === 'string'
    && typeof candidate.previewUrl === 'string'
    && typeof candidate.repoRoot === 'string'
    && typeof candidate.startedAt === 'string'
}
