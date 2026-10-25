import { expect, test, type Page } from "@playwright/test";

// After merging main (Microduck sandbox) with the two-bot demo: every page still
// loads, and nothing on a plain load or a demo chain reaches a paid or external API.

const watch = (page: Page) => {
  const external: string[] = [];
  const api: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    const u = new URL(r.url());
    const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (!local && u.protocol.startsWith("http")) external.push(r.url());
    if (u.pathname.startsWith("/api/")) api.push(`${r.method()} ${u.pathname}`);
  });
  return { external, api, errors };
};

test.use({
  launchOptions: {
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  },
});

test("the landing page loads without paid or external requests", async ({
  page,
}) => {
  const w = watch(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Big questions.Little robots.",
  );
  expect(w.errors).toEqual([]);
  expect(w.external).toEqual([]);
  expect(w.api).toEqual([]);
});

test("the two-bot demo loads, runs a chain, and makes no /api or external request", async ({
  page,
}) => {
  const w = watch(page);
  await page.goto("/?demo=two-bot");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message your robot" })
    .fill("why does it tilt?");
  await page.getByRole("button", { name: "Send command" }).click();
  await expect(page.getByTestId("handback-strip")).toBeVisible({
    timeout: 10000,
  });
  expect(w.errors).toEqual([]);
  expect(w.external).toEqual([]);
  expect(w.api).toEqual([]);
});

test("the console boots real physics without /api or external requests until the learner acts", async ({
  page,
}) => {
  test.setTimeout(120000);
  const w = watch(page);
  await page.goto("/console");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", {
    timeout: 90000,
  });
  expect(w.errors).toEqual([]);
  expect(w.external).toEqual([]);
  expect(w.api.filter((x) => !x.startsWith("GET /api/health"))).toEqual([]);
});

test("the two pages do not leak into each other", async ({ page }) => {
  await page.goto("/?demo=two-bot");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await expect(page.getByTestId("duck-mode")).toHaveCount(0);
  await page.goto("/sandbox.html");
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
});
