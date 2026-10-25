import { expect, test, type Page } from "@playwright/test";

// PR C gate: voice addressing on /console (Moments lesson), fixture transcripts via the DEV hook.
// Agent mocked; voice and two-bot guarded: no live calls.

test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.skip(({ isMobile }) => isMobile, "desktop only");

const voice = (page: Page, heard: string) =>
  page.evaluate((h) => {
    const v = (window as unknown as { kestrelVoice: { press(): void; transcript(t: string): void } }).kestrelVoice;
    v.press();
    v.transcript(h);
  }, heard);
const rails = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as { kestrelSim: { status(): { balance?: { rails: Map<string, number> } } } })
      .kestrelSim.status().balance!.rails;
    const cm = (id: string) => Math.round(Math.abs(r.get(id)!) * 1000) / 10;
    return { left: cm("weight-200"), right: cm("weight-100") };
  });

test("voice: 'Hey Nova' answers as Nova; 'Hey Pip' on Nova's rail hands off and Nova makes the one move", async ({ page }) => {
  test.setTimeout(420000);
  const live: string[] = [];
  let step = "load";
  const agentCalls: string[] = [];
  for (const p of ["**/api/voice/**", "**/api/two-bot/respond"]) {
    await page.route(p, (r) => { live.push(r.request().url()); console.log("GUARD " + r.request().url() + " step=" + step); return r.abort(); });
  }
  await page.route("**/api/agent/turn", (route) => {
    const r = route.request().postDataJSON();
    agentCalls.push(JSON.stringify(r).slice(0, 80));
    return route.fulfill({ json: { worldVersion: r.worldVersion, content: [{ type: "text", text: "I see the plank tipping left." }] } });
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["127.0.0.1", "localhost"].includes(u.hostname) && u.protocol.startsWith("http")) live.push(r.url());
  });

  await page.goto("/console");
  await expect(page.getByTestId("duck-mode")).toBeVisible({ timeout: 90000 });
  await page.getByRole("button", { name: "Spoken replies" }).click();
  await expect(page.getByRole("button", { name: "Spoken replies" })).toHaveAttribute("aria-pressed", "false");
  step = "lesson";
  await page.getByRole("navigation", { name: "Lesson" }).getByText("Moments").click();
  await expect.poll(() => page.evaluate(() => {
    const b = (window as unknown as { kestrelSim?: { status(): { balance?: { rails: Map<string, number> } } } }).kestrelSim?.status().balance;
    return !!b && b.rails.size === 2;
  }), { timeout: 120000 }).toBe(true);
  await expect(page.getByTestId("progress-loading")).toHaveCount(0, { timeout: 120000 });

  // 1) "Hey Nova" goes to Nova; Nova's light to-You bubble; chip shows what was heard
  step = "hey-nova";
  await voice(page, "Hey Nova, what do you see?");
  await expect(page.getByTestId("address-chip")).toContainText(/to Nova\s*·\s*heard: nova/i, { timeout: 30000 });
  const bubble = page.getByTestId("bubble").filter({ hasText: "I see the plank tipping left." });
  await expect(bubble).toBeVisible({ timeout: 60000 });
  await expect(bubble).toHaveAttribute("data-to", "you");
  await expect(bubble).toContainText("Nova");
  expect(agentCalls.length).toBeGreaterThan(0);

  // 2) "Hey Pip" asks for Nova's rail: Pip defers, hands off, Nova pushes once, handback
  const before = await rails(page);
  const callsBefore = agentCalls.length;
  step = "hey-pip";
  await voice(page, "Hey Pip, move the right weight to 20 cm");
  await expect(page.getByText("That's Nova's rail. Nova, can you?").first()).toBeVisible({ timeout: 30000 });
  const handoff = page.locator('[data-testid="channel-entry"][data-kind="handoff"]').first();
  await expect(handoff).toBeVisible({ timeout: 30000 });
  await expect(handoff).toContainText(/Pip/);
  await expect(handoff).toContainText(/Nova/);
  await expect.poll(async () => (await rails(page)).right, { timeout: 180000 }).toBeCloseTo(20, 0);
  await expect(page.getByTestId("handback-strip")).toBeVisible({ timeout: 60000 });
  const after = await rails(page);
  expect(Math.abs(after.left - before.left)).toBeLessThan(0.5); // Pip's rail untouched
  expect(Math.abs(after.right - 20)).toBeLessThanOrEqual(1);
  expect(agentCalls.length).toBe(callsBefore); // the wrong-rail path uses no network
  expect(live).toEqual([]);
});
