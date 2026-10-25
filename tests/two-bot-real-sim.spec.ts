import { expect, test, type Page } from "@playwright/test";

// The two-bot demo on the real MuJoCo Microducks (?sim=mujoco). A typed
// command makes a robot physically push its weight along the rail, and the
// room shows the measured position, never the commanded one.

test.use({
  launchOptions: {
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  },
});
test.skip(
  ({ isMobile }) => isMobile,
  "one physics run per case is enough; the layout is covered elsewhere",
);

type Lab = {
  status(): { balance: { rails: Map<string, number> } };
  contacts(): Record<string, { samples: number; impulseNs: number }>;
};

const open = async (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?demo=two-bot&sim=mujoco");
  await expect(page.getByTestId("demo-banner")).toContainText("Real MuJoCo", {
    timeout: 150000,
  });
  await expect(page.getByTestId("balance-result")).toContainText(
    "Left 20 cm · Right 20 cm",
  );
  return errors;
};

const send = async (page: Page, text: string) => {
  await page.getByRole("textbox", { name: "Message your robot" }).fill(text);
  await page.getByRole("button", { name: "Send command" }).click();
};

/** Measured rail position in cm from the pivot, read from the sim itself. */
const railCm = (page: Page, id: string) =>
  page.evaluate((id) => {
    const lab = (window as unknown as { kestrelSim: Lab }).kestrelSim;
    const at = lab.status().balance.rails.get(id)!;
    return Math.round(Math.abs(at) * 1000) / 10;
  }, id);

const readout = async (page: Page) => {
  const t = await page.getByTestId("balance-result").innerText();
  const m = /Left ([\d.]+) cm · Right ([\d.]+) cm/.exec(t)!;
  return { left: Number(m[1]), right: Number(m[2]) };
};

test("a demo exchange moves a real weight and shows the measured result", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  const errors = await open(page);
  const sent = Date.now();
  await send(page, "move the left weight to 10 cm");
  await expect(page.getByTestId("status-pip")).toHaveAttribute(
    "data-state",
    "acting",
  );

  // Watch the readout while Pip pushes: it follows the measured rail.
  const seen = new Set<number>();
  const notice = page.locator(
    '[data-testid="thread-entry"][data-kind="notice"][data-from="pip"]',
  );
  for (let i = 0; i < 1200 && (await notice.count()) === 0; i++) {
    seen.add((await readout(page)).left);
    await page.waitForTimeout(200);
  }
  await expect(notice).toHaveCount(1);
  const seconds = ((Date.now() - sent) / 1000).toFixed(1);
  const text = await notice.locator("p").innerText();
  const m =
    /^Moved the 200 g weight from 20 cm to ([\d.]+) cm \(asked for 10 cm\)\.$/.exec(
      text,
    );
  expect(m, text).not.toBeNull();

  const measured = await railCm(page, "weight-200");
  const shown = await readout(page);
  expect(shown.left).toBe(measured);
  expect(Number(m![1])).toBeCloseTo(measured, 0);
  expect(Math.abs(measured - 10)).toBeLessThan(0.5);
  expect(shown.right).toBe(20);
  // In-between positions were shown while the weight slid along the rail.
  expect([...seen].some((cm) => cm < 19.5 && cm > 10.5)).toBe(true);

  // A physical push: Pip's paddle contact is in the sim's contact ledger.
  const contacts = await page.evaluate(() =>
    (window as unknown as { kestrelSim: Lab }).kestrelSim.contacts(),
  );
  expect(contacts["pip↔weight-200-paddle"]?.impulseNs).toBeGreaterThan(0);
  expect(contacts["nova↔weight-200-paddle"]).toBeUndefined();
  await expect(page.getByTestId("status-pip")).toHaveAttribute(
    "data-state",
    "idle",
  );

  const result = `${text} Readout: ${await page.getByTestId("balance-result").innerText()}. Push took ${seconds} s.`;
  console.log(`[real sim] ${result}`);
  info.annotations.push({ type: "measured", description: result });
  await page.screenshot({ path: info.outputPath("real-sim-exchange.png") });
  expect(errors).toEqual([]);
});

test("Stop mid-push leaves the weight where the robot left it", async ({
  page,
}) => {
  test.setTimeout(300000);
  const errors = await open(page);
  await page.getByRole("button", { name: "Select Nova" }).click();
  await send(page, "move the right weight to 28 cm");
  await expect(page.getByTestId("status-nova")).toHaveAttribute(
    "data-state",
    "acting",
  );
  // Stop once the weight has started to move.
  await expect
    .poll(async () => (await readout(page)).right, { timeout: 150000 })
    .toBeGreaterThan(21);
  await page.getByTestId("dock-stop").click();
  await expect(page.getByTestId("status-nova")).toHaveAttribute(
    "data-state",
    "idle",
  );
  const stoppedAt = await railCm(page, "weight-100");
  await page.waitForTimeout(3000);
  // The clamp holds it: no snap back to 20 and no jump to the 28 cm mark.
  const later = await railCm(page, "weight-100");
  expect(Math.abs(later - stoppedAt)).toBeLessThan(0.3);
  expect(later).toBeGreaterThan(20.5);
  expect(later).toBeLessThan(27.5);
  expect((await readout(page)).right).toBe(later);
  expect(errors).toEqual([]);
});
