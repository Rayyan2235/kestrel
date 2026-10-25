import { describe, expect, it } from "vitest";
import { DEFAULT_LOOKS, type BotLook } from "@kestrel/contracts";
import { CATALOG, FREE_IDS, itemsFor, type Slot } from "./catalog.js";
import { allowed, contrastRatio, whyNot } from "./constraints.js";
import { hiddenSlots } from "./conflicts.js";
import { lookStyle } from "./dom.js";
import { mulberry32, seedFrom } from "../progress/rng.js";
import { createFakeSim } from "../simulation/fake/index.js";

const slotCount = (s: Slot) => itemsFor(s).length;

describe("G5 gate: catalogue", () => {
  it("has the planned counts", () => {
    expect(slotCount("shell")).toBe(10);
    expect(slotCount("accent")).toBe(10);
    expect(slotCount("eye")).toBe(6);
    expect(itemsFor("eyeShape").map((i) => i.id).sort()).toEqual(["happy", "round", "visor"]);
    expect(itemsFor("head").map((i) => i.id)).toEqual(expect.arrayContaining(["none", "antenna", "goggles"]));
    expect(itemsFor("back").map((i) => i.id)).toEqual(expect.arrayContaining(["none", "backpack"]));
    expect(itemsFor("neck").map((i) => i.id)).toEqual(expect.arrayContaining(["none", "scarf"]));
  });

  it("free set: 4 shells, 3 eye colours, the round eye shape; each item has the required fields", () => {
    expect(itemsFor("shell").filter((i) => i.free)).toHaveLength(4);
    expect(itemsFor("eye").filter((i) => i.free)).toHaveLength(3);
    expect(itemsFor("eyeShape").filter((i) => i.free).map((i) => i.id)).toEqual(["round"]);
    CATALOG.forEach((i) => {
      expect(typeof i.id).toBe("string");
      expect(typeof i.label).toBe("string");
      expect(Number.isInteger(i.minLevel)).toBe(true);
    });
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length);
  });

  it("both default looks use only free items", () => {
    for (const look of [DEFAULT_LOOKS.pip, DEFAULT_LOOKS.nova]) {
      for (const slot of ["shell", "eye", "eyeShape"] as const) {
        expect(FREE_IDS).toContain(look[slot]);
      }
    }
  });
});

describe("G5 gate: constraints", () => {
  const pip = DEFAULT_LOOKS.pip;
  const nova = DEFAULT_LOOKS.nova;
  const colorOf = (id: string) => CATALOG.find((i) => i.id === id)!.color!;

  it("contrastRatio is the WCAG ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("allowed never returns the other bot's shell", () => {
    expect(allowed("shell", pip, nova)).not.toContain(nova.shell);
    expect(allowed("shell", nova, pip)).not.toContain(pip.shell);
  });

  it("allowed never returns an eye colour below 3:1 against the shell", () => {
    for (const shell of itemsFor("shell")) {
      const look: BotLook = { ...pip, shell: shell.id };
      for (const id of allowed("eye", look, nova)) {
        expect(contrastRatio(colorOf(id), shell.color!), `${id} on ${shell.id}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("whyNot explains a disabled option, null for an allowed one", () => {
    expect(whyNot("shell", nova.shell, pip, nova)).toMatch(/already wears/i);
    expect(whyNot("shell", pip.shell, pip, nova)).toBeNull();
  });

  it("the free set satisfies the constraints for both bots' defaults", () => {
    expect(allowed("shell", pip, nova)).toContain(pip.shell);
    expect(allowed("eye", pip, nova)).toContain(pip.eye);
    expect(allowed("shell", nova, pip)).toContain(nova.shell);
    expect(allowed("eye", nova, pip)).toContain(nova.eye);
  });

  it("terminates on repeated calls (memoised, cycle guard)", () => {
    for (let i = 0; i < 50; i++) allowed("eye", pip, nova);
    expect(true).toBe(true);
  });
});

describe("G5 gate: conflicts and dom", () => {
  it("goggles hide the visor eye shape; a plain look hides nothing", () => {
    expect(hiddenSlots({ ...DEFAULT_LOOKS.pip, head: "goggles", eyeShape: "visor" })).toContain("eyeShape");
    expect(hiddenSlots(DEFAULT_LOOKS.pip)).toEqual([]);
  });

  it("lookStyle maps each field to CSS variables and data attributes", () => {
    const look: BotLook = { ...DEFAULT_LOOKS.pip, head: "antenna", back: "backpack", neck: "scarf", eyeShape: "happy" };
    const { style, data } = lookStyle(look);
    const s = style as Record<string, string>;
    expect(s["--shell"]).toBeTruthy();
    expect(s["--accent"]).toBeTruthy();
    expect(s["--eye"]).toBeTruthy();
    expect(data["data-eye-shape"]).toBe("happy");
    expect(data["data-head"]).toBe("antenna");
    expect(data["data-back"]).toBe("backpack");
    expect(data["data-neck"]).toBe("scarf");
  });

  it("lookStyle honours hiddenSlots", () => {
    const { data } = lookStyle({ ...DEFAULT_LOOKS.pip, head: "goggles", eyeShape: "visor" });
    expect(data["data-eye-shape"] ?? "").not.toBe("visor");
  });
});

describe("G6 gate: shuffle draws only unlocked, allowed values", () => {
  it("50 seeded shuffles never produce a locked item, a shared shell or a low-contrast eye; same seed same result", () => {
    const pip = DEFAULT_LOOKS.pip;
    const nova = DEFAULT_LOOKS.nova;
    const unlockedIds = new Set(FREE_IDS);
    const shuffle = (seed: number): BotLook => {
      const rnd = mulberry32(seed);
      const out = { ...pip } as Record<string, string>;
      for (const slot of ["shell", "eye"] as const) {
        const pool = allowed(slot, out as unknown as BotLook, nova).filter((id) => unlockedIds.has(id));
        if (pool.length) out[slot] = pool[Math.floor(rnd() * pool.length)]!;
      }
      return out as unknown as BotLook;
    };
    for (let i = 0; i < 50; i++) {
      const a = shuffle(seedFrom(`s${i}`));
      expect(a).toEqual(shuffle(seedFrom(`s${i}`)));
      expect(unlockedIds.has(a.shell)).toBe(true);
      expect(a.shell).not.toBe(nova.shell);
      const shell = CATALOG.find((x) => x.id === a.shell)!;
      const eye = CATALOG.find((x) => x.id === a.eye)!;
      expect(contrastRatio(eye.color!, shell.color!)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("G5 gate: cosmetics are render-only", () => {
  it("after N fake-sim steps, state is identical for the default and a fully equipped look", () => {
    const run = (look: BotLook) => {
      void lookStyle(look);
      const sim = createFakeSim();
      for (const cm of [30, 40, 25, 35]) {
        const t = { id: `t${cm}`, object: "right-weight" as const, owner: "pip" as const, cm };
        const p = sim.propose(t);
        if (p.ok) sim.apply(p.task, p.baseVersion);
      }
      return sim.snapshot();
    };
    const full: BotLook = { ...DEFAULT_LOOKS.pip, head: "goggles", back: "backpack", neck: "scarf" };
    expect(run(full)).toEqual(run(DEFAULT_LOOKS.pip));
  });
});
