// Post-deploy smoke: a fresh learner wins Balance the beam on the live site and the
// server's XP ledger levels them up. Run after deploy/deploy.sh:
//
//   KESTREL_SMOKE_URL=https://<your-host> KESTREL_SMOKE_USER=... KESTREL_SMOKE_PASS=... pnpm smoke:live
//
// The login comes from the environment and is never printed. Paid routes (Claude,
// voice) are aborted, so a run costs nothing. Needs a Playwright browser:
// `pnpm exec playwright install chromium`, or KESTREL_SMOKE_CHANNEL=chrome.
import { chromium, expect } from "@playwright/test";

const url = process.env.KESTREL_SMOKE_URL;
const username = process.env.KESTREL_SMOKE_USER;
const password = process.env.KESTREL_SMOKE_PASS;
const PAID = /\/api\/(agent|voice)\b/;

function fail(message) {
  console.error(`smoke: FAIL: ${message}`);
  process.exit(1);
}
if (!url) fail("set KESTREL_SMOKE_URL.");
const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
if (!local && !(username && password)) fail("set KESTREL_SMOKE_USER and KESTREL_SMOKE_PASS for a remote site.");

const step = (text) => console.log(`smoke: ${text}`);
const browser = await chromium.launch({
  channel: process.env.KESTREL_SMOKE_CHANNEL || undefined,
  // Software WebGL, as in CI, so a headless server can run the physics.
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  // A new context is a new browser profile: a new anonymous learner at 0 XP.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ...(username && password ? { httpCredentials: { username, password } } : {}),
  });
  const paid = [];
  await context.route(PAID, (route) => {
    paid.push(new URL(route.request().url()).pathname);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  step(`open ${new URL("/console", url).origin}/console`);
  const response = await page.goto(new URL("/console", url).href);
  if (!response || response.status() === 401) throw new Error("the site refused the login (401).");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 120000 });
  await page.getByRole("button", { name: "Robot reply sound" }).click();
  await expect(page.getByTestId("level")).toContainText("Level 1");

  step("start Balance the beam; set 200 g at 10 cm, 100 g at 20 cm; predict level; run");
  await page.getByRole("button", { name: /Balance the beam/ }).click();
  await expect(page.getByTestId("balance")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);
  for (let i = 0; i < 10; i++) await page.getByRole("button", { name: "Move the 200 g weight in" }).click();
  await expect(page.getByLabel("200 g target")).toHaveText("10 cm");
  await expect(page.getByLabel("100 g target")).toHaveText("20 cm");
  await page.getByRole("radio", { name: "Stays level" }).click();
  await page.getByRole("button", { name: "Run it with both robots" }).click();

  step("wait for the win and the server's level-up");
  await expect(page.getByTestId("xp-bar")).toHaveAttribute("aria-valuenow", "100", { timeout: 240000 });
  await expect(page.getByTestId("levelup-toast")).toContainText("Level 2!", { timeout: 30000 });
  const board = page.getByTestId("level");
  await expect(board).toContainText("Level 2");
  // "offline" means the browser counted locally: the server ledger did not answer.
  if ((await board.innerText()).includes("offline")) throw new Error("Level 2 came from the offline fallback, not the server ledger.");
  step(`board: ${(await board.innerText()).replace(/\s+/g, " ")}`);
  if (paid.length) step(`aborted paid routes: ${[...new Set(paid)].join(", ")}`);
  if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);
  step("PASS: server-backed Level 2.");
} catch (error) {
  console.error(`smoke: FAIL: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
