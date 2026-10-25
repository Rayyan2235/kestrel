import { expect, test } from "@playwright/test";

test("changing reduced motion cancels the running entrance", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const count = await page.evaluate(() => {
    const animations = document.getAnimations();
    animations.forEach((animation) => animation.pause());
    return animations.length;
  });
  expect(count).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
});

test("landing hero is readable before loading the lab and entry/back navigation works", async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Real robots.Real physics.");
  await expect(page.getByText(/Tell Pip and Nova what to do/)).toBeVisible();
  expect(
    requests.some((url) =>
      /\/src\/(App\.tsx|world\/|state\/|simulation\/)|mujoco|\.onnx/.test(url),
    ),
  ).toBe(false);
  expect(await page.locator("canvas").count()).toBe(0);
  await page.getByRole("link", { name: "Open the playground" }).first().click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByLabel("Task for your duck")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Real robots.Real physics.");
  expect(errors).toEqual([]);
});

test("objective cards open the console and phones have no sideways page scroll", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const title of ["Balance the beam", "Build the right triangle", "Pip vs Nova"]) {
    await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveAttribute("href", "/console");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
