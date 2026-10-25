import { expect, test, type Page } from "@playwright/test";

// R4: conversation features on the real console at /console (desktop only).
// Agent, voice and two-bot endpoints are route-guarded: no live calls.

test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.skip(({ isMobile }) => isMobile, "R4 is desktop only");
test.describe.configure({ mode: "serial" });
test.setTimeout(240000);

const live: string[] = [];
test.beforeEach(async ({ page }) => {
  live.length = 0;
  for (const p of ["**/api/voice/**", "**/api/two-bot/respond"]) {
    await page.route(p, (r) => { live.push(r.request().url()); return r.abort(); });
  }
  await page.route("**/api/agent/turn", (route) => {
    const r = route.request().postDataJSON();
    return route.fulfill({ json: { worldVersion: r.worldVersion, content: [{ type: "text", text: "Mock reply from the duck." }] } });
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["127.0.0.1", "localhost"].includes(u.hostname) && u.protocol.startsWith("http")) live.push(r.url());
  });
});
test.afterEach(() => expect(live).toEqual([]));

const open = async (page: Page) => {
  await page.goto("/console");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 90000 });
  await page.getByRole("button", { name: "Spoken replies" }).click(); // voice off: no /api/voice
};
const sendTo = async (page: Page, bot: "Pip" | "Nova", text: string) => {
  await page.getByRole("button", { name: `Select ${bot}` }).click();
  await page.getByLabel("Task for your duck").fill(text);
  await page.getByRole("button", { name: "Send task" }).click();
};

test("(a) Pip and Nova threads each show only their own messages", async ({ page }) => {
  await open(page);
  await sendTo(page, "Nova", "hello to nova only");
  await expect(page.getByTestId("rail")).toContainText("You and Nova");
  await expect(page.getByTestId("you-thread")).toContainText("hello to nova only");
  await sendTo(page, "Pip", "hello to pip only");
  await expect(page.getByTestId("rail")).toContainText("You and Pip");
  await expect(page.getByTestId("you-thread")).toContainText("hello to pip only");
  await expect(page.getByTestId("you-thread")).not.toContainText("hello to nova only");
});

test("(b) a to-you bubble is light with 'to You'; a handoff shows a dark pill in the channel", async ({ page }) => {
  await open(page);
  await sendTo(page, "Pip", "hi there");
  const bubble = page.getByTestId("bubble").first();
  await expect(bubble).toBeVisible({ timeout: 60000 });
  await expect(bubble).toHaveAttribute("data-to", "you");
  await expect(bubble).toContainText("to You");
  await page.getByTestId("ask-peer").click();
  await expect(page.getByTestId("channel-entry").first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("bot-channel")).toBeVisible();
  const bg = await page.getByTestId("bot-channel").evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = (bg.match(/\d+/g) ?? ["255", "255", "255"]).map(Number);
  expect((r! + g! + b!) / 3).toBeLessThan(110); // dark
});

test("(c) one bubble at a time; the landing page reaches this console", async ({ page }) => {
  await page.goto("/");
  await page.locator("a[href=\"/console\"]").first().click();
  await expect(page).toHaveURL(/console/);
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 90000 });
  await page.getByRole("button", { name: "Spoken replies" }).click();
  await expect(page.getByRole("button", { name: "Select Pip" })).toBeVisible();
  await sendTo(page, "Pip", "talk to me");
  await page.getByTestId("ask-peer").click();
  let max = 0;
  for (let i = 0; i < 40; i++) {
    max = Math.max(max, await page.getByTestId("bubble").count());
    await page.waitForTimeout(250);
  }
  expect(max).toBeLessThanOrEqual(1);
});

test("mobile screenshot of the real console", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await open(page);
  await sendTo(page, "Pip", "hi there");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "g7-shots/R4-console-390x664.png" });
});
