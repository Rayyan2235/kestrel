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

test("welcome is readable before loading the lab and entry/back navigation works", async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Big questions.Little robots.",
  );
  await expect(page.getByText(/A science & maths lab for ages/)).toBeVisible();
  await expect(page.getByAltText(/Two purple robot companions/)).toBeVisible();
  expect(
    requests.some((url) =>
      /\/src\/(App\.tsx|world\/|state\/|simulation\/)|mujoco|\.onnx/.test(url),
    ),
  ).toBe(false);
  expect(await page.locator("canvas").count()).toBe(0);
  await page.getByRole("link", { name: "Open console" }).first().click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByLabel("Task for your duck")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Big questions.Little robots.",
  );
  expect(errors).toEqual([]);
});

test("balance example responds to keyboard input and stays separate from the lab", async ({
  page,
}) => {
  await page.goto("/");
  const slider = page.getByRole("slider", { name: "Move the lighter weight" });
  await slider.focus();
  await slider.press("End");
  await expect(page.getByTestId("welcome-result")).toHaveText(
    "Distance makes the difference.",
  );
  await page.getByRole("button", { name: "Try 40 cm" }).click();
  await expect(slider).toHaveValue("40");
  await expect(page.getByTestId("welcome-result")).toHaveText(
    "You found the balance.",
  );
  await page.getByRole("link", { name: "Open console" }).first().click();
  await expect(page.getByLabel("Task for your duck")).toBeVisible();
  await expect(page.getByText("You found the balance.")).toHaveCount(0);
});

test("companion selection and accessible FAQ work with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const nova = page.getByRole("button", { name: /Nova.*check/ });
  await nova.focus();
  await nova.press("Enter");
  await expect(nova).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Nova checks the details.")).toBeVisible();
  const faq = page.locator("summary", {
    hasText: "Are the robots using live AI?",
  });
  await faq.focus();
  await faq.press("Enter");
  await expect(page.getByText(/With the server configured/)).toBeVisible();
  expect(
    await faq.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).not.toBe("none");
  await page.locator("summary", { hasText: "Who is Kestrel for?" }).click();
  await expect(page.getByText(/With the server configured/)).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
