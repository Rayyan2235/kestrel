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
