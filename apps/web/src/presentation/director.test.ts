import { describe, expect, it } from "vitest";
import {
  FADE_MS,
  GAP_MS,
  MAX_HOLD_MS,
  MIN_HOLD_MS,
  createDirector,
  makeBeat,
  readingMs,
} from "./director.js";
import { ev } from "../testing/fixtures.js";

const say = (seq: number, text = "short") =>
  makeBeat(ev(seq, "pip", "you", { text }), false);

describe("presentation director", () => {
  it("holds a bubble for 60 ms per character, between 2.5 s and 7 s", () => {
    expect(readingMs("hi")).toBe(MIN_HOLD_MS);
    expect(readingMs("x".repeat(60))).toBe(3600);
    expect(readingMs("x".repeat(400))).toBe(MAX_HOLD_MS);
  });

  it("shows one bubble at a time, fades it, waits a gap, then the next", () => {
    const d = createDirector();
    d.enqueue(say(0));
    d.enqueue(say(1));
    expect(d.snapshot()).toMatchObject({ phase: "show", queued: 1 });
    expect(d.snapshot().beat!.event.seq).toBe(0);
    d.advance(MIN_HOLD_MS);
    expect(d.snapshot().phase).toBe("fade");
    d.advance(FADE_MS);
    expect(d.snapshot()).toMatchObject({ phase: "gap" });
    d.advance(GAP_MS);
    expect(d.snapshot().phase).toBe("show");
    expect(d.snapshot().beat!.event.seq).toBe(1);
  });

  it("can pass several phases in one advance, in ledger order", () => {
    const d = createDirector();
    [0, 1, 2].forEach((n) => d.enqueue(say(n)));
    d.advance(MIN_HOLD_MS + FADE_MS + GAP_MS + 10);
    expect(d.snapshot().beat!.event.seq).toBe(1);
  });

  it("a new learner turn drops waiting bot-to-bot pills, never bubbles to the learner", () => {
    const d = createDirector();
    d.enqueue(say(0));
    d.enqueue(makeBeat(ev(1, "pip", "nova", { kind: "handoff" }), false));
    d.enqueue(
      makeBeat(ev(2, "nova", "you", { kind: "handback", text: "back" }), false),
    );
    d.dropPills();
    const s = d.snapshot();
    expect(s.queued).toBe(1);
    expect(s.collapsed).toBe(1);
  });

  it("Stop empties the queue and fades the current bubble now", () => {
    const d = createDirector();
    d.enqueue(say(0));
    d.enqueue(say(1));
    d.interrupt();
    expect(d.snapshot()).toMatchObject({ phase: "fade", queued: 0 });
  });

  it("skips the gap, never the dwell, when more than 3 are waiting", () => {
    const d = createDirector();
    for (let n = 0; n < 6; n++) d.enqueue(say(n));
    d.advance(MIN_HOLD_MS + FADE_MS);
    expect(d.snapshot().phase).toBe("show");
    expect(d.snapshot().beat!.event.seq).toBe(1);
  });

  it("a handoff capsule flies for its plan, then reads as landed", () => {
    const d = createDirector();
    d.enqueue(makeBeat(ev(0, "pip", "nova", { kind: "handoff" }), false));
    expect(d.snapshot().capsuleState).toBe("flying");
    d.advance(d.snapshot().beat!.capsule!.durationMs);
    expect(d.snapshot().capsuleState).toBe("landed");
    d.advance(MIN_HOLD_MS + FADE_MS + GAP_MS);
    expect(d.snapshot().capsuleState).toBe("idle");
  });

  it("nothing advances without time: pause is just not calling advance", () => {
    const d = createDirector();
    d.enqueue(say(0));
    const before = d.snapshot().key;
    d.advance(0);
    expect(d.snapshot().key).toBe(before);
  });
});
