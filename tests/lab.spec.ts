import { expect, test } from "@playwright/test";

test("a learner can address a bot, balance the beam, watch an exchange and reset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Kestrel", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select Nova" }).click();
  await page
    .getByRole("textbox", { name: "Message your robot" })
    .fill("right weight to 40 cm");
  await page.getByRole("button", { name: "Send command" }).click();
  await expect(page.getByTestId("balance-result")).toHaveText("Balanced");
  await expect(page.getByRole("log")).toContainText(
    "right weight is now 40 cm",
  );
  await page.getByRole("button", { name: "Ask the crew" }).click();
  await expect(page.getByRole("log")).toContainText("They are balanced", {
    timeout: 5000,
  });
  await page.getByRole("button", { name: "Reset lab" }).click();
  await expect(page.getByTestId("balance-result")).toHaveText("Left side down");
  await expect(page.getByRole("log")).toContainText("Start with a question");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/kestrel-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("stop interrupts a pending exchange and unsupported commands leave the world unchanged", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ask the crew" }).click();
  await page.getByRole("button", { name: "Stop exchange" }).click();
  const stoppedLog = await page.getByRole("log").textContent();
  await page.waitForTimeout(2000);
  await expect(page.getByRole("log")).toHaveText(stoppedLog ?? "");
  await page
    .getByRole("textbox", { name: "Message your robot" })
    .fill("fly to Mars");
  await page.getByRole("button", { name: "Send command" }).click();
  await expect(page.getByRole("log")).toContainText(
    "scripted preview understands",
  );
  await expect(page.getByTestId("balance-result")).toHaveText("Left side down");
});

test("conversation follows new replies after its cap and when reopened", async ({
  page,
}) => {
  await page.goto("/");
  const chat = page.getByRole("log");
  for (let i = 0; i < 31; i++)
    await page.getByRole("button", { name: "Give me a hint" }).click();
  await chat.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect
    .poll(() =>
      chat.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop),
    )
    .toBeLessThan(3);
  await page.getByRole("button", { name: "Close conversation" }).click();
  await page.getByRole("button", { name: "Open conversation" }).click();
  await expect
    .poll(() =>
      chat.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop),
    )
    .toBeLessThan(3);
});
