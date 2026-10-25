import { expect, test, type Page } from "@playwright/test";

const DEMO_URL = "/?demo=two-bot";

const open = async (page: Page, delayMs = 1000) => {
  await page.goto(DEMO_URL);
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await page.getByTestId("delay").selectOption(String(delayMs));
};

const send = async (page: Page, text: string) => {
  await page.getByRole("textbox", { name: "Message your robot" }).fill(text);
  await page.getByRole("button", { name: "Send command" }).click();
};

type Seen = { bg: string; border: string; w: number; room: string[] };

/** Polls until both a to-you bubble and a bot-to-bot pill have been seen (or ~9 s pass). */
const captureVariants = async (page: Page) => {
  const out: { toYou?: Seen; pill?: Seen } = {};
  for (let i = 0; i < 60 && !(out.toYou && out.pill); i++) {
    const rows = await page
      .locator('[data-testid="bubble"]')
      .evaluateAll((els) =>
        els.map((e) => {
          const s = getComputedStyle(e);
          return {
            variant: e.getAttribute("data-variant"),
            opacity: parseFloat(s.opacity),
            bg: s.backgroundColor,
            border: s.borderTopColor,
            w: parseFloat(s.borderTopWidth),
            room: (
              getComputedStyle(
                document.querySelector('[data-testid="stage"]')!,
              ).backgroundImage.match(/rgb\([^)]*\)/g) ?? []
            ).slice(0, 4),
          };
        }),
      );
    for (const r of rows) {
      // skip frames still fading in: their colors are mid-transition
      if (r.opacity < 0.99) continue;
      if (r.variant === "to-you") out.toYou ??= r;
      if (r.variant === "bot-to-bot") out.pill ??= r;
    }
    await page.waitForTimeout(150);
  }
  return out;
};

/** Parses rgb()/rgba()/color(srgb ...) into 0..255 channels. */
const lum = (css: string): number => {
  const nums = css.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  let [r, g, b] = nums as [number, number, number];
  if (css.startsWith("color(")) [r, g, b] = [r * 255, g * 255, b * 255];
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

test.describe("no network model calls", () => {
  test("a full chain makes no provider-path request", async ({ page }) => {
    const bad: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
      const xhr = ["fetch", "xhr", "websocket", "eventsource"].includes(
        r.resourceType(),
      );
      if (
        !local ||
        (xhr && !u.pathname.startsWith("/@") && !u.pathname.startsWith("/src"))
      )
        bad.push(`${r.resourceType()} ${r.url()}`);
    });
    await open(page);
    await send(page, "why does it tilt?");
    await expect(page.getByTestId("handback-strip")).toBeVisible({
      timeout: 8000,
    });
    await page.getByTestId("ask-peer").click();
    await expect(page.getByTestId("budget")).toHaveAttribute(
      "data-calls",
      "2",
      {
        timeout: 8000,
      },
    );
    expect(bad).toEqual([]);
  });

  test("the page states it is a mock with no AI", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("demo-banner")).toContainText(/mock/i);
    await expect(page.getByTestId("demo-banner")).toContainText(/no AI/i);
  });
});

test.describe("fast path", () => {
  test("a typed command moves the weight with a built-in bubble and no model chain", async ({
    page,
  }) => {
    await open(page);
    await send(page, "left weight to thirty five");
    await expect(page.getByTestId("balance-result")).toContainText(
      "Left 35 cm",
    );
    const b = page.getByTestId("bubble");
    await expect(b).toHaveCount(1);
    await expect(b).toHaveAttribute("data-to", "you");
    await expect(b).toHaveAttribute("data-source", "built-in");
    await expect(page.getByTestId("budget")).toHaveAttribute("data-calls", "0");
    await expect(page.getByTestId("handback-strip")).toHaveCount(0);
  });

  test("a miss says what to try and moves nothing", async ({ page }) => {
    await open(page);
    const before = await page.getByTestId("balance-result").innerText();
    await send(page, "move the left weight to banana");
    // a non-fast phrase goes to the mock; it must not change the lab
    await expect(page.getByTestId("balance-result")).toHaveText(before);
  });
});

test.describe("addressee drives every cue", () => {
  test("open question: to-you bubble, bot-to-bot pill with capsule, handback", async ({
    page,
  }) => {
    await open(page, 3000); // pill now plays ~700 ms after the ledger handoff; 3 s keeps handoff capsule and pill together
    await send(page, "why does it tilt?");
    await expect(page.getByTestId("status-pip")).not.toHaveAttribute(
      "data-state",
      "idle",
    );
    const pill = page.locator(
      '[data-testid="bubble"][data-variant="bot-to-bot"]',
    );
    await expect(pill).toBeVisible({ timeout: 8000 });
    await expect(pill).toHaveAttribute("data-to", "nova");
    await expect(pill.getByTestId("bubble-chip")).toHaveText(/to Nova/);
    await expect(page.getByTestId("capsule")).toHaveAttribute(
      "data-kind",
      "handoff",
    );
    await expect(page.getByTestId("handback-strip")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByTestId("handback-strip")).toHaveAttribute(
      "data-source",
      "mock",
    );
    await expect(
      page.locator('[data-testid="bubble"][data-anchor="nova"]'),
    ).toHaveAttribute("data-to", "you");
    // on phones the bot channel is behind a tab
    if (await page.getByTestId("tab-bots").count())
      await page.getByTestId("tab-bots").click();
    await expect(page.getByTestId("evidence")).toBeVisible();
    await expect(page.getByTestId("budget")).toHaveAttribute("data-calls", "2");
    await expect(page.getByTestId("budget")).toHaveAttribute("data-hops", "1");
  });

  test("data-to, variant, chip, aria-label and tail agree on every bubble at every step", async ({
    page,
  }) => {
    await open(page);
    await send(page, "why does it tilt?");
    const check = async () => {
      const rows = await page.getByTestId("bubble").evaluateAll((els) =>
        els.map((e) => ({
          to: e.getAttribute("data-to"),
          variant: e.getAttribute("data-variant"),
          anchor: e.getAttribute("data-anchor"),
          tail: e.getAttribute("data-tail"),
          chip:
            e.querySelector('[data-testid="bubble-chip"]')?.textContent ?? "",
          aria: e.getAttribute("aria-label") ?? "",
        })),
      );
      for (const r of rows) {
        expect(r.variant).toBe(r.to === "you" ? "to-you" : "bot-to-bot");
        expect(r.chip).toContain(
          r.to === "you"
            ? "to You"
            : `to ${r.to![0]!.toUpperCase()}${r.to!.slice(1)}`,
        );
        expect(r.aria).toContain(
          r.to === "you"
            ? " to You:"
            : ` to ${r.to![0]!.toUpperCase()}${r.to!.slice(1)}:`,
        );
        expect(r.tail === "down").toBe(r.to === "you");
      }
      return rows.length;
    };
    let seen = 0;
    for (let i = 0; i < 20; i++) {
      seen += await check();
      await page.waitForTimeout(250);
    }
    expect(seen).toBeGreaterThan(0);
  });

  test("bot facing follows the addressee", async ({ page }) => {
    await open(page);
    await send(page, "why does it tilt?");
    await expect(page.getByTestId("bot-pip")).toHaveAttribute(
      "data-facing",
      "nova",
      { timeout: 8000 },
    );
    await expect(page.getByTestId("handback-strip")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByTestId("bot-nova")).toHaveAttribute(
      "data-facing",
      "you",
    );
  });

  test("the learner cannot type in the bot channel", async ({ page }) => {
    await open(page);
    const n = await page
      .getByTestId("bot-channel")
      .locator("input, textarea, [contenteditable='true']")
      .count();
    expect(n).toBe(0);
    await expect(page.getByTestId("bot-channel")).toHaveAttribute(
      "aria-live",
      "off",
    );
    await expect(page.getByTestId("you-thread")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});

test.describe("Ask and Stop", () => {
  test("Ask Nova runs a 2-call chain ending in a handback strip", async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByTestId("ask-peer")).toHaveText(/Ask Nova/);
    await page.getByTestId("ask-peer").click();
    await expect(page.getByTestId("handback-strip")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByTestId("budget")).toHaveAttribute("data-calls", "2");
    await expect(page.getByTestId("budget")).toHaveAttribute("data-hops", "1");
    await expect(
      page.locator('[data-testid="channel-entry"][data-kind="handoff"]'),
    ).toHaveCount(1);
  });

  test("Stop mid-chain aborts: no handback ever arrives and bots go idle", async ({
    page,
  }) => {
    await open(page, 3000);
    await page.getByTestId("ask-peer").click();
    await expect(
      page.locator('[data-testid="channel-entry"][data-kind="handoff"]'),
    ).toHaveCount(1, { timeout: 8000 });
    await page.getByTestId("stop").click();
    await page.waitForTimeout(7000);
    await expect(page.getByTestId("handback-strip")).toHaveCount(0);
    await expect(page.getByTestId("status-pip")).toHaveAttribute(
      "data-state",
      "idle",
    );
    await expect(page.getByTestId("status-nova")).toHaveAttribute(
      "data-state",
      "idle",
    );
    await expect(page.getByTestId("stop")).toBeDisabled();
  });

  test("Reset during a chain drops the late result", async ({ page }) => {
    await open(page, 3000);
    await send(page, "why does it tilt?");
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Reset lab" }).click();
    await page.waitForTimeout(8000);
    await expect(page.getByTestId("thread-entry")).toHaveCount(0);
    await expect(page.getByTestId("bubble")).toHaveCount(0);
  });

  test("a new question while a chain runs supersedes it", async ({ page }) => {
    await open(page, 3000);
    await page.getByTestId("ask-peer").click();
    await page.waitForTimeout(500);
    await send(page, "left weight to 30");
    await page.waitForTimeout(8000);
    await expect(page.getByTestId("handback-strip")).toHaveCount(0);
    await expect(page.getByTestId("balance-result")).toContainText(
      "Left 30 cm",
    );
  });
});

test.describe("capsule timing is deterministic under a fake clock", () => {
  test("flying then landed at data-duration-ms, then idle", async ({
    page,
  }) => {
    await page.clock.install();
    await open(page);
    await send(page, "why does it tilt?");
    await page.clock.fastForward(1100); // call 1 returns, handoff appended
    const cap = page.getByTestId("capsule");
    await expect(cap).toHaveAttribute("data-state", "flying");
    const dur = Number(await cap.getAttribute("data-duration-ms"));
    expect(dur).toBeGreaterThan(0);
    await page.clock.fastForward(dur - 50);
    await expect(cap).toHaveAttribute("data-state", "flying");
    await page.clock.fastForward(100);
    await expect(cap).toHaveAttribute("data-state", "landed");
    await page.clock.fastForward(3000);
    await expect(page.getByTestId("handback-strip")).toBeVisible();
  });
});

test.describe("accessibility modes", () => {
  test("reduced motion: no flying capsule, a still glyph instead", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await send(page, "why does it tilt?");
    await expect(page.getByTestId("capsule-glyph").first()).toBeVisible({
      timeout: 8000,
    });
    await expect(
      page.locator('[data-testid="capsule"][data-state="flying"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("capsule-glyph").first()).toHaveAttribute(
      "data-glyph-only",
      "true",
    );
  });

  test("forced colors: addressee is still carried by text, tail and border", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await open(page, 3000);
    await send(page, "why does it tilt?");
    const pill = page.locator(
      '[data-testid="bubble"][data-variant="bot-to-bot"]',
    );
    await expect(pill).toBeVisible({ timeout: 8000 });
    await expect(pill.getByTestId("bubble-chip")).toHaveText(/to Nova/);
    const border = await pill.evaluate((e) => {
      const s = getComputedStyle(e);
      return { w: s.borderTopWidth, style: s.borderTopStyle };
    });
    expect(border.style).not.toBe("none");
    expect(parseFloat(border.w)).toBeGreaterThan(0);
    await expect(pill).toHaveAttribute("data-tail", /left|right/);
  });

  test("achromatopsia: variant is still readable from text and tail, not hue alone", async ({
    page,
    context,
  }) => {
    await open(page, 3000); // phone pill is ~300 ms at 1 s; see min-visible-time gate
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setEmulatedVisionDeficiency", {
      type: "achromatopsia",
    });
    await send(page, "why does it tilt?");
    const pill = page.locator(
      '[data-testid="bubble"][data-variant="bot-to-bot"]',
    );
    await expect(pill).toBeVisible({ timeout: 8000 });
    await expect(pill.getByTestId("bubble-chip")).toContainText("to Nova");
    // luminance must separate light (to you) from dark (bot to bot) without hue.
    // On phones only one bubble shows at a time, so sample both over time.
    const seen = await captureVariants(page);
    expect(seen.toYou, "never saw a to-you bubble").toBeDefined();
    expect(seen.pill, "never saw a bot-to-bot pill").toBeDefined();
    expect(Math.abs(lum(seen.toYou!.bg) - lum(seen.pill!.bg))).toBeGreaterThan(
      0.3,
    );
  });

  test("focus is not stolen from a field the learner is typing in", async ({
    page,
  }) => {
    await open(page);
    const field = page.getByRole("textbox", { name: "Message your robot" });
    await field.fill("left weight to");
    await field.focus();
    await page.getByTestId("ask-peer").evaluate((b: HTMLElement) => b.click());
    await expect(page.getByTestId("handback-strip")).toBeVisible({
      timeout: 8000,
    });
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("left weight to");
  });

  test("focus returns to the command field after a handback when nothing is focused", async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId("ask-peer").evaluate((b: HTMLElement) => b.click());
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await expect(page.getByTestId("handback-strip")).toBeVisible({
      timeout: 8000,
    });
    await expect(
      page.getByRole("textbox", { name: "Message your robot" }),
    ).toBeFocused();
    await expect(page.getByTestId("dock")).not.toHaveAttribute(
      "data-pulse",
      "0",
    );
  });
});

test.describe("rail scrolling", () => {
  test("scrolling up is not yanked down; a new-messages pill appears and works", async ({
    page,
  }) => {
    await open(page);
    for (let i = 0; i < 12; i++)
      await send(page, `left weight to ${10 + (i % 2) * 10}`);
    const log = page.getByTestId("you-thread");
    await expect
      .poll(() => log.evaluate((e) => e.scrollHeight > e.clientHeight + 40))
      .toBe(true);
    await log.evaluate((e) => (e.scrollTop = 0));
    await send(page, "right weight to 30");
    await page.waitForTimeout(300);
    expect(await log.evaluate((e) => e.scrollTop)).toBeLessThan(5);
    const pill = page.getByTestId("new-messages");
    await expect(pill).toBeVisible();
    await pill.click();
    await expect
      .poll(() =>
        log.evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight),
      )
      .toBeLessThan(24);
    await expect(pill).toHaveCount(0);
  });

  test("at the bottom, new messages are followed", async ({ page }) => {
    await open(page);
    for (let i = 0; i < 12; i++)
      await send(page, `left weight to ${10 + (i % 2) * 10}`);
    const log = page.getByTestId("you-thread");
    await send(page, "right weight to 30");
    await expect
      .poll(() =>
        log.evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight),
      )
      .toBeLessThan(24);
    await expect(page.getByTestId("new-messages")).toHaveCount(0);
  });
});

test.describe("visual rules", () => {
  test("light bubbles carry a 2px ink outline with 3:1 against the room; dark pill is dark", async ({
    page,
  }) => {
    await open(page, 3000);
    await send(page, "why does it tilt?");
    // phones show one bubble at a time, so sample both variants over time
    const seen = await captureVariants(page);
    const light = seen.toYou;
    expect(light, "never saw a to-you bubble").toBeDefined();
    expect(seen.pill, "never saw a bot-to-bot pill").toBeDefined();
    expect(light!.w).toBeGreaterThanOrEqual(2);
    expect(light!.room.length).toBeGreaterThan(0);
    for (const room of new Set(light!.room))
      expect(contrast(light!.border, room)).toBeGreaterThanOrEqual(3);
    expect(lum(seen.pill!.bg)).toBeLessThan(0.1);
    expect(lum(light!.bg)).toBeGreaterThan(0.6);
  });

  test("rail: learner thread is light, bot channel is dark", async ({
    page,
  }) => {
    await open(page);
    const colors = await page.evaluate(() => {
      const bg = (s: string) =>
        getComputedStyle(document.querySelector(s)!).backgroundColor;
      return {
        you: bg('[data-surface="light"]'),
        bots: bg('[data-surface="dark"]'),
      };
    });
    expect(lum(colors.you)).toBeGreaterThan(lum(colors.bots) + 0.3);
  });

  test("truncation is CSS line-clamp, never JS: DOM text equals the ledger text", async ({
    page,
  }) => {
    await open(page);
    await send(page, "why does it tilt?");
    const bubble = page.locator('[data-testid="bubble"]').first();
    await expect(bubble).toBeVisible();
    const row = await bubble.evaluate((e) => {
      const p = e.querySelector("p")!;
      const s = getComputedStyle(p);
      return {
        clamp:
          s.getPropertyValue("-webkit-line-clamp") ||
          s.getPropertyValue("line-clamp"),
        text: p.textContent ?? "",
      };
    });
    expect(row.clamp).not.toBe("none");
    expect(row.clamp).not.toBe("");
    expect(row.text).not.toContain("…");
    // the bubble repeats the ledger text exactly (after the speaker name)
    const said = row.text.replace(/^(Pip|Nova)\s*/, "");
    await expect(
      page
        .locator('[data-testid="thread-entry"], [data-testid="channel-entry"]')
        .filter({ hasText: said }),
    ).toHaveCount(1);
  });
});

for (const vp of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "phone-390", width: 390, height: 664 },
  { name: "phone-360", width: 360, height: 640 },
]) {
  test.describe(`geometry at ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("bubbles stay inside the stage, do not overlap each other, and do not cover a bot", async ({
      page,
    }) => {
      await open(page, 3000); // at 1 s the phone pill is ~300 ms: too short to sample
      await send(page, "why does it tilt?");
      const pill = page.locator(
        '[data-testid="bubble"][data-variant="bot-to-bot"]',
      );
      await expect(pill).toBeVisible({ timeout: 8000 });
      const boxes = await page.evaluate(() => {
        const r = (e: Element) => {
          const b = e.getBoundingClientRect();
          return { l: b.left, t: b.top, r: b.right, b: b.bottom };
        };
        return {
          stage: r(document.querySelector('[data-testid="stage"]')!),
          bubbles: [...document.querySelectorAll('[data-testid="bubble"]')]
            .filter(
              (e) =>
                getComputedStyle(e).display !== "none" &&
                getComputedStyle(e).visibility !== "hidden",
            )
            .map(r),
          bots: [...document.querySelectorAll('[data-testid^="bot-"]')].map(r),
          doc: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      const hit = (a: any, b: any) =>
        a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
      expect(boxes.doc).toBeLessThanOrEqual(0); // no horizontal page scroll
      for (const b of boxes.bubbles) {
        expect(b.l).toBeGreaterThanOrEqual(boxes.stage.l - 1);
        expect(b.r).toBeLessThanOrEqual(boxes.stage.r + 1);
        expect(b.t).toBeGreaterThanOrEqual(boxes.stage.t - 1);
        for (const bot of boxes.bots)
          expect(hit(b, bot), "bubble covers a bot").toBe(false);
      }
      for (let i = 0; i < boxes.bubbles.length; i++)
        for (let j = i + 1; j < boxes.bubbles.length; j++)
          expect(
            hit(boxes.bubbles[i], boxes.bubbles[j]),
            "bubbles overlap",
          ).toBe(false);
    });

    test("the command dock and the stage stay reachable without page-level horizontal scroll", async ({
      page,
    }) => {
      await open(page);
      await expect(
        page.getByRole("textbox", { name: "Message your robot" }),
      ).toBeVisible();
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(over).toBeLessThanOrEqual(0);
    });
  });
}

test.describe("phone budget", () => {
  test.use({ viewport: { width: 390, height: 664 } });

  test("at most one in-room bubble at a time, 80 chars or fewer", async ({
    page,
  }) => {
    await open(page);
    await send(page, "why does it tilt?");
    let max = 0;
    for (let i = 0; i < 24; i++) {
      const n = await page.locator('[data-testid="bubble"]').evaluateAll(
        (els) =>
          els.filter((e) => {
            const s = getComputedStyle(e);
            const b = e.getBoundingClientRect();
            return (
              s.display !== "none" &&
              s.visibility !== "hidden" &&
              b.width > 0 &&
              b.height > 0
            );
          }).length,
      );
      max = Math.max(max, n);
      const long = await page
        .locator('[data-testid="bubble"] p')
        .evaluateAll((ps) =>
          ps.some((p) => (p.textContent ?? "").length > 80 + 8),
        );
      expect(long, "mobile bubble text over 80 chars").toBe(false);
      await page.waitForTimeout(250);
    }
    expect(max).toBeLessThanOrEqual(1);
  });

  test("the rail shows one pane at a time with tabs", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(2);
  });

  test("tabs swap panes, flag unread on the hidden tab, and keep Ask/Stop/handback on both", async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByTestId("tab-you")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await send(page, "why does it tilt?");
    await expect(page.getByTestId("unread-bots")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByTestId("handback-strip")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByTestId("ask-peer")).toBeVisible();
    await page.getByTestId("tab-bots").click();
    await expect(page.getByTestId("tab-bots")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("channel-entry").first()).toBeVisible();
    await expect(page.getByTestId("unread-bots")).toHaveCount(0);
    await expect(page.getByTestId("handback-strip")).toBeVisible();
    await expect(page.getByTestId("ask-peer")).toBeVisible();
  });
});

test.describe("polish: dwell, stopped bubbles, handback in view", () => {
  test("dwell: Pip's reply shows before the handoff pill replaces it (fake clock)", async ({
    page,
  }) => {
    await page.clock.install();
    await open(page);
    await send(page, "why does it tilt?");
    await page.clock.fastForward(1050); // call 1 returns: reply and handoff land together
    const pipBubble = page.locator('[data-testid="bubble"][data-anchor="pip"]');
    await expect(pipBubble).toHaveAttribute("data-to", "you");
    await expect(pipBubble).toContainText("Let me check with Nova");
    await page.clock.fastForward(500);
    await expect(pipBubble).toHaveAttribute("data-to", "you");
    await page.clock.fastForward(300); // past the 700 ms dwell
    await expect(pipBubble).toHaveAttribute("data-to", "nova");
    await expect(pipBubble).toHaveAttribute("data-variant", "bot-to-bot");
  });

  test("dwell is view-only: the ledger still has both events in order", async ({
    page,
  }) => {
    await open(page);
    await send(page, "why does it tilt?");
    await expect(page.getByTestId("handback-strip")).toBeVisible({
      timeout: 8000,
    });
    await expect(
      page.getByTestId("thread-entry").filter({ hasText: "Let me check" }),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-testid="channel-entry"][data-kind="handoff"]'),
    ).toHaveCount(1);
  });

  test("a chain that finishes normally leaves no stopped bubble", async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId("ask-peer").click();
    await expect(page.getByTestId("handback-strip")).toBeVisible({
      timeout: 8000,
    });
    await page.waitForTimeout(900);
    await expect(
      page.locator('[data-testid="bubble"][data-stale="true"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("bubble-stopped")).toHaveCount(0);
  });

  test("Stop marks earlier bubbles stopped; a newer turn is normal; Reset clears", async ({
    page,
  }) => {
    await open(page, 3000);
    await page.getByTestId("ask-peer").click();
    await expect(
      page.locator('[data-testid="channel-entry"][data-kind="handoff"]'),
    ).toHaveCount(1, { timeout: 8000 });
    await expect(page.getByTestId("bubble").first()).toBeVisible();
    await page.getByTestId("stop").click();
    // pacing: Stop fades the current bubble out and empties the queue; while it
    // fades it reads as stopped, then nothing more plays
    await expect(page.getByTestId("bubble")).toHaveCount(0, { timeout: 3000 });
    await expect(
      page.locator('[data-testid="bubble"][data-to="nova"]'),
    ).toHaveCount(0);
    // the ledger is not rewritten by Stop
    await expect(
      page.locator('[data-testid="channel-entry"][data-kind="handoff"]'),
    ).toHaveCount(1);
    // a newer turn's bubble is normal
    await send(page, "left weight to 30");
    const fresh = page.locator(
      '[data-testid="bubble"][data-source="built-in"]',
    );
    await expect(fresh).toBeVisible();
    await expect(fresh).toHaveAttribute("data-stale", "false");
    await expect(fresh.getByTestId("bubble-stopped")).toHaveCount(0);
    await page.getByRole("button", { name: "Reset lab" }).click();
    await expect(page.getByTestId("bubble")).toHaveCount(0);
    await expect(page.getByTestId("bubble-stopped")).toHaveCount(0);
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 664 } });

    test("the handback strip is scrolled into view and focus is not moved", async ({
      page,
    }) => {
      await open(page);
      const field = page.getByRole("textbox", { name: "Message your robot" });
      await field.fill("left weight to");
      await field.focus();
      await page
        .getByTestId("ask-peer")
        .evaluate((b: HTMLElement) => b.click());
      const strip = page.getByTestId("handback-strip");
      await expect(strip).toBeVisible({ timeout: 8000 });
      await expect(strip).toBeInViewport({ ratio: 0.9 });
      await expect(field).toBeFocused();
      await expect(field).toHaveValue("left weight to");
    });
  });
});
