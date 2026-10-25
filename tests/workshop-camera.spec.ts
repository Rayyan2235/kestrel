import { expect, test } from "@playwright/test";

test("explore camera persists, controls frame and reset, and keyboard stays out of robot input", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/console");
  const canvas = page.locator("canvas[data-camera-mode]");
  await expect(canvas).toHaveAttribute("data-camera-mode", "follow", {
    timeout: 60000,
  });
  await page.waitForTimeout(1200);
  const zoom = Number(await canvas.getAttribute("data-camera-zoom"));
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-camera-mode", "explore");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-camera-zoom")))
    .toBeGreaterThan(zoom * 1.1);
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * 0.65,
    y = box.y + box.height * 0.55;
  const before = await canvas.getAttribute("data-camera-target");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 35, y + 20, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(() => canvas.getAttribute("data-camera-target"))
    .not.toBe(before);
  await page.waitForTimeout(1200);
  const panned = await canvas.getAttribute("data-camera-target");
  await page.waitForTimeout(500);
  const settled = (await canvas.getAttribute("data-camera-target"))!
    .split(",")
    .map(Number);
  panned!
    .split(",")
    .map(Number)
    .forEach((v, i) => expect(Math.abs(settled[i]! - v)).toBeLessThan(0.005));
  await page
    .getByRole("button", { name: "Frame experiment", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-camera-mode", "experiment");
  await page.getByRole("button", { name: "Zoom in", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(canvas).toHaveAttribute("data-camera-mode", "explore");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-camera-mode", "follow");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("both lessons keep the camera controls and workshop available", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/console");
  await expect(page.locator("canvas[data-camera-mode]")).toHaveAttribute(
    "data-camera-mode",
    "follow",
    { timeout: 60000 },
  );
  await page.screenshot({
    path: testInfo.outputPath("workshop-maths.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Physics Moments/i }).click();
  await expect(page.locator("canvas[data-camera-mode]")).toHaveAttribute(
    "data-camera-mode",
    "follow",
    { timeout: 60000 },
  );
  await page
    .getByRole("button", { name: "Frame experiment", exact: true })
    .click();
  await expect(page.locator("canvas[data-camera-mode]")).toHaveAttribute(
    "data-camera-mode",
    "experiment",
  );
  await page.screenshot({
    path: testInfo.outputPath("workshop-moments.png"),
    fullPage: true,
  });
});

test("Space activates camera controls without starting voice", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/console");
  const canvas = page.locator("canvas[data-camera-mode]");
  await expect(canvas).toHaveAttribute("data-camera-mode", "follow", {
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "Frame experiment", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await expect(canvas).toHaveAttribute("data-camera-mode", "experiment");
});

test("pinch zoom works and cancellation leaves the camera usable", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch gesture coverage");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/console");
  const canvas = page.locator("canvas[data-camera-mode]");
  await expect(canvas).toHaveAttribute("data-camera-mode", "follow", {
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "Frame experiment", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-camera-mode", "experiment");
  const zoom = Number(await canvas.getAttribute("data-camera-zoom"));
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height * 0.55;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: x - 25, y, id: 0 },
      { x: x + 25, y, id: 1 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: x - 55, y, id: 0 },
      { x: x + 55, y, id: 1 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(canvas).toHaveAttribute("data-camera-mode", "explore");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-camera-zoom")))
    .toBeGreaterThan(zoom * 1.2);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-camera-mode", "follow");
});
