import { expect, test } from '@playwright/test'

test('renders the playable CodexPoker table', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CodexPoker' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Poker table' })).toBeVisible()
  await expect(page.getByText(/Table talk/)).toBeVisible()
  await expect(page.getByText('Uplift review', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Balance history' })).toBeVisible()
})

test('supports table talk and a legal user action', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Banter').fill('I am absolutely not bluffing.')
  await page.getByRole('button', { name: 'Send table talk' }).click()
  await expect(page.getByText('I am absolutely not bluffing.').first()).toBeVisible()

  const actionButton = page.getByRole('button', { name: /Call|Check|Fold|Raise|Bet/ }).first()
  const fallbackButton = page.getByRole('button', { name: /Use fallback move|Fast-fold result|Simulate to result|Next hand/ }).first()
  if (await actionButton.isVisible()) {
    await actionButton.click()
  } else {
    await expect(fallbackButton).toBeVisible()
    await fallbackButton.click()
  }

  await expect(page.getByText(/Codex to act|Your turn|Review ready|Bots moving/)).toBeVisible()
})

test('keeps the table usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CodexPoker' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Poker table' })).toBeVisible()
  await expect(page.locator('.action-footer')).toBeVisible()
})

test('offers a Codex review command after a completed hand', async ({ page, request }) => {
  await page.goto('/')
  let state = (await (await request.post('/api/new-hand')).json()).state

  for (let guard = 0; state.phase !== 'hand-complete' && guard < 8; guard += 1) {
    if (state.actingSeatId === 'uplift') {
      state = (await (await request.post('/api/uplift/fallback')).json()).state
      continue
    }

    if (state.actingSeatId === 'user') {
      const fold = state.legalActions.find((action: { kind: string }) => action.kind === 'fold') ?? state.legalActions[0]
      state = (await (await request.post('/api/action', {
        data: {
          seat: 'user',
          turnToken: state.turnToken,
          action: fold.kind,
          amount: fold.min
        }
      })).json()).state

      if (state.phase !== 'hand-complete') {
        state = (await (await request.post('/api/fast-forward')).json()).state
      }
      continue
    }

    throw new Error(`Unexpected actor while completing review setup: ${state.actingSeatId}`)
  }

  expect(state.phase).toBe('hand-complete')
  await page.reload()
  await expect(page.getByText('Review packet is ready')).toBeVisible()
  await expect(page.getByText('npm run --silent game:review -- --post')).toBeVisible()
})
