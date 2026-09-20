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
