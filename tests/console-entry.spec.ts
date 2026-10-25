import { expect, test } from "@playwright/test";

test("landing opens the real console and console returns home", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Open console" }).first(),
  ).toBeVisible();
  expect(requests.some((url) => /mujoco|\.onnx/.test(url))).toBe(false);
  await page.getByRole("link", { name: "Open console" }).first().click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByLabel("Task for your duck")).toBeVisible();
  await expect(page.getByText("Scripted preview", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Kestrel home" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Real robots.Real physics.",
  );
});

test("old lab URL opens the real console", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.getByLabel("Task for your duck")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask the crew" })).toHaveCount(
    0,
  );
});
