export function checkNodeVersion(version: string) {
  const [major, minor] = version.split('.').map(Number)
  const ok = (major === 20 && minor >= 19)
    || (major === 22 && minor >= 12)
    || major > 22
  return {
    ok,
    detected: version,
    required: '^20.19.0 || >=22.12.0'
  }
}
