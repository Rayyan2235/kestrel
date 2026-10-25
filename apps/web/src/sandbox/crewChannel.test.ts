import { expect, it } from "vitest";
import { handoffLine } from "./crewChannel";

it("hands Nova its side of a balance test", () => {
  expect(handoffLine({ kind: "set_balance", left_cm: 10, right_cm: 20 })).toBe(
    "Nova, move the 100 g weight to 20 cm. I'll take the 200 g to 10 cm, then we let go of the plank.",
  );
});

it("only hands over a weight that is Nova's", () => {
  expect(handoffLine({ kind: "place_weight", target: "weight-100", cm: 15 })).toBe("Nova, your weight: move the 100 g to 15 cm.");
  expect(handoffLine({ kind: "place_weight", target: "weight-200", cm: 15 })).toBeNull();
});

it("says nothing to Nova for Pip's solo moves", () => {
  expect(handoffLine({ kind: "move", meters: 0.2 })).toBeNull();
  expect(handoffLine({ kind: "push", target: "box", direction: "right" })).toBeNull();
});
