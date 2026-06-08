import { expect, test } from '@playwright/test'

test('renders the playable CodexPoker table', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CodexPoker' })).toBeVisible()
  await expect(page.getByLabel('Session status').getByText('Elo', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Poker table' })).toBeVisible()
  await expect(page.getByText(/Table talk/)).toHaveCount(0)
  await expect(page.getByLabel('Banter')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Use fallback move' })).toHaveCount(0)
  await expect(page.getByText('Uplift review', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Balance history' })).toBeVisible()
})

test('supports a legal user action from the preview', async ({ page, request }) => {
  await page.goto('/')
  let state = (await (await request.post('/api/new-hand')).json()).state

  for (let guard = 0; state.actingSeatId !== 'user' && guard < 6; guard += 1) {
    if (state.actingSeatId === 'uplift') {
      state = (await (await request.post('/api/uplift/fallback')).json()).state
      continue
    }
    state = (await (await request.post('/api/new-hand')).json()).state
  }

  expect(state.actingSeatId).toBe('user')
  await page.reload()
  const actionButton = page.getByRole('button', { name: /Call|Check|Fold|Raise|Bet/ }).first()
  await expect(actionButton).toBeVisible()
  await actionButton.click()

  await expect(page.getByText(/Codex to act|Your turn|Review ready|Bots moving/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use fallback move' })).toHaveCount(0)
})

test('lets the user size a bet or raise from the preview', async ({ page, request }) => {
  await page.goto('/')
  let state = (await (await request.post('/api/new-hand')).json()).state

  for (let guard = 0; state.actingSeatId !== 'user' && guard < 4; guard += 1) {
    if (state.actingSeatId !== 'uplift') break
    state = (await (await request.post('/api/uplift/fallback')).json()).state
  }

  expect(state.actingSeatId).toBe('user')
  const wager = state.legalActions.find((action: { kind: string }) => action.kind === 'bet' || action.kind === 'raise')
  expect(wager).toBeTruthy()
  const amount = Math.min(wager.max, wager.min + 100)
  const fieldName = wager.kind === 'raise' ? 'Raise amount' : 'Bet amount'

  await page.reload()
  await page.getByLabel(fieldName).fill(String(amount))
  await page.getByRole('button', { name: new RegExp(`${wager.kind === 'raise' ? 'Raise to' : 'Bet'} ${amount.toLocaleString('en-US')}`) }).click()

  const nextState = (await (await request.get('/api/state')).json()).state
  expect(nextState.publicActions.some((action: { seatId: string; action: string; amount?: number }) =>
    action.seatId === 'user' && action.action === wager.kind && action.amount === amount
  )).toBe(true)
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
  expect(state.board).toEqual(state.review.board)
  expect(state.pot).toBe(state.review.finalPot)
  await page.reload()
  await expect(page.getByText('Uplift review', { exact: true })).toBeVisible()
  const reviewMoment = page.locator('.review-moment')
  await expect(reviewMoment).toBeVisible()
  const reviewMomentBox = await reviewMoment.boundingBox()
  const viewport = page.viewportSize()
  expect(reviewMomentBox?.y).toBeLessThan(viewport?.height ?? 900)
  const reviewNextHandBox = await page.locator('.review-panel .primary-action.wide').boundingBox()
  expect(reviewNextHandBox?.y).toBeLessThan(viewport?.height ?? 900)
  await expect(page.getByText(state.review.winningHandName).first()).toBeVisible()
  await expect(page.getByText(state.review.lesson).first()).toBeVisible()
  await expect(page.getByText('Review packet is ready')).toHaveCount(0)
  await expect(page.getByText('npm run --silent game:review')).toHaveCount(0)
  if (state.board.length > 0) {
    await expect(page.locator('.community-cards .playing-card.empty')).toHaveCount(5 - state.board.length)
  }

  await page.locator('.review-panel .primary-action.wide').click()
  const freshState = (await (await request.get('/api/state')).json()).state
  expect(freshState.phase).toBe('playing')
  expect(freshState.review).toBeUndefined()
})
