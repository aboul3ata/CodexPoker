import { expect, test } from '@playwright/test'

test('renders the playable CodexPoker table', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CodexPoker' })).toBeVisible()
  await expect(page.getByLabel('Session status').getByText('Elo', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Poker table' })).toBeVisible()
  await expect(page.getByText(/Table talk/)).toHaveCount(0)
  await expect(page.getByLabel('Banter')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Use fallback move' })).toHaveCount(0)
  await expect(page.getByText('Codexxyyy review', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Balance history' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Table beats' })).toBeVisible()
  const tableBox = await page.locator('.table-felt').boundingBox()
  const railBox = await page.getByRole('region', { name: 'Table beats' }).boundingBox()
  const communityBox = await page.locator('.community-cards').boundingBox()
  const heroHandBox = await page.locator('.hero-hand').boundingBox()
  expect(railBox?.y).toBeGreaterThan(tableBox?.y ?? 0)
  expect((railBox?.y ?? 0) + (railBox?.height ?? 0)).toBeLessThan((tableBox?.y ?? 0) + (tableBox?.height ?? 0))
  expect((railBox?.y ?? 0) + (railBox?.height ?? 0)).toBeLessThan(communityBox?.y ?? 0)
  expect((communityBox?.y ?? 0) + (communityBox?.height ?? 0)).toBeLessThan(heroHandBox?.y ?? 0)
  await expect(page.locator('.latest-action-burst')).toBeVisible()
  await expect(page.locator('.seat.bot .seat-kind-badge')).toHaveCount(4)
  await expect(page.locator('.seat.codex .seat-kind-badge')).toHaveCount(1)

  await page.getByRole('button', { name: 'Lineup' }).click()
  const lineup = page.getByRole('region', { name: 'Table lineup' })
  await expect(lineup).toBeVisible()
  await expect(lineup.getByText('This Codex session')).toBeVisible()
  await expect(lineup.getByText('Heuristic stack v0')).toBeVisible()
  await expect(lineup.getByText('Chat rival')).toBeVisible()

  await page.getByLabel('Reduce motion').check()
  await expect(page.locator('.app-shell')).toHaveClass(/reduced-motion/)
  await page.getByLabel('High-contrast suits').check()
  await expect(page.locator('.app-shell')).toHaveClass(/high-contrast-suits/)
  await lineup.getByRole('button', { name: 'Close lineup' }).click()
  await expect(lineup).toHaveCount(0)
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

  await expect(page.getByText(/Following table action|Codexxyyy to act|Your turn|Review ready|Bots moving/)).toBeVisible()
  await expect(page.locator('.action-rail .action-beat')).not.toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Use fallback move' })).toHaveCount(0)
})

test('routes Codexxyyy turns to this Codex chat instead of preview controls', async ({ page, request }) => {
  await page.goto('/')
  let state = (await (await request.post('/api/new-hand')).json()).state

  for (let guard = 0; state.actingSeatId !== 'uplift' && guard < 6; guard += 1) {
    expect(state.actingSeatId).toBe('user')
    const action = state.legalActions.find((item: { kind: string }) => item.kind === 'check' || item.kind === 'call') ?? state.legalActions[0]
    state = (await (await request.post('/api/action', {
      data: {
        seat: 'user',
        turnToken: state.turnToken,
        action: action.kind,
        amount: action.kind === 'bet' || action.kind === 'raise' ? action.min : undefined
      }
    })).json()).state
  }

  expect(state.actingSeatId).toBe('uplift')
  await page.reload()

  const codexTurn = page.getByRole('region', { name: 'Codex chat turn' })
  await expect(codexTurn).toBeVisible()
  await expect(codexTurn.getByText('Codexxyyy should act now.')).toBeVisible()
  await expect(codexTurn.getByText('npm run --silent game:loop')).toBeVisible()
  await expect(codexTurn.getByText('npm run --silent game:codex')).toBeVisible()
  await expect(codexTurn.getByText('npm run --silent game:play')).toHaveCount(0)
  await expect(page.getByText('Codexxyyy is thinking.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Use fallback move' })).toHaveCount(0)
})

test('prioritizes fast-fold simulation after Ali folds', async ({ page, request }) => {
  await page.goto('/')
  let state = (await (await request.post('/api/new-hand')).json()).state

  for (let guard = 0; state.actingSeatId !== 'user' && guard < 6; guard += 1) {
    if (state.actingSeatId === 'uplift') {
      state = (await (await request.post('/api/uplift/fallback')).json()).state
      continue
    }
    state = (await (await request.post('/api/new-hand')).json()).state
  }

  const fold = state.legalActions.find((action: { kind: string }) => action.kind === 'fold')
  expect(fold).toBeTruthy()
  state = (await (await request.post('/api/action', {
    data: {
      seat: 'user',
      turnToken: state.turnToken,
      action: 'fold'
    }
  })).json()).state
  expect(state.seats.find((seat: { seatId: string }) => seat.seatId === 'user')?.isFolded).toBe(true)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Simulate to result' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Codex chat turn' })).toHaveCount(0)
})

test('summarizes rapid bot runs as a multi-bot sweep', async ({ page, request }) => {
  await page.goto('/')
  let state = (await (await request.post('/api/new-hand')).json()).state
  let run: Array<{ name: string; seatId: string }> = []

  for (let guard = 0; guard < 24; guard += 1) {
    run = trailingBotRun(state.publicActions)
    if (run.length > 1) break

    if (state.phase !== 'playing') {
      state = (await (await request.post('/api/new-hand')).json()).state
      continue
    }

    if (state.actingSeatId === 'uplift') {
      state = (await (await request.post('/api/uplift/fallback')).json()).state
      continue
    }

    if (state.actingSeatId === 'user') {
      const action = state.legalActions.find((item: { kind: string }) => item.kind === 'call' || item.kind === 'check') ?? state.legalActions[0]
      state = (await (await request.post('/api/action', {
        data: {
          seat: 'user',
          turnToken: state.turnToken,
          action: action.kind
        }
      })).json()).state
      continue
    }

    state = (await (await request.post('/api/new-hand')).json()).state
  }

  expect(run.length).toBeGreaterThan(1)
  await page.reload()
  const burst = page.locator('.latest-action-burst')
  await expect(burst).toContainText('bot sweep')
  await expect(burst).toContainText(run[0].name)
  await expect(burst).toContainText(run.at(-1)?.name ?? '')
})

test('lets the user size a bet or raise from the preview', async ({ page, request }) => {
  await page.goto('/')
  let state = (await (await request.post('/api/new-hand')).json()).state
  let wager: { kind: string; min: number; max: number } | undefined

  for (let guard = 0; guard < 20; guard += 1) {
    if (state.phase !== 'playing') {
      state = (await (await request.post('/api/new-hand')).json()).state
      continue
    }

    if (state.actingSeatId === 'uplift') {
      state = (await (await request.post('/api/uplift/fallback')).json()).state
      continue
    }

    expect(state.actingSeatId).toBe('user')
    wager = state.legalActions.find((action: { kind: string; min?: number; max?: number }) =>
      (action.kind === 'bet' || action.kind === 'raise') && typeof action.min === 'number' && typeof action.max === 'number'
    )
    if (wager) break

    const nextAction = state.legalActions.find((action: { kind: string }) => action.kind === 'check' || action.kind === 'call') ?? state.legalActions[0]
    state = (await (await request.post('/api/action', {
      data: {
        seat: 'user',
        turnToken: state.turnToken,
        action: nextAction.kind
      }
    })).json()).state
  }

  expect(state.actingSeatId).toBe('user')
  if (!wager) throw new Error('Could not find a legal bet or raise spot for the sizing test.')
  const amount = Math.min(wager.max, wager.min + 100)
  const fieldName = wager.kind === 'raise' ? 'Raise amount' : 'Bet amount'

  await page.reload()
  await page.getByLabel(fieldName).fill(String(amount))
  await page.getByRole('button', { name: new RegExp(`${wager.kind === 'raise' ? 'Raise to' : 'Bet'} ${amount.toLocaleString('en-US')}`) }).click()

  const nextState = (await (await request.get('/api/state')).json()).state
  expect(nextState.publicActions.some((action: { seatId: string; action: string; amount?: number }) =>
    action.seatId === 'user' && action.action === wager.kind && action.amount === amount
  )).toBe(true)
  await expect(page.getByText(/Following table action|Codexxyyy to act|Your turn|Review ready|Bots moving/)).toBeVisible()
})

function trailingBotRun(actions: Array<{ seatId: string; street: string; name: string }>) {
  const last = actions.at(-1)
  if (!last || !isBotSeat(last.seatId)) return []

  const run: Array<{ name: string; seatId: string }> = []
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]
    if (action.street !== last.street || !isBotSeat(action.seatId)) break
    run.unshift(action)
  }
  return run
}

function isBotSeat(seatId: string) {
  return seatId !== 'user' && seatId !== 'uplift'
}

test('keeps the table usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CodexPoker' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Poker table' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Table beats' })).toBeVisible()
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
  await expect(page.getByText('Codexxyyy review', { exact: true })).toBeVisible()
  const reviewMoment = page.locator('.review-moment')
  await expect(reviewMoment).toBeVisible()
  const reviewMomentBox = await reviewMoment.boundingBox()
  const viewport = page.viewportSize()
  expect(reviewMomentBox?.y).toBeLessThan(viewport?.height ?? 900)
  const reviewNextHandBox = await page.locator('.review-panel .primary-action.wide').boundingBox()
  expect(reviewNextHandBox?.y).toBeLessThan(viewport?.height ?? 900)
  await expect(page.getByText(state.review.winningHandName).first()).toBeVisible()
  await expect(page.getByText(state.review.lesson).first()).toBeVisible()
  const codexReview = page.getByRole('region', { name: 'Codex review loop' })
  await expect(codexReview).toBeVisible()
  await expect(codexReview.getByText('Ask Codexxyyy here.')).toBeVisible()
  await expect(codexReview.getByText('npm run --silent game:codex')).toBeVisible()
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
