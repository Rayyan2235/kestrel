import { expect, test } from "@playwright/test";

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
  await page.goto("/console");
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
  // A real push lands within about a millimetre of 10 cm, and the balance is
  // sensitive: 1 mm on the 200 g weight tilts it about 0.5°. So the release
  // must be near-balanced and reported truthfully, not exactly level.
  const released = JSON.parse(requests[2].messages.at(-1).content[0].content);
  const tilt = released.world.balance;
  expect(tilt.plank).toBe("released");
  expect(tilt.tiltDeg, released.summary).toBeLessThan(1.5);
  const report = /^Released the plank\. (?:It stayed level \((\d+\.\d)°\)|The (left|right) side went down (\d+\.\d)°)\.$/.exec(released.summary);
  expect(report, released.summary).not.toBeNull();
  const reported = Number(report![1] ?? report![3]);
  // The wording matches the number (level means under 0.5°), and the world snapshot agrees.
  expect(report![2] ? reported >= 0.5 : reported < 0.5).toBe(true);
  expect(Math.abs(reported - tilt.tiltDeg)).toBeLessThanOrEqual(0.15);
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
  // Real pushes land within a couple of millimetres of the marks, and the
  // balance is sensitive: 2 mm on the 200 g weight tilts it about 1°. So check
  // what must hold however they land: both weights are near their marks, the
  // measured tilt matches the tilt the measured moments predict, and the
  // feedback tells the learner the truth about their prediction.
  const exp = await page.evaluate(() => (window as any).kestrelSim.status().experiment.result);
  expect(exp.ok, exp.summary).toBe(true);
  expect(Math.abs(exp.left.cm - 15)).toBeLessThanOrEqual(0.3);
  expect(Math.abs(exp.right.cm - 30)).toBeLessThanOrEqual(0.3);
  expect(Math.abs(exp.measured.angleDeg - exp.predictedTiltDeg), exp.summary).toBeLessThanOrEqual(0.4);
  await expect(result).toContainText(exp.measured.lowSide === "level" ? "you were right" : "not this time");
  // Both weights really moved, and both robots touched only their own paddles.
  const contacts = await page.evaluate(() => Object.keys((window as any).kestrelSim.contacts()));
  expect(contacts).toEqual(expect.arrayContaining(["pip↔weight-200-paddle", "nova↔weight-100-paddle"]));
  expect(contacts).not.toContain("pip↔weight-100-paddle");
  expect(contacts).not.toContain("nova↔weight-200-paddle");
  expect(errors).toEqual([]);
});

test("Moments: a balanced plank stays level with a weight at the very end of its rail", async ({ page }) => {
  // Regression: a push that stops a hair past its 30 cm (or 5 cm) mark used to
  // press the carriage into the rail's joint limit. The limit's reaction acts
  // below the pivot pin and tipped an equal-moment plank about 1° (CI saw
  // 29.44 vs 29.47 N·cm read as "left side down 1°"). Fast-stepped real physics.
  await page.route("**/api/**", route => route.abort());
  await page.goto("/sandbox.html");
  await expect(page.getByTestId("duck-mode")).toHaveText("walk", { timeout: 90000 });
  await page.getByRole("button", { name: /Moments/ }).click();
  await expect(page.getByTestId("balance")).toContainText("Plank locked");
  const tilts = await page.evaluate(async () => {
    const sim = (window as any).kestrelSim;
    sim.stop();
    const out: { left: number; right: number; tiltDeg: number }[] = [];
    // Equal moments (200 g × L = 100 g × R), with each weight at, or just past, an end mark.
    for (const [left, right] of [[0.15, 0.3], [0.1502, 0.3004], [0.1505, 0.301], [0.0498, 0.0996], [0.0495, 0.099]]) {
      sim.reset();
      for (let i = 0; i < 10; i++) await sim.controlStep();
      sim.rails.get("weight-200").brake = -left;
      sim.rails.get("weight-100").brake = right;
      for (let i = 0; i < 25; i++) await sim.controlStep();
      sim.runTask({ kind: "release_plank" });
      for (let i = 0; i < 250; i++) await sim.controlStep();
      out.push({ left, right, tiltDeg: (sim.status().balance.angle * 180) / Math.PI });
    }
    return out;
  });
  for (const t of tilts) expect(Math.abs(t.tiltDeg), `left ${t.left} m, right ${t.right} m`).toBeLessThan(0.5);
});
