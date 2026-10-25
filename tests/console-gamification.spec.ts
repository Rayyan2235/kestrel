import { expect, test } from "@playwright/test";

// PR B gate: gamification on the real console (/console, Moments lesson, real DuckSim). Desktop only.
// Agent, voice and two-bot endpoints are guarded: no live calls.

test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.skip(({ isMobile }) => isMobile, "desktop only; one 390x664 screenshot is taken inside");

test("challenge on /console: prompt holds the real move, +25 on the pill, Workshop with locked item and rewards", async ({ page }) => {
  test.setTimeout(480000);
  const live: string[] = [];
  for (const p of ["**/api/agent/**", "**/api/voice/**", "**/api/two-bot/respond"]) {
    await page.route(p, (r) => { live.push(r.request().url()); return r.abort(); });
  }
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["127.0.0.1", "localhost"].includes(u.hostname) && u.protocol.startsWith("http")) live.push(r.url());
  });

  await page.goto("/console?profile=demo");
  await expect(page.getByTestId("duck-mode")).toBeVisible({ timeout: 90000 });
  await page.getByRole("button", { name: "Robot reply sound" }).click();
  await page.getByRole("navigation", { name: "Lesson" }).getByText("Moments").click();
  const pill = page.getByTestId("xp-pill");
  await expect(pill).toBeVisible({ timeout: 90000 });
  const xp0 = Number(await pill.getAttribute("aria-valuenow"));

  await page.getByTestId("start-challenge-moments-1").click();
  await expect(page.getByTestId("challenge-banner")).toBeVisible({ timeout: 180000 });
  await expect(page.getByTestId("setup-status")).toHaveCount(0, { timeout: 180000 });
  await expect(page.getByTestId("setup-failed")).toHaveCount(0);

  await page.getByLabel("Task for your duck").fill("move the right weight to 30 cm");
  await page.getByRole("button", { name: "Send task" }).click();
  await expect(page.getByTestId("prediction-prompt")).toBeVisible({ timeout: 30000 });
  const before = await page.getByTestId("balance").innerText();
  await page.waitForTimeout(1500);
  expect(await page.getByTestId("balance").innerText()).toBe(before); // held: nothing moved
  await page.screenshot({ path: "g7-shots/B-console-prompt-held.png" });

  await page.getByTestId("predict-balanced").click();
  await expect(page.getByTestId("xp-floater")).toContainText(/\+25.*matched|matched.*\+25|\+25/i, { timeout: 180000 });
  await expect.poll(async () => Number(await pill.getAttribute("aria-valuenow")), { timeout: 30000 }).toBeGreaterThanOrEqual(xp0 + 25);
  await expect(page.getByTestId("balance")).not.toHaveText(before);
  await page.screenshot({ path: "g7-shots/B-console-desktop.png" });

  await page.getByTestId("workshop-open").click();
  await expect(page.getByTestId("workshop-dialog")).toBeVisible();
  await page.getByTestId("workshop-tab-shell").click();
  await expect(page.locator('[data-testid^="item-"][aria-disabled="true"]').first()).toBeVisible();
  await expect(page.getByTestId("reward-offers")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 664 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "g7-shots/B-console-390x664.png" });
  expect(live).toEqual([]);
});
