import { describe, expect, it } from "vitest";
import { createConversation, threadOf } from "./conversation.js";

describe("R1 gate: console conversation ledger", () => {
  it("a learner line records you -> selected bot; a duck reply records bot -> you", () => {
    const c = createConversation();
    c.select("nova");
    c.record("you", c.selected(), "learner", "move it", "built-in");
    c.record("nova", "you", "say", "Done.", "live");
    const [a, b] = c.events();
    expect([a!.from, a!.to, a!.kind]).toEqual(["you", "nova", "learner"]);
    expect([b!.from, b!.to, b!.source]).toEqual(["nova", "you", "live"]);
    expect(b!.causedBy).toBe(a!.id);
  });

  it("threads filter by bot, and mirrored coordinator events are copied once", () => {
    const c = createConversation();
    c.record("you", "pip", "learner", "hi pip", "built-in");
    c.record("you", "nova", "learner", "hi nova", "built-in");
    c.record("pip", "nova", "handoff", "check this", "mock", { hop: 1 });
    expect(threadOf(c.events(), "pip").map((e) => e.text)).toEqual(["hi pip"]);
    expect(threadOf(c.events(), "nova").map((e) => e.text)).toEqual([
      "hi nova",
    ]);
    const incoming = [...c.events()];
    c.mirror(incoming);
    c.mirror(incoming);
    expect(c.events().length).toBe(3 + 3);
  });
});
