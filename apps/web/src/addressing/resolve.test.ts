import { describe, expect, it } from "vitest";
import type { BotId } from "@kestrel/contracts";
import {
  pressStart,
  resolveAddressees,
  type AddressContext,
} from "./resolve.js";

const none: AddressContext = { selected: null, thread: null };
const to = (text: string, ctx = none) => resolveAddressees(text, ctx).to;

describe("addressee resolver", () => {
  it.each<[string, BotId[]]>([
    ["Hey Pip, can you move the weight to 30 cm", ["pip"]],
    ["hey pip move this", ["pip"]],
    ["Nova can you check the tilt", ["nova"]],
    ["okay nova what happens now", ["nova"]],
    ["yo pipp, which side goes down", ["pip"]],
    ["what happens if I let go, Nova", ["nova"]],
    ["why does it tip, pip", ["pip"]],
    ["@nova how heavy is your weight", ["nova"]],
    ["nova: explain the moment", ["nova"]],
    ["hey noba what do you see", ["nova"]],
    ["Pip, ask Nova to check it", ["pip"]],
    ["both, what do you predict", ["pip", "nova"]],
    ["hey you two, which way will it tip", ["pip", "nova"]],
    ["Pip and Nova, look at this", ["pip", "nova"]],
    ["what do you predict", ["pip", "nova"]],
  ])("%s -> %j", (text, expected) => {
    expect(to(text)).toEqual(expected);
  });

  it("a name in the middle is a mention, not the addressee", () => {
    const r = resolveAddressees("can pip move it", none);
    expect(r.mode).not.toBe("named");
    expect(r.mentions).toEqual(["pip"]);
    expect(resolveAddressees("can you ask Nova to check", none).mode).not.toBe(
      "named",
    );
  });

  it("'pick the 200 g weight' is no name; a no-name action goes to the weight's owner", () => {
    const r = resolveAddressees("pick the 200 g weight", none);
    expect(r.heard).toBeNull();
    expect(r).toMatchObject({ mode: "owner", to: ["pip"] });
    expect(to("move the right weight to 20 cm")).toEqual(["nova"]);
  });

  it("an unresolved 'this' asks which weight instead of acting", () => {
    expect(resolveAddressees("move this 30 cm to the left", none).mode).toBe(
      "clarify",
    );
  });

  it("strips the vocative from the body and reports what was heard", () => {
    const r = resolveAddressees("Hey Pip, move the left weight to 15 cm", none);
    expect(r.body).toBe("move the left weight to 15 cm");
    expect(r.heard).toBe("pip");
  });

  it("stale voice: no name binds to the press-start selection even if it changes before the transcript", () => {
    let live: AddressContext = { selected: "pip", thread: null };
    const snapshot = pressStart(live);
    live = { selected: "nova", thread: null };
    expect(to("what do you see", snapshot)).toEqual(["pip"]);
    expect(to("what do you see", live)).toEqual(["nova"]);
    // A spoken name binds at transcript time and wins.
    expect(to("Nova, what do you see", snapshot)).toEqual(["nova"]);
  });
});
