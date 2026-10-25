import { expect, test } from "@playwright/test";
import type { DuckSim } from "../apps/web/src/simulation/duckSim";

test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.setTimeout(120000);
test("natural text explains, moves the real duck, and returns measured results", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const requests: any[] = [];
  await page.route("**/api/agent/turn", async route => {
    const r = route.request().postDataJSON(); requests.push(r);
    await route.fulfill({ json: { worldVersion: r.worldVersion, content: requests.length === 1 ? [
      { type: "text", text: "I'll walk forward to demonstrate." },
      { type: "tool_use", id: "move1", name: "duck_task", input: { kind: "move", meters: 0.2 } },
    ] : [{ type: "text", text: "That distance came from the simulator." }] } });
  });
  await page.goto("/sandbox.html");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 90000 });
  await page.getByRole("button", { name: "Spoken replies" }).click();
  await page.getByLabel("Task for your duck").fill("Can you demonstrate moving a little?");
  await page.getByRole("button", { name: "Send task" }).click();
  await expect(page.getByRole("log")).toContainText("I'll walk forward");
  await expect(page.getByRole("log")).toContainText("That distance came from the simulator.", { timeout: 40000 });
  expect(requests).toHaveLength(2);
  const result = requests[1].messages.at(-1).content[0];
  expect(result.type).toBe("tool_result");
  expect(result.is_error).toBe(false);
  expect(JSON.parse(result.content).summary).toMatch(/Moved \d+ cm/);
  expect(errors).toEqual([]);
});

test("Stop discards a delayed Claude action and reset stays idle", async ({ page }) => {
  let release!: () => void;
  let started = false;
  await page.route("**/api/agent/turn", async route => {
    const r = route.request().postDataJSON();
    started = true;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { worldVersion: r.worldVersion, content: [{ type: "tool_use", id: "late", name: "duck_task", input: { kind: "move", meters: 1 } }] } }).catch(() => {});
  });
  await page.goto("/sandbox.html");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 90000 });
  await page.getByRole("button", { name: "Spoken replies" }).click();
  await page.getByLabel("Task for your duck").fill("Move please");
  await page.getByRole("button", { name: "Send task" }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Reset the lab" }).click();
  release();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("agent-phase")).toHaveCount(0);
  await expect(page.getByRole("log")).toContainText("Lab reset.");
});

test("Moments: Claude balances the plank with a real push and reads the measured tilt", async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const requests: any[] = [];
  const turns = [
    [
      { type: "text", text: "200 g at 10 cm balances 100 g at 20 cm, so I'll move the 200 g weight in." },
      { type: "tool_use", id: "place1", name: "duck_task", input: { kind: "place_weight", target: "weight-200", cm: 10 } },
    ],
    [{ type: "text", text: "Now I'll let the plank go." }, { type: "tool_use", id: "release1", name: "duck_task", input: { kind: "release_plank" } }],
    [{ type: "text", text: "The simulator measured it level." }],
  ];
  await page.route("**/api/agent/turn", async route => {
    const r = route.request().postDataJSON(); requests.push(r);
    await route.fulfill({ json: { worldVersion: r.worldVersion, content: turns[requests.length - 1] } });
  });
  await page.goto("/sandbox.html");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 90000 });
  await page.getByRole("button", { name: "Spoken replies" }).click();
  await page.getByRole("button", { name: /Moments/ }).click();
  await expect(page.getByTestId("balance")).toContainText("Plank locked");
  await page.getByLabel("Task for your duck").fill("Can you balance the plank?");
  await page.getByRole("button", { name: "Send task" }).click();
  await expect(page.getByRole("log")).toContainText("The simulator measured it level.", { timeout: 200000 });
  expect(requests).toHaveLength(3);
  expect(requests[0].world.balance).toMatchObject({
    plank: "locked",
    weights: [{ id: "weight-200", side: "left", cm: 20 }, { id: "weight-100", side: "right", cm: 20 }],
  });
  expect(requests[0].world.props.some((p: { id: string }) => p.id.endsWith("paddle"))).toBe(false);
  const placed = JSON.parse(requests[1].messages.at(-1).content[0].content);
  expect(placed.ok).toBe(true);
  expect(placed.summary).toMatch(/^Moved the 200 g weight from 20 cm to (9\.\d|10(\.\d)?) cm \(asked for 10 cm\)\.$/);
  const released = JSON.parse(requests[2].messages.at(-1).content[0].content);
  expect(released.summary).toMatch(/^Released the plank\. It stayed level \(0\.\d°\)\.$/);
  expect(released.world.balance).toMatchObject({ plank: "released", lowSide: "level" });
  await expect(page.getByTestId("balance")).toContainText("Level");
  expect(errors).toEqual([]);
});

test("Moments: the learner predicts, both robots push their own weights, and the result is measured", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "One real-physics run is enough; the phone layout is covered above.");
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/**", route => route.abort());
  await page.goto("/sandbox.html");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 90000 });
  await page.getByRole("button", { name: /Moments/ }).click();
  await expect(page.getByTestId("balance")).toContainText("Plank locked");
  // 200 g at 15 cm against 100 g at 30 cm: equal moments.
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Move the 200 g weight in" }).click();
  for (let i = 0; i < 10; i++) await page.getByRole("button", { name: "Move the 100 g weight out" }).click();
  await expect(page.getByLabel("200 g target")).toHaveText("15 cm");
  await expect(page.getByLabel("100 g target")).toHaveText("30 cm");
  await page.getByRole("radio", { name: "Stays level" }).click();
  await page.getByRole("button", { name: "Run it with both robots" }).click();
  const result = page.getByTestId("experiment-result");
  await expect(result).toBeVisible({ timeout: 200000 });
  await expect(result).toContainText("Moments say: Stays level");
  // Physical pushes stop near the marks, not exactly on them. CI measured
  // 15.1/29.9 cm and 0.7° left: within the moments tolerance, but outside the
  // tilt threshold. Check a successful experiment and truthful feedback,
  // rather than requiring the measured result to agree with the prediction.
  const experiment = await page.evaluate(() =>
    (window as unknown as { kestrelSim: DuckSim }).kestrelSim.status().experiment,
  );
  expect(experiment?.phase).toBe("DONE");
  expect(experiment?.result).not.toBeNull();
  const measured = experiment!.result!;
  expect(measured.ok, measured.summary).toBe(true); // placement succeeded and no contact spoiled the reading
  expect(Math.abs(measured.left.cm - 15)).toBeLessThanOrEqual(0.2);
  expect(Math.abs(measured.right.cm - 30)).toBeLessThanOrEqual(0.2);
  expect(measured.predicted).toBe("level");
  expect(measured.measured.tiltDeg).toBeGreaterThanOrEqual(0);
  expect(measured.measured.tiltDeg).toBeLessThan(2); // near-balanced, not tipped to the 5.7° stop
  const { lowSide, tiltDeg } = measured.measured;
  if (lowSide === "level") {
    await expect(result).toContainText(`Measured: level (${tiltDeg}°)`);
    await expect(result).toContainText("you were right");
  } else {
    // Near balance the tilt direction is not set by a 0.1% moment difference:
    // CI saw 29.44 vs 29.47 N·cm settle 1° left. Only the reporting is checked.
    await expect(result).toContainText(`Measured: ${lowSide} side down ${tiltDeg}°`);
    await expect(result).toContainText("not this time");
    await expect(result).not.toContainText("you were right");
  }
  // Both weights really moved, and both robots touched only their own paddles.
  const contacts = await page.evaluate(() => Object.keys((window as any).kestrelSim.contacts()));
  expect(contacts).toEqual(expect.arrayContaining(["pip↔weight-200-paddle", "nova↔weight-100-paddle"]));
  expect(contacts).not.toContain("pip↔weight-100-paddle");
  expect(contacts).not.toContain("nova↔weight-200-paddle");
  expect(errors).toEqual([]);
});
