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
