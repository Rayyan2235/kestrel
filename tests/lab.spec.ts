import { expect, test, type Page } from "@playwright/test";

const weight = (page: Page, side: "Left" | "Right") => page.getByRole("button", { name: new RegExp(`^${side} weight, `) });
const dockStatus = (page: Page) => page.getByRole("region", { name: "Crew dock" }).locator("p").first();
const win = (page: Page, name: "Pip" | "Nova") => page.getByRole("region", { name: `${name} window` });
const box = async (page: Page, name: "Pip" | "Nova") => (await win(page, name).boundingBox())!;

// CI renders WebGL in software, too slow for the Microduck scene: it runs the
// interface with the placeholder robots and authored controller instead.
const HOME = process.env.CI ? "/?physics=off" : "/";

/** The lab is ready once the scene has drawn and its labels follow the world. */
async function ready(page: Page, url = HOME) {
  await page.goto(url);
  await expect(page.locator("canvas")).toBeVisible({ timeout: 45_000 });
  await expect(weight(page, "Left")).toBeVisible({ timeout: 20_000 });
}

async function moveWith(page: Page, side: "Left" | "Right", cm: string, bot = "Pip") {
  await weight(page, side).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Distance from the pivot" }).fill(cm);
  await dialog.getByRole("button", { name: `Ask ${bot} to move it` }).click();
}

test.describe("both layouts", () => {
  test("the lab leads: windows start minimized and capabilities are labelled honestly", async ({ page, isMobile }) => {
    await ready(page);
    await expect(page.getByRole("heading", { level: 1, name: "Kestrel · Balance bench" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Pip window" })).toHaveCount(0);
    if (isMobile) await expect(page.getByRole("tab", { name: /Pip/ })).toBeVisible();
    else await expect(page.getByRole("button", { name: "Select Pip" })).toBeVisible();
    await expect(page.getByText(/Microduck/).first()).toBeVisible();
    await expect(page.getByText(/live AI is not connected/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("Stop cancels a request and leaves the world as it was", async ({ page }) => {
    await ready(page);
    await moveWith(page, "Left", "10");
    await expect(dockStatus(page)).toContainText("Pip is");
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(dockStatus(page)).toHaveText("Stopped. Pip left the left weight where it was.");
    await expect(weight(page, "Left")).toContainText("200 g at 20 cm");
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  });

  test("keyboard users reach the apparatus controls, with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    const tag = weight(page, "Left");
    await tag.focus();
    expect(await tag.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await tag.press("Enter");
    const field = page.getByRole("dialog").getByRole("textbox", { name: "Distance from the pivot" });
    await expect(field).toBeFocused();
    await field.fill("50");
    await expect(page.getByText("Choose 5 to 45 cm.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask Pip to move it" })).toBeDisabled();
    await field.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(tag).toBeFocused();
  });

  test("without WebGL the flat view keeps the experiment usable", async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === "webgl" || type === "webgl2") return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Flat view of the lab" })).toBeVisible();
    await moveWith(page, "Right", "40");
    await expect(dockStatus(page)).toHaveText("Pip moved the right weight to 40 cm.", { timeout: 60_000 });
  });
});

test.describe("desktop agent windows", () => {
  test.skip(({ isMobile }) => isMobile, "desktop windows only");

  test("each bot gets its own window; its composer always addresses that bot", async ({ page }) => {
    await ready(page);
    await page.getByRole("button", { name: "Select Pip" }).click();
    await page.getByRole("button", { name: "Select Nova" }).click();
    await expect(win(page, "Pip")).toBeVisible();
    await expect(win(page, "Nova")).toBeVisible();
    await expect(page.getByRole("button", { name: "Select Nova" })).toHaveAttribute("aria-pressed", "true");
    const pip = win(page, "Pip");
    await pip.getByRole("textbox", { name: "Message Pip" }).fill("hint");
    await pip.getByRole("button", { name: "Send to Pip" }).click();
    await expect(pip.getByText("You → Pip")).toBeVisible();
    await expect(pip.getByText("Pip → You")).toBeVisible();
    await expect(win(page, "Nova").getByText("You → Pip")).toHaveCount(0);
  });

  test("a request from a window walks the Microduck, survives minimizing and reports the measurement", async ({ page }) => {
    test.skip(!!process.env.CI, "Microduck physics needs a GPU; CI renders WebGL in software");
    test.setTimeout(150_000);
    await ready(page);
    await expect(page.getByText(/Robots: Microduck bodies in MuJoCo/)).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: "Select Pip" }).click();
    const pip = win(page, "Pip");
    await pip.getByRole("textbox", { name: "Message Pip" }).fill("right weight to 40 cm");
    await pip.getByRole("button", { name: "Send to Pip" }).click();
    await expect(dockStatus(page)).toContainText("Pip is");
    await pip.getByRole("button", { name: "Minimize Pip window" }).click();
    await expect(win(page, "Pip")).toHaveCount(0);
    await expect(dockStatus(page)).toHaveText("Pip moved the right weight to 40 cm.", { timeout: 90_000 });
    await expect(weight(page, "Right")).toContainText("100 g at 40 cm");
    await expect(page.getByText("Balanced", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Select Pip" }).click();
    await expect(win(page, "Pip").getByText(/Measured 4,000 g·cm left and 4,000 g·cm right: balanced/)).toBeVisible();
  });

  test("releasing the beam lets MuJoCo tip it toward the heavier turning effect, before and after a push", async ({ page }) => {
    test.skip(!!process.env.CI, "Microduck physics needs a GPU; CI renders WebGL in software");
    test.setTimeout(150_000);
    await ready(page);
    await expect(page.getByText(/Robots: Microduck bodies in MuJoCo/)).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: "Release beam" }).click();
    await expect(page.getByText(/The left side went down/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Lock beam" }).click();
    await expect(page.getByRole("button", { name: "Release beam" })).toBeVisible({ timeout: 10_000 });
    await moveWith(page, "Right", "40");
    await expect(dockStatus(page)).toHaveText("Pip moved the right weight to 40 cm.", { timeout: 90_000 });
    await page.getByRole("button", { name: "Release beam" }).click();
    await expect(page.getByText(/The beam stayed level/)).toBeVisible({ timeout: 10_000 });
  });

  test("bot-to-bot turns are labelled sender → recipient in both windows", async ({ page }) => {
    await ready(page);
    await page.getByRole("button", { name: "Select Pip" }).click();
    await page.getByRole("button", { name: "Select Nova" }).click();
    await win(page, "Pip").getByRole("button", { name: "Ask Nova to check" }).click();
    for (const name of ["Pip", "Nova"] as const) {
      await expect(win(page, name).getByText("Pip → Nova")).toBeVisible();
      await expect(win(page, name).getByText("Nova → Pip")).toBeVisible({ timeout: 5000 });
    }
  });

  test("windows drag, snap, resize, move by keyboard, and remember geometry but not conversations", async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" }); // measure boxes without the entrance scale
    await ready(page);
    await page.getByRole("button", { name: "Select Pip" }).click();
    const start = await box(page, "Pip");
    const title = page.getByLabel("Pip window title bar");
    const grip = (await title.boundingBox())!;
    await page.mouse.move(grip.x + 120, grip.y + 20);
    await page.mouse.down();
    await page.mouse.move(grip.x + 260, grip.y + 120, { steps: 8 });
    await page.mouse.up();
    const dragged = await box(page, "Pip");
    expect(dragged.x).toBeGreaterThan(start.x + 100);
    expect(dragged.y).toBeGreaterThan(start.y + 60);
    await title.focus();
    await title.press("ArrowLeft");
    expect((await box(page, "Pip")).x).toBeCloseTo(dragged.x - 24, 0);
    await title.press("Shift+ArrowDown");
    expect((await box(page, "Pip")).height).toBeCloseTo(dragged.height + 24, 0);
    const handle = win(page, "Pip").locator('[data-edge="e"]');
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + 3, h.y + 40);
    await page.mouse.down();
    await page.mouse.move(h.x + 63, h.y + 40, { steps: 5 });
    await page.mouse.up();
    const resized = await box(page, "Pip");
    expect(resized.width).toBeGreaterThan(dragged.width + 40);
    await win(page, "Pip").getByRole("textbox", { name: "Message Pip" }).fill("hint");
    await win(page, "Pip").getByRole("button", { name: "Send to Pip" }).click();
    await ready(page);
    await expect(win(page, "Pip")).toHaveCount(0);
    await page.getByRole("button", { name: "Select Pip" }).click();
    const restored = await box(page, "Pip");
    expect(Math.abs(restored.x - resized.x)).toBeLessThan(3);
    expect(Math.abs(restored.width - resized.width)).toBeLessThan(3);
    await expect(win(page, "Pip").getByText("No messages with Pip yet", { exact: false })).toBeVisible();
  });

  test("Show lab hides the windows and restores their arrangement; Arrange tiles them to the edges", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    await page.getByRole("button", { name: "Arrange" }).click();
    const pip = await box(page, "Pip");
    const nova = await box(page, "Nova");
    const vw = page.viewportSize()!.width;
    expect(pip.x).toBeLessThan(40);
    expect(nova.x + nova.width).toBeGreaterThan(vw - 40);
    await page.getByRole("button", { name: "Show lab" }).click();
    await expect(win(page, "Pip")).toBeHidden();
    await expect(win(page, "Nova")).toBeHidden();
    await page.getByRole("button", { name: "Show windows" }).click();
    expect((await box(page, "Pip")).x).toBeCloseTo(pip.x, 0);
    expect((await box(page, "Nova")).x).toBeCloseTo(nova.x, 0);
    await win(page, "Nova").getByRole("button", { name: "Close Nova window" }).click();
    await expect(win(page, "Nova")).toHaveCount(0);
    await expect(win(page, "Pip")).toBeVisible();
  });
});

test.describe("phone conversation", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout only");

  test("one expandable conversation window with a tab per bot", async ({ page }) => {
    await ready(page);
    await expect(page.getByRole("region", { name: "Pip window" })).toHaveCount(0);
    const sheet = page.getByRole("region", { name: "Crew conversation" });
    await expect(sheet.getByRole("tab", { name: /Pip/ })).toBeVisible();
    await sheet.getByRole("tab", { name: /Nova/ }).click();
    await expect(sheet.getByRole("tab", { name: /Nova/ })).toHaveAttribute("aria-selected", "true");
    await sheet.getByRole("textbox", { name: "Message Nova" }).fill("hint");
    await sheet.getByRole("button", { name: "Send to Nova" }).click();
    await expect(sheet.getByText("You → Nova")).toBeVisible();
    await sheet.getByRole("tab", { name: /Pip/ }).click();
    await expect(sheet.getByText("No messages with Pip yet", { exact: false })).toBeVisible();
    await sheet.getByRole("button", { name: "Collapse conversation" }).click();
    await expect(sheet.getByRole("tabpanel")).toHaveCount(0);
  });

  test("narrow screens keep every control inside the viewport", async ({ page }) => {
    test.setTimeout(120_000);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 760 });
      await ready(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const name of ["Reset lab", "Expand conversation"])
        await expect(page.getByRole("button", { name, exact: true })).toBeInViewport();
      for (const name of [/Pip/, /Nova/]) await expect(page.getByRole("tab", { name })).toBeInViewport();
      await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeInViewport();
    }
  });
});
