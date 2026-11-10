import { expect, test } from "@playwright/test";

// P8's done-check for the page: with a small cohort it says "demo data".
// The API is fulfilled here; insights.test.ts covers the real route and token.

const TOKEN = "o".repeat(40);
const small = {
  learners: 3,
  demo: true,
  updatedAt: "2026-11-10T07:00:05.000Z",
  concepts: [{ concept: "moments", learners: 3, meanMastery: 0.62, evidence: 11 }],
  prompts: [
    { challengeId: "moments", promptId: "m-10-30", attempts: 6, successes: 1, rate: 0.25, medianTries: 3 },
    { challengeId: "moments", promptId: "m-10-20", attempts: 4, successes: 4, rate: 5 / 6, medianTries: 1 },
  ],
};

test("asks for the owner token, then shows a small cohort as demo data, hardest prompt first", async ({ page }) => {
  const auth: (string | undefined)[] = [];
  await page.route("**/api/owner/insights", async (route) => {
    const sent = route.request().headers()["authorization"];
    auth.push(sent);
    if (sent !== `Bearer ${TOKEN}`) return route.fulfill({ status: 401, json: { message: "The owner token is required." } });
    return route.fulfill({ json: small });
  });
  await page.route("**/api/health", (route) => route.abort());
  await page.goto("/owner/insights");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kestrel insights");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

  const token = page.getByLabel("Owner token");
  await token.fill("wrong");
  await page.getByRole("button", { name: "Show insights" }).click();
  await expect(page.getByRole("alert")).toHaveText("That token is not right.");

  await token.fill(TOKEN);
  await page.getByRole("button", { name: "Show insights" }).click();
  await expect(page.getByRole("status")).toContainText("Demo data.");
  await expect(page.getByRole("status")).toContainText("Only 3 learners so far (fewer than 20)");
  const rows = page.getByRole("table").nth(1).getByRole("row");
  await expect(rows.nth(1)).toContainText("m-10-30");
  await expect(rows.nth(2)).toContainText("m-10-20");
  await expect(page.getByRole("table").first()).toContainText("62%");
  expect(auth).toEqual(["Bearer wrong", `Bearer ${TOKEN}`]);
  // The token is never stored.
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toContain(TOKEN);
});

test("a full cohort is not labelled demo data", async ({ page }) => {
  await page.route("**/api/owner/insights", (route) => route.fulfill({ json: { ...small, learners: 40, demo: false } }));
  await page.goto("/owner/insights");
  await page.getByLabel("Owner token").fill(TOKEN);
  await page.getByRole("button", { name: "Show insights" }).click();
  await expect(page.getByText("40 learners with verified attempts.")).toBeVisible();
  await expect(page.getByText("Demo data.")).toHaveCount(0);
});
