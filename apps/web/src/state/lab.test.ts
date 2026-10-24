import { beforeEach, expect, it } from "vitest";
import { useLab } from "./lab.js";
beforeEach(() => useLab.getState().reset());
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
