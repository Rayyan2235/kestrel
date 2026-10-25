import { expect, test } from "@playwright/test";

// Balance-beam XP within the objective's tolerance, and the level it earns. Desktop only.

test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.skip(({ isMobile }) => isMobile, "desktop only");

const SET_BALANCE = { kind: "set_balance", left_cm: 10, right_cm: 20 };

test("a beam balanced within tolerance fills the XP bar and levels up", async ({ page }) => {
  test.setTimeout(300000);
  let turns = 0;
  await page.route("**/api/**", async (route) => {
    if (!route.request().url().includes("/api/agent/turn")) return route.abort();
    const r = route.request().postDataJSON();
    turns++;
    await route.fulfill({
      json: {
        worldVersion: r.worldVersion,
        content:
          turns === 1
            ? [{ type: "text", text: "200 g at 10 cm against 100 g at 20 cm." }, { type: "tool_use", id: "b1", name: "duck_task", input: SET_BALANCE }]
            : [{ type: "text", text: "Measured." }],
      },
    });
  });
  await page.goto("/console");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 90000 });
  await page.getByRole("button", { name: "Robot reply sound" }).click();
  await expect(page.getByTestId("level")).toContainText("Level 1");
  await expect(page.getByTestId("level")).toContainText("0 / 100 XP");

  await page.getByRole("button", { name: /Balance the beam/ }).click();
  await expect(page.getByTestId("balance")).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("xp-bar")).toHaveAttribute("aria-valuenow", "0");
  await page.getByLabel("Task for your duck").fill("Balance the beam");
  await page.getByRole("button", { name: "Send task" }).click();

  await expect(page.getByTestId("xp-bar")).toHaveAttribute("aria-valuenow", "100", { timeout: 240000 });
  // A real push lands within a millimetre or two; whatever it measured, it is within tolerance.
  const tilt = await page.evaluate(() => {
    const b = (window as any).kestrelSim.status().balance;
    return Math.abs((b.angle * 180) / Math.PI);
  });
  expect(tilt).toBeLessThanOrEqual(1.5);
  await expect(page.getByTestId("levelup-toast")).toContainText("Level 2!");
  await expect(page.getByTestId("level")).toContainText("Level 2");
  await expect(page.getByTestId("level")).toContainText("100 / 250 XP");
  await expect(page.getByTestId("level-bar")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByTestId("levelup-toast")).toHaveCount(0, { timeout: 8000 });
});

test("a beam just outside tolerance earns nothing and says how far off the 200 g is", async ({ page }) => {
  test.setTimeout(240000);
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/console");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 90000 });
  await page.getByRole("button", { name: /Balance the beam/ }).click();
  await expect(page.getByTestId("balance")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(2000);
  // Fast-stepped real physics: 200 g at 10.4 cm against 100 g at 20 cm tilts about 2.4°.
  await page.evaluate(async () => {
    const sim = (window as any).kestrelSim;
    sim.stop();
    sim.reset();
    for (let i = 0; i < 10; i++) await sim.controlStep();
    sim.rails.get("weight-200").brake = -0.104;
    sim.rails.get("weight-100").brake = 0.2;
    for (let i = 0; i < 25; i++) await sim.controlStep();
    sim.runTask({ kind: "release_plank" });
    for (let i = 0; i < 250; i++) await sim.controlStep();
    sim.start();
  });
  await expect(page.getByTestId("balance")).toContainText("Left side down");
  await expect(page.getByTestId("balance")).not.toContainText("balanced");
  await expect(page.getByTestId("balance-hint")).toContainText(/200 g is 0\.\d cm too far out/);
  await page.waitForTimeout(2000);
  await expect(page.getByTestId("xp-bar")).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByTestId("level")).toContainText("Level 1");
  await expect(page.getByTestId("levelup-toast")).toHaveCount(0);
});
