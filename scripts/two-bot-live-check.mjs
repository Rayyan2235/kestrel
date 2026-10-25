// Paid check (a few cents): live Claude in the two-bot demo on the real sim.
// Needs `pnpm dev` with Bedrock credentials in the server .env. Pip is asked
// to ask Nova to move the right weight; prints the transcript and the push.
import { chromium } from "@playwright/test";
const URL = process.env.URL ?? "http://127.0.0.1:5180/?demo=two-bot&sim=mujoco&provider=live";
const ASK = process.env.ASK ?? "Please ask Nova to move the right weight to 25 cm.";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => m.type() === "warning" && console.log("[warn]", m.text()));
await page.goto(URL);
await page.getByTestId("demo-banner").filter({ hasText: "live" }).waitFor({ timeout: 150000 });
const t0 = Date.now();
await page.getByRole("textbox", { name: "Message your robot" }).fill(ASK);
await page.getByRole("button", { name: "Send command" }).click();
await page.locator('[data-testid="thread-entry"][data-kind="handback"]').waitFor({ timeout: 150000 });
await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="status-"]')].every((e) => e.getAttribute("data-state") === "idle"), null, { timeout: 30000 });
const seconds = ((Date.now() - t0) / 1000).toFixed(1);
const entries = await page.locator('[data-testid="thread-entry"], [data-testid="channel-entry"]').evaluateAll((els) =>
  els.map((e) => e.innerText.replace(/\s+/g, " ").trim()),
);
const measured = await page.evaluate(() => {
  const sim = window.kestrelSim;
  const rails = sim.status().balance.rails;
  const contacts = sim.contacts();
  return {
    leftCm: Math.round(Math.abs(rails.get("weight-200")) * 1000) / 10,
    rightCm: Math.round(Math.abs(rails.get("weight-100")) * 1000) / 10,
    novaPaddle: contacts["nova↔weight-100-paddle"] ?? null,
  };
});
console.log(JSON.stringify({ ask: ASK, seconds, entries, readout: await page.getByTestId("balance-result").innerText(), measured }, null, 1));
await page.screenshot({ path: "test-results/two-bot-live-check.png" });
await browser.close();
