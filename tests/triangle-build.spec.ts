import { expect, test } from "@playwright/test";

// "Build it together" on the real MuJoCo sim, fast-stepped: the robots push
// all three squares onto the triangle's sides without falling. Desktop only.

test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.skip(({ isMobile }) => isMobile, "desktop only");

test("the robots build all three squares on the triangle", async ({ page }) => {
  test.setTimeout(600000);
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/console");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 240000 });
  const refusal = await page.evaluate(async () => {
    const sim = (window as any).kestrelSim;
    sim.stop();
    sim.reset();
    for (let i = 0; i < 50; i++) await sim.controlStep();
    const w = window as any;
    w.__done = null;
    const prev = sim.listener;
    sim.listener = (e: any) => {
      if (e.type === "task-done" && e.duck === "lab") w.__done = e;
      prev?.(e);
    };
    return sim.runTask({ kind: "build_squares" });
  });
  expect(refusal).toBeNull();
  // In chunks, so no single evaluate runs for minutes. 180 s of sim time at most.
  for (let chunk = 0; chunk < 18; chunk++) {
    const done = await page.evaluate(async () => {
      const w = window as any;
      for (let i = 0; i < 500 && !w.__done; i++) await w.kestrelSim.controlStep();
      return !!w.__done;
    });
    if (done) break;
  }
  const done = await page.evaluate(() => (window as any).__done);
  expect(done?.summary).toContain("All three squares are on the triangle");
  expect(done?.ok).toBe(true);
});
