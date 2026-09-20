import { expect, test } from "@playwright/test";

test("keeps the table legible and decisions reachable at desktop and narrow sizes", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 640, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "CodexPoker home" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Poker table" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Your controls" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".hero-seat")).toHaveCount(2);
    await expect(page.locator(".bot-seat")).toHaveCount(4);
    const controls = await page
      .getByRole("region", { name: "Your controls" })
      .boundingBox();
    expect(controls!.y + controls!.height).toBeLessThanOrEqual(viewport.height);
  }
});

test("opens hand history without altering the game", async ({ page }) => {
  await page.goto("/");
  const before = await page.locator(".pot").innerText();
  await page.getByRole("button", { name: "Hand history" }).click();
  await expect(
    page.getByRole("region", { name: "Hand history" }),
  ).toBeVisible();
  await expect(page.getByLabel("Current hand actions")).toBeVisible();
  expect(await page.locator(".pot").innerText()).toBe(before);
  await page.getByRole("button", { name: "Close ×" }).click();
  await expect(page.getByRole("region", { name: "Hand history" })).toHaveCount(
    0,
  );
});

test("HTTP controls and refresh remain usable when the event stream is unavailable", async ({
  page,
  request,
}) => {
  const live = (await (await request.get("/api/state")).json()).state;
  let state = {
    ...live,
    actingSeatId: "user",
    phase: "playing",
    turnToken: "test-turn",
    legalActions: [{ kind: "check" }],
  };
  await page.route("**/events", (route) => route.abort());
  await page.route("**/api/state", (route) =>
    route.fulfill({ json: { ok: true, state } }),
  );
  await page.route("**/api/action", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      seat: "user",
      action: "check",
      turnToken: "test-turn",
    });
    state = {
      ...state,
      actingSeatId: "uplift",
      actionSeq: state.actionSeq + 1,
      legalActions: [],
    };
    await route.fulfill({ json: { ok: true, state } });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Check", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Check", exact: true }),
  ).toHaveCount(0);
  state = {
    ...state,
    actingSeatId: "user",
    actionSeq: state.actionSeq + 1,
    legalActions: [{ kind: "check" }],
  };
  await expect(
    page.getByRole("button", { name: "Check", exact: true }),
  ).toBeEnabled({ timeout: 6000 });
});

test("a delayed HTTP poll cannot restore the previous hand after dealing", async ({
  page,
  request,
}) => {
  const live = (await (await request.get("/api/state")).json()).state;
  const old = {
    ...live,
    handId: "old-hand",
    phase: "hand-complete",
    actingSeatId: null,
    review: {
      handId: "old-hand",
      completedAt: new Date().toISOString(),
      bankrollDelta: 0,
      bankrollAfter: 10000,
      ratingDelta: 0,
      ratingAfter: 1000,
      board: [],
      finalPot: 100,
      winningSeatIds: ["user"],
      winningHandName: "Last player standing",
      lesson: "",
      publicActions: [],
      showdownCards: {},
    },
  };
  const fresh = {
    ...live,
    handId: "fresh-hand",
    phase: "playing",
    review: undefined,
    actingSeatId: "user",
    actionSeq: 0,
    legalActions: [{ kind: "check" }],
  };
  let current = old,
    reads = 0,
    releaseOld: (() => void) | undefined;
  await page.route("**/events", (route) => route.abort());
  await page.route("**/api/state", async (route) => {
    const captured = current;
    if (++reads === 2)
      await new Promise<void>((resolve) => {
        releaseOld = resolve;
      });
    await route.fulfill({ json: { ok: true, state: captured } });
  });
  await page.route("**/api/new-hand", async (route) => {
    current = fresh;
    await route.fulfill({ json: { ok: true, state: fresh } });
  });
  await page.goto("/");
  await expect.poll(() => Boolean(releaseOld)).toBe(true);
  await page.getByRole("button", { name: "Next hand" }).click();
  await expect(
    page.getByRole("button", { name: "Check", exact: true }),
  ).toBeVisible();
  const lateResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/state"),
  );
  releaseOld!();
  await lateResponse;
  await page.waitForTimeout(250); // Allow the deliberately delayed response to reach React.
  await expect(
    page.getByRole("button", { name: "Check", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Next hand" })).toHaveCount(0);
});
