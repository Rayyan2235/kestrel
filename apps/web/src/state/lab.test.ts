import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLab } from "./lab.js";
beforeEach(() => {
  vi.useFakeTimers();
  useLab.getState().reset();
});
afterEach(() => {
  useLab.getState().stop();
  vi.useRealTimers();
});
it("invalidates queued turns on reset", () => {
  const token = useLab.getState().startExchange();
  useLab.getState().reset();
  useLab.getState().deliverExchange(token, 0);
  expect(useLab.getState().messages).toHaveLength(0);
  expect(useLab.getState().busy).toBe(false);
});
it("stops queued turns and caps one exchange at two messages", () => {
  const token = useLab.getState().startExchange();
  useLab.getState().deliverExchange(token, 0);
  useLab.getState().deliverExchange(token, 0);
  expect(useLab.getState().messages).toHaveLength(1);
  useLab.getState().stop();
  useLab.getState().deliverExchange(token, 1);
  expect(useLab.getState().messages).toHaveLength(1);
});
it("keeps an exchange addressed to the original bots when selection changes", () => {
  useLab.getState().select("pip");
  const token = useLab.getState().startExchange();
  useLab.getState().select("nova");
  useLab.getState().deliverExchange(token, 0);
  useLab.getState().deliverExchange(token, 1);
  expect(useLab.getState().messages.map((m) => m.speaker)).toEqual([
    "pip",
    "nova",
  ]);
  expect(useLab.getState().busy).toBe(false);
});

it("pins an action recipient and emits the completion bubble only after measured completion", () => {
  useLab.getState().select("pip");
  useLab.getState().send("right weight to 40 cm");
  useLab.getState().select("nova");
  expect(useLab.getState().world.rightCm).toBe(20);
  expect(useLab.getState().messages.some((m) => m.action)).toBe(false);
  expect(useLab.getState().simulation.activeAction?.request.botId).toBe("pip");
  vi.advanceTimersByTime(10000);
  expect(useLab.getState().world.rightCm).toBe(40);
  const completion = useLab.getState().messages.find((m) => m.action);
  expect(completion).toMatchObject({
    speaker: "pip",
    recipient: "you",
    action: { side: "right", cm: 40 },
  });
  expect(useLab.getState().simulation.lastAction?.result?.balance).toBe(
    "balanced",
  );
});

it("routes direct controls through ownership and exposes rejection without cancelling accepted work", () => {
  useLab.getState().select("pip");
  useLab.getState().moveWeight("right", 40);
  useLab.getState().select("nova");
  useLab.getState().moveWeight("left", 10);
  expect(useLab.getState().lastSubmission).toMatchObject({
    accepted: false,
    error: { code: "BUSY" },
  });
  expect(useLab.getState().simulation.activeAction?.request.botId).toBe("pip");
  vi.advanceTimersByTime(10000);
  expect(useLab.getState().world).toMatchObject({ leftCm: 20, rightCm: 40 });
});

it.each(["stop", "reset"] as const)(
  "%s prevents late completion bubbles and science changes",
  (operation) => {
    useLab.getState().send("right weight to 40 cm");
    vi.advanceTimersByTime(500);
    useLab.getState()[operation]();
    vi.advanceTimersByTime(10000);
    expect(useLab.getState().world.rightCm).toBe(20);
    expect(useLab.getState().messages.some((m) => m.action)).toBe(false);
    expect(useLab.getState().busy).toBe(false);
  },
);

it("keeps action busy state independent of scripted exchanges and hints", () => {
  useLab.getState().send("right weight to 40 cm");
  useLab.getState().send("hint");
  const token = useLab.getState().startExchange();
  useLab.getState().deliverExchange(token, 0);
  useLab.getState().deliverExchange(token, 1);
  expect(useLab.getState().busy).toBe(true);
  vi.advanceTimersByTime(10000);
  expect(useLab.getState().world.rightCm).toBe(40);
  expect(useLab.getState().busy).toBe(false);
});

it("captures text recipient before publishing the user message", () => {
  useLab.getState().select("pip");
  const unsubscribe = useLab.subscribe((s) => {
    if (s.messages.at(-1)?.speaker === "you" && s.selected === "pip")
      s.select("nova");
  });
  useLab.getState().send("right weight to 40 cm");
  unsubscribe();
  expect(useLab.getState().simulation.activeAction?.request.botId).toBe("pip");
});
