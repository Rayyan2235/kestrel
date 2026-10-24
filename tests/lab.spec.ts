import { expect, test } from "@playwright/test";

test("narrow screens keep recipient controls inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Select Nova" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Select Nova" }),
  ).toBeInViewport();
});

test("keyboard selection and conversation focus remain usable with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const nova = page.getByRole("button", { name: "Select Nova" });
  await nova.focus();
  await nova.press("Enter");
  await expect(nova).toHaveAttribute("aria-pressed", "true");
  await expect(nova).toBeFocused();
  expect(
    await nova.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).not.toBe("none");
  await page.getByRole("button", { name: "Close conversation" }).press("Enter");
  const open = page.getByRole("button", { name: "Open conversation" });
  await expect(open).toBeFocused();
  await open.press("Enter");
  await expect(
    page.getByRole("button", { name: "Close conversation" }),
  ).toBeFocused();
  const slider = page.getByRole("slider", {
    name: "right distance from pivot",
  });
  await slider.focus();
  await page.keyboard.down("End");
  await expect(page.getByTestId("balance-result")).toHaveText("Left side down");
  await page.keyboard.up("End");
  await expect(page.getByTestId("balance-result")).toHaveText(
    "Right side down",
    { timeout: 10000 },
  );
});

test("WebGL failure preserves recipient selection and experiment controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (kind.includes("webgl")) return null;
      return getContext.call(this, kind as "2d", ...args);
    } as typeof getContext;
  });
  await page.goto("/");
  await expect(
    page.getByText(
      /The 3D room could not start|This browser cannot show the 3D room/,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select Nova" }).click();
  const distance = page.getByRole("spinbutton", {
    name: "Right distance in centimeters",
  });
  await distance.fill("40");
  await distance.press("Enter");
  await expect(page.getByTestId("balance-result")).toHaveText("Balanced", {
    timeout: 10000,
  });
  await page.screenshot({
    path: `test-results/fallback-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("exact distance entry rejects invalid values and commits with the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  const distance = page.getByRole("spinbutton", {
    name: "Right distance in centimeters",
  });
  await distance.fill("90");
  await distance.press("Enter");
  await expect(distance).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("balance-result")).toHaveText("Left side down");
  await distance.fill("40");
  await distance.press("Enter");
  await expect(page.getByTestId("balance-result")).toHaveText("Balanced", {
    timeout: 10000,
  });
  await expect(distance).not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Reset lab" }).click();
  await expect(distance).toHaveValue("20");
});

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
  // Each hint adds a user message and a reply; 16 activations exceed the cap.
  // Keyboard activation avoids 31 repeated pointer-stability waits on CI's GPU.
  for (let i = 0; i < 16; i++)
    await page.getByRole("button", { name: "Give me a hint" }).press("Enter");
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
