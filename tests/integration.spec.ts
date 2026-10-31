import { expect, test, type Page } from "@playwright/test";

// Every page loads, and nothing on a plain load reaches a paid or external API.

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
    "Real robots.Real physics.",
  );
  expect(w.errors).toEqual([]);
  expect(w.external).toEqual([]);
  expect(w.api).toEqual([]);
});

test("the console boots real physics without paid /api or external requests until the learner acts", async ({
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
  // Allowed on load: the health check, and reading this browser's saved
  // progress (a free read by an anonymous id; the owner chose to keep it).
  expect(
    w.api.filter((x) => !x.startsWith("GET /api/health") && !x.startsWith("GET /api/progress/")),
  ).toEqual([]);
});
