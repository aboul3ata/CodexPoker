import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  // The preview app has one local game session, so mutating e2e tests must not share it concurrently.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5193',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'CODEX_POKER_DATA_DIR=$(mktemp -d /tmp/codexpoker-e2e.XXXXXX) VITE_PORT=5193 npm run dev',
    url: 'http://127.0.0.1:5193',
    reuseExistingServer: false,
    timeout: 30000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } }
  ]
})
