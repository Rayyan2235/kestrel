import { expect, test, type Page } from "@playwright/test";

// PR #11 gate: Workshop picks show on the real 3D robots at /console (render-only). Desktop only.

test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.skip(({ isMobile }) => isMobile, "desktop only");

type Looks = { pip: { shell?: string; nodes: string[] }; nova: { shell?: string; nodes: string[] } };
const looks = (page: Page) => page.evaluate(() => (window as unknown as { kestrelLooks(): Looks }).kestrelLooks());
const simState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { kestrelSim: { status(): { mode: string; balance?: { rails: Map<string, number> } } } }).kestrelSim.status();
    const rails = s.balance ? [...s.balance.rails.entries()].map(([k, v]) => [k, Math.round(v * 1000)]) : [];
    return { mode: s.mode, rails };
  });

/** Equip by clicking the tile if allowed, else take it as a reward if offered. */
const equip = async (page: Page, id: string) => {
  const tile = page.getByTestId(`item-${id}`);
  if ((await tile.getAttribute("aria-disabled")) !== "true") return tile.click();
  const offer = page.getByTestId(`reward-pick-${id}`);
  expect(await offer.count(), `${id} is neither unlocked nor offered`).toBeGreaterThan(0);
  await offer.click();
};

test("equipping a shell and 3D accessory on Pip changes only Pip's 3D robot; the sim is untouched", async ({ page }) => {
  test.setTimeout(300000);
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
  await page.getByRole("button", { name: "Spoken replies" }).click();
  await page.getByRole("navigation", { name: "Lesson" }).getByText("Moments").click();
  await expect(page.getByTestId("workshop-open")).toBeVisible({ timeout: 120000 });
  await expect(page.getByTestId("progress-loading")).toHaveCount(0, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const novaBefore = (await looks(page)).nova;
  const simBefore = await simState(page);

  await page.getByTestId("workshop-open").click();
  const dialog = page.getByTestId("workshop-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("group", { name: "Robot" }).getByRole("button", { name: "Pip" }).click();
  await page.getByTestId("workshop-tab-shell").click();
  await equip(page, "shell-slate");
  await page.getByTestId("workshop-tab-gear").click();
  // antenna if the demo profile can reach it, else the first wearable 3D accessory it offers
  let gear = "";
  for (const id of ["antenna", "partyhat", "backpack"]) {
    const open = (await page.getByTestId("item-" + id).getAttribute("aria-disabled")) !== "true";
    if (open || (await page.getByTestId("reward-pick-" + id).count()) > 0) { gear = id; break; }
  }
  console.log("OFFERS " + (await page.locator("[data-testid^=reward-pick-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).join(","));
  expect(gear, "no 3D accessory is unlocked or offered to the demo profile").not.toBe("");
  await equip(page, gear);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await expect.poll(async () => (await looks(page)).pip, { timeout: 15000 }).toEqual({ shell: "#475569", nodes: [gear] });
  const after = await looks(page);
  expect(after.nova.nodes).toEqual([]);
  expect(after.nova).toEqual(novaBefore);
  expect(await simState(page)).toEqual(simBefore);

  await page.screenshot({ path: "g7-shots/B-console-3d-pip-slate-antenna.png" });
  expect(live).toEqual([]);
});
