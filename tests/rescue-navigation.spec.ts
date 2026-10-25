import { expect, test } from "@playwright/test";
// Real physics walks two whole routes. On CI's software WebGL, sharing the
// runner with another spec, the long route did not reach "Battery died!" in
// 170 s (it passes locally in under 6 min end to end), so each route gets 480 s.
test.setTimeout(1200000);
test("spoken long route drains battery, shows death bubble, resets, then shorter route rescues Pip", async ({
  page,
}, info) => {
  const errors: string[] = [];
  let transcriptions = 0;
  let releaseTranscript: (() => void) | undefined;
  let completedTranscriptions = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      },
    });
    class Recorder {
      static isTypeSupported() {
        return true;
      }
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: any;
      onstop: any;
      onerror: any;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["x".repeat(256)]) });
        this.onstop?.();
      }
    }
    (window as any).MediaRecorder = Recorder;
  });
  await page.route("**/api/voice/transcribe", async (route) => {
    transcriptions++;
    if (transcriptions === 1)
      await new Promise<void>((resolve) => {
        releaseTranscript = resolve;
      });
    await route
      .fulfill({
        json: { text: "go to C then D then E then H" },
      })
      .catch(() => {});
    completedTranscriptions++;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/console");
  const lesson = page.getByRole("button", { name: "Mission Robot rescue" });
  await expect(lesson).toBeEnabled({ timeout: 60000 });
  await lesson.click();
  await expect(
    page.getByRole("button", { name: "Tell Pip your route" }),
  ).toBeEnabled({ timeout: 30000 });
  await expect(page.getByText("Predict the total distance")).toHaveCount(0);
  if (info.project.name === "mobile") {
    const toggle = page.getByRole("button", { name: /Type a route/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Your checkpoint order")).toBeFocused();
    await page
      .getByLabel("Your checkpoint order")
      .fill("go to B then E then H");
    await page.screenshot({
      path: info.outputPath("branching-typed-mobile.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Send route" }).click();
    await expect(page.getByTestId("rescue-feedback")).toContainText(
      "A → B → E → H",
    );
    await page.getByRole("button", { name: "Stop Pip" }).click();
    await page.getByRole("button", { name: "Restart rescue" }).click();
    await expect(
      page.getByRole("button", { name: "Tell Pip your route" }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
    return;
  }

  // A reply belonging to a pre-reset recording must never move the fresh robot.
  await page.getByRole("button", { name: "Tell Pip your route" }).click();
  await page.getByRole("button", { name: "Finish speaking" }).click();
  await expect.poll(() => transcriptions).toBe(1);
  await page.evaluate(() => (window as any).kestrelSim.reset("Rescue retry"));
  await expect(
    page.getByRole("button", { name: "Tell Pip your route" }),
  ).toBeEnabled();
  releaseTranscript!();
  await expect.poll(() => completedTranscriptions).toBe(1);
  expect(
    await page.evaluate(() => (window as any).kestrelSim.tasks.active),
  ).toBeNull();

  await page.screenshot({
    path: info.outputPath("voice-course.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Tell Pip your route" }).click();
  await expect(
    page.getByRole("button", { name: "Finish speaking" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish speaking" }).click();
  await expect(page.getByTestId("rescue-feedback")).toContainText(
    "A → C → D → E → H",
  );
  await expect(
    page.getByRole("region", { name: "3D playground" }).getByRole("status"),
  ).toContainText("Battery died!", { timeout: 480000 });
  // Freeze only physics for the screenshot; otherwise screenshot capture can outlast the death bubble.
  await page.evaluate(() => (window as any).kestrelSim.stop());
  await expect(
    page.getByRole("region", { name: "3D playground" }).getByRole("status"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "3D playground" }).getByRole("status"),
  ).toHaveCSS("opacity", "1");
  await expect
    .poll(() =>
      page
        .getByRole("region", { name: "3D playground" })
        .getByRole("status")
        .evaluate((el) => el.style.transform),
    )
    .not.toBe("");
  await page.screenshot({
    path: info.outputPath("battery-died.png"),
    fullPage: true,
  });
  await page.evaluate(() => (window as any).kestrelSim.start());
  await expect(page.getByTestId("rescue-feedback")).toContainText(
    "back at the start",
    // The respawn is 2.5 s of simulated time, much longer in real time on CI.
    { timeout: 120000 },
  );
  const start = await page.evaluate(
    () => (window as any).kestrelSim.status().pose,
  );
  expect(Math.hypot(start.x + 1.2, start.y)).toBeLessThan(0.1);
  await expect(
    page.getByRole("progressbar", { name: "Pip battery" }),
  ).toHaveAttribute("value", "1");
  await page.getByRole("button", { name: /Type a route/ }).click();
  await page.getByLabel("Your checkpoint order").fill("go left");
  await page.getByRole("button", { name: "Send route" }).click();
  await expect(page.getByTestId("rescue-feedback")).toContainText(
    "Pip starts at A",
  );
  await page.getByLabel("Your checkpoint order").fill("go to B then E then H");
  await page.getByRole("button", { name: "Send route" }).click();
  await expect(page.getByTestId("rescue-feedback")).toContainText("Made it!", {
    timeout: 480000,
  });
  const pose = await page.evaluate(
    () => (window as any).kestrelSim.status().pose,
  );
  expect(Math.hypot(pose.x - 1.2, pose.y - 0.95)).toBeLessThan(0.1);
  await page.screenshot({
    path: info.outputPath("rescue-success.png"),
    fullPage: true,
  });
  expect(transcriptions).toBe(2);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Restart rescue" }).click();
  await expect(
    page.getByRole("button", { name: "Tell Pip your route" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Physics Moments", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Rescue mission" }),
  ).toHaveCount(0);
});
