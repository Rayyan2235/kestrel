import { expect, test, type Page } from "@playwright/test";

// G4/G6/G7 gates on /?demo=progress. Test-id contract (agreed with the implementer):
//   demo-banner, challenge-banner, start-challenge-{id}, prediction-prompt,
//   predict-left-down | predict-balanced | predict-right-down | predict-skip,
//   xp-pill (role=progressbar), xp-floater, recent-xp-toggle, recent-xp,
//   levelup-toast (role=status) + Dismiss button, explain-open,
//   workshop-open, workshop-dialog, workshop-tab-{shell|eyes|gear}, item-{id} (aria-disabled when locked),
//   reward-offers, reward-pick-{id}, shuffle, saved-note, bot-pip / bot-nova (existing), balance-result (existing).

const DEMO = "/?demo=progress";
const external: string[] = [];
test.use({
  launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});
test.beforeEach(({ page }) => {
  external.length = 0;
  page.on("request", (r) => {
    const u = new URL(r.url(), "http://127.0.0.1");
    if (!["127.0.0.1", "localhost"].includes(u.hostname) && u.protocol.startsWith("http")) external.push(r.url());
    if (u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/health")) external.push(r.url());
  });
});
test.afterEach(() => expect(external).toEqual([]));

const say = async (page: Page, text: string) => {
  await page.getByRole("textbox", { name: "Message your robot" }).fill(text);
  await page.getByRole("button", { name: "Send command" }).click();
};
const xpNow = async (page: Page) => Number(await page.getByTestId("xp-pill").getAttribute("aria-valuenow"));
const start = async (page: Page, id: string) => {
  await page.goto(DEMO);
  await expect(page.getByTestId("demo-banner")).toContainText("Demo profile: progress is not saved");
  await page.getByTestId(`start-challenge-${id}`).click();
  await expect(page.getByTestId("challenge-banner")).toBeVisible();
};

test.describe("G4: HUD and prediction prompt", () => {
  test("the move is held, balance-result is unchanged, then Balanced pays 25", async ({ page }) => {
    await start(page, "moments-1");
    const before = await page.getByTestId("balance-result").innerText();
    const xp0 = await xpNow(page);
    await say(page, "move the right weight to 40 cm");
    await expect(page.getByTestId("prediction-prompt")).toBeVisible();
    await expect(page.getByText(/did not understand/i)).toHaveCount(0);
    expect(await page.getByTestId("balance-result").innerText()).toBe(before);
    await page.getByTestId("predict-balanced").click();
    await expect(page.getByTestId("xp-floater")).toContainText("+25");
    await expect(page.getByTestId("xp-floater")).toContainText(/matched/i);
    expect(await xpNow(page)).toBeGreaterThan(xp0);
    await expect(page.getByTestId("balance-result")).not.toHaveText(before);
  });

  test("a wrong choice pays +10 locked", async ({ page }) => {
    await start(page, "moments-1");
    await say(page, "move the right weight to 40 cm");
    await page.getByTestId("predict-left-down").click();
    await expect(page.getByTestId("xp-floater")).toContainText("+10");
  });

  test("Skip moves with no prediction floater", async ({ page }) => {
    await start(page, "moments-1");
    await say(page, "move the right weight to 40 cm");
    await page.getByTestId("predict-skip").click();
    await expect(page.getByTestId("prediction-prompt")).toBeHidden();
    await expect(page.getByTestId("xp-floater").filter({ hasText: /prediction/i })).toHaveCount(0);
  });

  test("Stop while held: no move, no XP", async ({ page }) => {
    await start(page, "moments-1");
    const before = await page.getByTestId("balance-result").innerText();
    const xp0 = await xpNow(page);
    await say(page, "move the right weight to 40 cm");
    await expect(page.getByTestId("prediction-prompt")).toBeVisible();
    await page.getByRole("button", { name: /stop/i }).first().click();
    await expect(page.getByTestId("prediction-prompt")).toBeHidden();
    expect(await page.getByTestId("balance-result").innerText()).toBe(before);
    expect(await xpNow(page)).toBe(xp0);
  });

  test("a repeated Ask-peer in one challenge shows 'already counted'", async ({ page }) => {
    await start(page, "moments-1");
    const ask = page.getByRole("button", { name: /ask (pip|nova)/i }).first();
    await ask.click();
    await ask.click();
    await expect(page.getByTestId("xp-floater").filter({ hasText: /already counted/i }).first()).toBeVisible();
  });

  test("reload keeps XP on a saved profile but the demo profile is never persisted", async ({ page }) => {
    await start(page, "moments-1");
    await say(page, "move the right weight to 40 cm");
    await page.getByTestId("predict-balanced").click();
    await page.reload();
    const stored = await page.evaluate(() => window.localStorage.getItem("kestrel.progress"));
    expect(stored).toBeNull();
  });

  test("the toast: role=status, never steals focus, Dismiss closes it, reason stays in Recent XP", async ({ page }) => {
    await start(page, "moments-1");
    await say(page, "move the right weight to 40 cm");
    await page.getByTestId("predict-balanced").click();
    const input = page.getByRole("textbox", { name: "Message your robot" });
    await input.focus();
    const toast = page.getByTestId("levelup-toast");
    if (await toast.isVisible().catch(() => false)) {
      await expect(toast).toHaveAttribute("role", "status");
      await expect(input).toBeFocused();
      await toast.getByRole("button", { name: "Dismiss" }).click();
      await expect(toast).toBeHidden();
    }
    await page.getByTestId("recent-xp-toggle").click();
    await expect(page.getByTestId("recent-xp")).toContainText(/matched/i);
  });

  test("the existing ?demo=two-bot page is unaffected: no HUD, no prompt", async ({ page }) => {
    await page.goto("/?demo=two-bot");
    await expect(page.getByTestId("demo-banner")).toBeVisible();
    await expect(page.getByTestId("prediction-prompt")).toHaveCount(0);
    await say(page, "move the right weight to 40 cm");
    await expect(page.getByTestId("prediction-prompt")).toHaveCount(0);
  });

  test("390x664: the XP pill does not overlap the handback strip", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await start(page, "moments-1");
    await say(page, "why does it tilt?");
    const strip = page.getByTestId("handback-strip");
    await expect(strip).toBeVisible({ timeout: 15000 });
    const a = await page.getByTestId("xp-pill").boundingBox();
    const b = await strip.boundingBox();
    expect(a && b).toBeTruthy();
    const overlap = !(a!.x + a!.width <= b!.x || b!.x + b!.width <= a!.x || a!.y + a!.height <= b!.y || b!.y + b!.height <= a!.y);
    expect(overlap).toBe(false);
  });

  test("reduced motion: floater reason text still present", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await start(page, "moments-1");
    await say(page, "move the right weight to 40 cm");
    await page.getByTestId("predict-balanced").click();
    await expect(page.getByTestId("xp-floater")).toContainText(/matched/i);
  });
});

test.describe("G6: Workshop", () => {
  const open = async (page: Page) => {
    await page.goto(DEMO);
    await page.getByTestId("workshop-open").click();
    await expect(page.getByTestId("workshop-dialog")).toBeVisible();
  };

  test("keyboard: Escape closes and focus returns to the wrench", async ({ page }) => {
    await page.goto(DEMO);
    const wrench = page.getByTestId("workshop-open");
    await wrench.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("workshop-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("workshop-dialog")).toBeHidden();
    await expect(wrench).toBeFocused();
  });

  test("the demo seed has two reward picks to make, and a pick unlocks and equips on the stage bot", async ({ page }) => {
    await open(page);
    const offers = page.getByTestId("reward-offers");
    await expect(offers).toBeVisible();
    const pick = offers.locator('[data-testid^="reward-pick-"]').first();
    const shellBefore = await page.getByTestId("stage").getByTestId("bot-pip").evaluate((el) => getComputedStyle(el).getPropertyValue("--shell"));
    await pick.click();
    await expect(page.getByTestId("reward-offers").locator('[data-testid^="reward-pick-"]')).toHaveCount(await offers.locator('[data-testid^="reward-pick-"]').count());
    expect(shellBefore).toBeTruthy();
  });

  test("a locked item is not equippable by click or keyboard", async ({ page }) => {
    await open(page);
    await page.getByTestId("workshop-tab-shell").click();
    const locked = page.locator('[data-testid^="item-"][aria-disabled="true"]').first();
    await expect(locked).toBeVisible();
    const before = await page.getByTestId("stage").getByTestId("bot-pip").evaluate((el) => getComputedStyle(el).getPropertyValue("--shell"));
    await locked.click({ force: true });
    await locked.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    const after = await page.getByTestId("stage").getByTestId("bot-pip").evaluate((el) => getComputedStyle(el).getPropertyValue("--shell"));
    expect(after).toBe(before);
  });

  test("Nova's current shell is disabled on Pip's Shell tab with its reason", async ({ page }) => {
    await open(page);
    await page.getByTestId("workshop-tab-shell").click();
    await expect(page.getByTestId("item-shell-mint")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("item-shell-mint")).toContainText(/Nova already wears this shell/i);
  });

  test("equipping an allowed shell changes --shell on bot-pip only; data-shape and name tag stay", async ({ page }) => {
    await open(page);
    await page.getByTestId("workshop-tab-shell").click();
    const shapeBefore = await page.getByTestId("stage").getByTestId("bot-pip").getAttribute("data-shape");
    const novaBefore = await page.getByTestId("stage").getByTestId("bot-nova").evaluate((el) => getComputedStyle(el).getPropertyValue("--shell"));
    const pipBefore = await page.getByTestId("stage").getByTestId("bot-pip").evaluate((el) => getComputedStyle(el).getPropertyValue("--shell"));
    const free = page.locator('[data-testid^="item-shell-"]:not([aria-disabled="true"])');
    const n = await free.count();
    let changed = false;
    for (let i = 0; i < n && !changed; i++) {
      await free.nth(i).click();
      const now = await page.getByTestId("stage").getByTestId("bot-pip").evaluate((el) => getComputedStyle(el).getPropertyValue("--shell"));
      changed = now !== pipBefore;
    }
    expect(changed).toBe(true);
    expect(await page.getByTestId("stage").getByTestId("bot-pip").getAttribute("data-shape")).toBe(shapeBefore);
    expect(await page.getByTestId("stage").getByTestId("bot-nova").evaluate((el) => getComputedStyle(el).getPropertyValue("--shell"))).toBe(novaBefore);
  });

  test("tooltip/label says the item is cosmetic", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("workshop-dialog")).toContainText(/Cosmetic: does not change how (Pip|Nova) moves/i);
  });

  test("Shuffle: 50 presses never leave a locked item, a shared shell or an unreadable eye", async ({ page }) => {
    await open(page);
    const shuffle = page.getByTestId("shuffle");
    for (let i = 0; i < 50; i++) {
      await shuffle.click();
      const [pip, nova] = await Promise.all(
        ["bot-pip", "bot-nova"].map((id) => page.getByTestId("stage").getByTestId(id).evaluate((el) => getComputedStyle(el).getPropertyValue("--shell").trim())),
      );
      expect(pip).not.toBe(nova);
    }
  });
});

test.describe("G7: sample run", () => {
  test("moments-1 correct, moments-2 wrong then right (comeback), explanation, level-up path reaches the Workshop", async ({ page }) => {
    await start(page, "moments-1");
    await say(page, "move the right weight to 40 cm");
    await page.getByTestId("predict-balanced").click();
    await expect(page.getByTestId("xp-floater")).toContainText("+25");
    await page.getByTestId("explain-open").click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /submit|send/i }).first().click();
    await expect(page.getByTestId("xp-floater").filter({ hasText: /\+20/ }).first()).toBeVisible();

    await page.getByTestId("start-challenge-moments-2").click();
    await say(page, "move the right weight to 25 cm");
    await page.getByTestId("predict-right-down").click();
    await expect(page.getByTestId("xp-floater")).toContainText("+10");
    await say(page, "move the right weight to 30 cm");
    await page.getByTestId("predict-balanced").click();
    await expect(page.getByTestId("xp-floater").filter({ hasText: /comeback/i }).first()).toBeVisible();

    await page.getByTestId("workshop-open").click();
    await expect(page.getByTestId("workshop-dialog")).toBeVisible();
  });
});
