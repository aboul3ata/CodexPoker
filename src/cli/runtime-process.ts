import { execFileSync } from 'node:child_process'
import path from 'node:path'

export function isCodexPokerSupervisor(pid: number, repoRoot: string) {
  try {
    const command = process.platform === 'win32'
      ? execFileSync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`
        ], { encoding: 'utf8', timeout: 1500 })
      : execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
          encoding: 'utf8',
          timeout: 1000
        })
    return isCodexPokerSupervisorCommand(command, repoRoot)
  } catch {
    return false
  }
}

export function isCodexPokerSupervisorCommand(command: string, repoRoot: string) {
  const supervisorPath = path.join(repoRoot, 'scripts/dev.ts')
  return command.trim().endsWith(supervisorPath)
}
