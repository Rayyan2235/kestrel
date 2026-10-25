import { expect, test, type Page } from "@playwright/test";
// The numbers under test come from the pacing module, never hard-coded here.
import {
  FADE_MS,
  GAP_MS,
  MAX_HOLD_MS,
  MIN_HOLD_MS,
  MS_PER_CHAR,
} from "../apps/web/src/presentation/director.js";

// Pacing + Pause/Resume gates. Everything runs on Playwright's fake clock so the
// timings are exact: runFor() fires every timer, we sample the DOM each step.

const STEP = 100;

type Snap = {
  bubbles: {
    id: string;
    phase: string;
    to: string;
    anchor: string;
    variant: string;
    len: number;
  }[];
  capsule: string | null;
  capKind: string | null;
  capMs: number;
  glyph: number;
  collapsed: string | null;
  paused: boolean;
  step: string;
};
type Sample = Snap & { t: number };

const snap = (page: Page): Promise<Snap> =>
  page.evaluate(() => {
    const q = (s: string) => document.querySelector(s);
    return {
      bubbles: [...document.querySelectorAll('[data-testid="bubble"]')].map(
        (e) => ({
          id: e.getAttribute("data-bubble-id") ?? "",
          phase: e.getAttribute("data-phase") ?? "",
          to: e.getAttribute("data-to") ?? "",
          anchor: e.getAttribute("data-anchor") ?? "",
          variant: e.getAttribute("data-variant") ?? "",
          // ledger text only: the bubble prefixes the speaker name in <strong>
          len: Math.max(
            0,
            (e.querySelector("p")?.textContent ?? "").length -
              ((e.querySelector("p strong")?.textContent ?? "").length + 1),
          ),
        }),
      ),
      capsule: q('[data-testid="capsule"]')?.getAttribute("data-state") ?? null,
      capKind: q('[data-testid="capsule"]')?.getAttribute("data-kind") ?? null,
      capMs: Number(
        q('[data-testid="capsule"]')?.getAttribute("data-duration-ms") ?? 0,
      ),
      glyph: document.querySelectorAll('[data-testid="capsule-glyph"]').length,
      collapsed: q('[data-testid="collapsed"]')?.textContent ?? null,
      paused: !!q('[data-testid="paused"]'),
      step: q('[data-testid="sample-step"]')?.textContent ?? "",
    };
  });

class Clock {
  t = 0;
  samples: Sample[] = [];
  constructor(private page: Page) {}
  /** Advances fake time in STEP slices and records the DOM after each slice. */
  async run(ms: number, step = STEP) {
    for (let done = 0; done < ms; done += step) {
      await this.page.clock.runFor(step);
      this.t += step;
      await this.page.waitForTimeout(12); // let React commit (real time)
      this.samples.push({ t: this.t, ...(await snap(this.page)) });
    }
  }
  last() {
    return this.samples.at(-1)!;
  }
}

const boot = async (page: Page, delayMs = 1000) => {
  // An installed clock still ticks with real time; pause it so only runFor() moves time.
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.goto("/?demo=two-bot");
  await page.getByTestId("delay").selectOption(String(delayMs));
  await page.clock.pauseAt(new Date("2026-01-01T00:00:10Z"));
  return new Clock(page);
};

const send = async (page: Page, text: string) => {
  await page.getByRole("textbox", { name: "Message your robot" }).fill(text);
  await page.getByRole("button", { name: "Send command" }).click();
};

const holdFor = (len: number) =>
  Math.min(MAX_HOLD_MS, Math.max(MIN_HOLD_MS, len * MS_PER_CHAR));
/** Fade and gap overlap: the next bubble starts when the fade ends. */
const SEPARATION_MS = Math.max(FADE_MS, GAP_MS);

/** Per bubble id: how long it stayed in `show`, and when it first/last appeared. */
const timeline = (samples: Sample[]) => {
  const ids = new Map<
    string,
    {
      showMs: number;
      first: number;
      last: number;
      firstShow: number;
      lastShow: number;
      len: number;
      to: string;
      anchor: string;
    }
  >();
  for (const s of samples)
    for (const b of s.bubbles) {
      const e = ids.get(b.id) ?? {
        showMs: 0,
        first: s.t,
        last: s.t,
        firstShow: -1,
        lastShow: -1,
        len: b.len,
        to: b.to,
        anchor: b.anchor,
      };
      if (b.phase === "show") {
        e.showMs += STEP;
        if (e.firstShow < 0) e.firstShow = s.t;
        e.lastShow = s.t;
      }
      e.last = s.t;
      ids.set(b.id, e);
    }
  return [...ids.entries()].map(([id, v]) => ({ id, ...v }));
};

test.describe("pacing: one bubble, readable, ordered", () => {
  test("a chain shows one bubble at a time, in ledger order, each held long enough with a gap", async ({
    page,
  }) => {
    const clock = await boot(page);
    await send(page, "why does it tilt?");
    await clock.run(22000);
    for (const s of clock.samples)
      expect(s.bubbles.length, `bubbles at t=${s.t}`).toBeLessThanOrEqual(1);

    const tl = timeline(clock.samples);
    expect(tl.map((b) => `${b.anchor}:${b.to}`)).toEqual([
      "pip:you",
      "pip:nova",
      "nova:you",
    ]);
    for (const b of tl) {
      // hold = max(floor, ms/char) capped (tolerate one sample step)
      expect(b.showMs, `${b.id} shown ${b.showMs} ms`).toBeGreaterThanOrEqual(
        holdFor(b.len) - STEP,
      );
      expect(b.showMs).toBeLessThanOrEqual(holdFor(b.len) + 3 * STEP);
    }
    // the next bubble starts when the previous fade ends: no sooner, and promptly
    for (let i = 1; i < tl.length; i++) {
      const between = tl[i]!.firstShow - tl[i - 1]!.lastShow;
      expect(between, `separation before ${tl[i]!.id}`).toBeGreaterThanOrEqual(
        SEPARATION_MS,
      );
      expect(between).toBeLessThanOrEqual(SEPARATION_MS + 3 * STEP);
    }
  });

  test("the rail logs at ledger speed while the room is still on bubble one", async ({
    page,
  }) => {
    const clock = await boot(page);
    await send(page, "why does it tilt?");
    await clock.run(2400); // both mock calls are done by ~2.1 s
    await expect(
      page.locator('[data-testid="channel-entry"][data-kind="handoff"]'),
    ).toHaveCount(1);
    await expect(page.getByTestId("handback-strip")).toBeVisible();
    const s = clock.last();
    expect(s.bubbles).toHaveLength(1);
    expect(s.bubbles[0]).toMatchObject({ anchor: "pip", to: "you" });
  });

  test("the capsule belongs to its bubble: idle during bubble one, flies with the pill, lands", async ({
    page,
  }) => {
    const clock = await boot(page);
    await send(page, "why does it tilt?");
    await clock.run(14000);
    const first = clock.samples.find((s) => s.bubbles[0]?.to === "you")!;
    expect(first.capsule).toBe("idle");
    const pill = clock.samples.filter((s) => s.bubbles[0]?.to === "nova");
    expect(pill.length).toBeGreaterThan(0);
    expect(pill[0]!.capsule).toBe("flying");
    expect(pill[0]!.capKind).toBe("handoff");
    expect(pill.at(-1)!.capsule).toMatch(/landed|idle/);
    const flyMs = pill.filter((s) => s.capsule === "flying").length * STEP;
    expect(pill[0]!.capMs).toBeGreaterThan(0);
    expect(Math.abs(flyMs - pill[0]!.capMs)).toBeLessThanOrEqual(2 * STEP);
  });

  test("full sample run: never more than one bubble, and it finishes", async ({
    page,
  }) => {
    const clock = await boot(page);
    test.setTimeout(150000);
    await page.getByTestId("sample-run").click();
    await clock.run(120000, 250);
    for (const s of clock.samples)
      expect(s.bubbles.length, `bubbles at t=${s.t}`).toBeLessThanOrEqual(1);
    expect(clock.samples.some((s) => s.bubbles.length === 1)).toBe(true);
    expect(clock.last().step).not.toMatch(/of 5/);
    expect(clock.last().bubbles.length).toBe(0);
  });

  test("0.5x doubles the time a bubble stays, 1x is the baseline", async ({
    page,
  }) => {
    const clock = await boot(page);
    const measure = async (speed: string) => {
      await page.getByTestId("speed").selectOption(speed);
      const c = new Clock(page);
      await send(page, "left weight to thirty five");
      await c.run(14000);
      const first = timeline(c.samples)[0]!;
      await page.getByRole("button", { name: "Reset lab" }).click();
      await c.run(3000);
      return first.showMs;
    };
    void clock;
    const one = await measure("1");
    const half = await measure("0.5");
    expect(one).toBeGreaterThanOrEqual(2400);
    expect(half / one).toBeGreaterThan(1.7);
    expect(half / one).toBeLessThan(2.3);
  });

  test("reduced motion: same pacing, still glyph, no flying capsule", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const clock = await boot(page);
    await send(page, "why does it tilt?");
    await clock.run(16000);
    for (const s of clock.samples) {
      expect(s.bubbles.length).toBeLessThanOrEqual(1);
      expect(s.capsule).not.toBe("flying");
    }
    expect(clock.samples.some((s) => s.glyph > 0)).toBe(true);
    for (const b of timeline(clock.samples))
      expect(b.showMs).toBeGreaterThanOrEqual(holdFor(b.len) - STEP);
  });
});

test.describe("pause and resume", () => {
  test("Pause freezes the room, capsule and sample script; the rail keeps logging; Resume continues from the same point", async ({
    page,
  }) => {
    const clock = await boot(page);
    await send(page, "why does it tilt?");
    // run until Pip's first bubble shows, then pause 400 ms before its hold ends
    while (clock.t < 6000 && clock.last()?.bubbles[0]?.phase !== "show")
      await clock.run(STEP);
    const t0 = clock.t;
    const holdLeft = 400;
    await clock.run(
      Math.ceil((holdFor(clock.last().bubbles[0]!.len) - holdLeft) / STEP) *
        STEP,
    );
    const pausedAt = clock.t;
    const before = clock.last();
    expect(before.bubbles[0]).toMatchObject({
      anchor: "pip",
      to: "you",
      phase: "show",
    });
    const orig = before.bubbles[0]!.id;

    await page.getByTestId("pause").click();
    await expect(page.getByTestId("pause")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("pause")).toHaveText(/Resume/);
    await expect(page.getByTestId("paused")).toBeVisible();
    await clock.run(15000);
    for (const s of clock.samples.filter((x) => x.t > pausedAt)) {
      expect(s.bubbles).toHaveLength(1);
      expect(s.bubbles[0]).toMatchObject({ id: orig, phase: "show" });
      expect(s.capsule).toBe(before.capsule);
      expect(s.paused).toBe(true);
    }
    // the ledger and rail did not wait
    await expect(page.getByTestId("handback-strip")).toBeVisible();
    await expect(
      page.locator('[data-testid="channel-entry"][data-kind="handoff"]'),
    ).toHaveCount(1);

    await page.getByTestId("pause").click();
    await expect(page.getByTestId("paused")).toHaveCount(0);
    await expect(page.getByTestId("pause")).toHaveText(/Pause/);
    // only ~400 ms of the original hold remains: a restart would still show it 600 ms later
    await clock.run(holdLeft + 2 * STEP + 200);
    expect(
      clock.last().bubbles.some((b) => b.id === orig && b.phase === "show"),
    ).toBe(false);
    void t0;
    await clock.run(4000);
    expect(
      clock.samples.slice(-40).some((s) => s.bubbles[0]?.to === "nova"),
    ).toBe(true);
  });

  test("Pause freezes the sample-run script and Resume continues it", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const clock = await boot(page);
    await page.getByTestId("sample-run").click();
    await clock.run(2500);
    await page.getByTestId("pause").click();
    const frozen = clock.last().step;
    expect(frozen).toMatch(/of 5/);
    await clock.run(30000, 500);
    expect(clock.last().step).toBe(frozen);
    await page.getByTestId("pause").click();
    await clock.run(20000, 250);
    expect(clock.last().step).not.toBe(frozen);
  });

  test("Space toggles pause only when focus is not in a text field or control", async ({
    page,
  }) => {
    await boot(page);
    const pause = page.getByTestId("pause");
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Space");
    await expect(pause).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(pause).toHaveAttribute("aria-pressed", "false");

    const field = page.getByRole("textbox", { name: "Message your robot" });
    await field.click();
    await page.keyboard.type("a b");
    await expect(field).toHaveValue("a b");
    await expect(pause).toHaveAttribute("aria-pressed", "false");

    // on the Pause button itself Space is the button's own activation: exactly one toggle
    await pause.focus();
    await page.keyboard.press("Space");
    await expect(pause).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(pause).toHaveAttribute("aria-pressed", "false");
  });

  test("Stop while paused aborts the chain and nothing plays after Resume", async ({
    page,
  }) => {
    const clock = await boot(page, 3000);
    await page.getByTestId("ask-peer").click();
    await clock.run(3300); // call 1 done, handoff in the ledger
    await page.getByTestId("pause").click();
    await page.getByTestId("stop").click();
    await clock.run(12000); // call 2 would have returned by now
    await expect(page.getByTestId("handback-strip")).toHaveCount(0);
    await page.getByTestId("pause").click();
    await clock.run(10000);
    await expect(page.getByTestId("handback-strip")).toHaveCount(0);
    const after = clock.samples.filter((s) => s.t > 15300);
    expect(
      after.some((s) =>
        s.bubbles.some((b) => b.to === "nova" && b.phase === "show"),
      ),
    ).toBe(false);
    expect(clock.last().bubbles).toHaveLength(0);
  });

  test("Reset while paused clears the room and the rail", async ({ page }) => {
    const clock = await boot(page);
    await send(page, "why does it tilt?");
    await clock.run(2500);
    await page.getByTestId("pause").click();
    await page.getByRole("button", { name: "Reset lab" }).click();
    await clock.run(1000);
    await expect(page.getByTestId("thread-entry")).toHaveCount(0);
    await expect(page.getByTestId("channel-entry")).toHaveCount(0);
    await page.getByTestId("pause").click();
    await clock.run(15000);
    expect(clock.samples.slice(-100).every((s) => s.bubbles.length === 0)).toBe(
      true,
    );
  });
});

test.describe("queue collapse", () => {
  test("a new learner turn drops waiting pills (+N in the rail), never the handback", async ({
    page,
  }) => {
    const clock = await boot(page);
    await page.getByTestId("ask-peer").click();
    await clock.run(2400); // Pip's bubble is up; pill and handback are queued
    await send(page, "left weight to 30");
    await clock.run(STEP);
    await expect(page.getByTestId("collapsed")).toContainText("+1");
    await clock.run(30000);
    const seen = timeline(clock.samples);
    expect(seen.some((b) => b.to === "nova")).toBe(false);
    expect(seen.some((b) => b.anchor === "nova" && b.to === "you")).toBe(true);
    // the rail still has the dropped pill
    await expect(
      page.locator('[data-testid="channel-entry"][data-kind="handoff"]'),
    ).toHaveCount(1);
    await expect(page.getByTestId("collapsed")).toHaveCount(0);
  });

  test("Stop mid-queue fades the current bubble and plays nothing more", async ({
    page,
  }) => {
    const clock = await boot(page, 3000);
    await page.getByTestId("ask-peer").click();
    await clock.run(3300); // Pip bubble up, handoff queued, call 2 still running
    expect(clock.last().bubbles[0]).toMatchObject({ anchor: "pip", to: "you" });
    await page.getByTestId("stop").click();
    await clock.run(2000);
    expect(clock.last().bubbles).toHaveLength(0);
    await clock.run(10000);
    for (const s of clock.samples.filter((x) => x.t > 3300))
      expect(s.bubbles.every((b) => b.to !== "nova")).toBe(true);
    await expect(page.getByTestId("handback-strip")).toHaveCount(0);
  });
});
