// Boots the two-robot DuckSim on the Moments balance and wraps it in the
// SimAdapter. Imported lazily, so the stub demo never loads MuJoCo or ONNX.
import { KITS } from "@kestrel/contracts";
import { DuckSim, type SimEvent } from "../duckSim";
import { createDuckSimAdapter } from "./index.js";

export async function loadDuckSimAdapter(onLine?: (label: string) => void) {
  // DuckSim takes one listener at creation; the adapter subscribes after.
  const relay = new Set<(e: SimEvent) => void>();
  const duck = await DuckSim.create(
    KITS.moments(),
    (e) => relay.forEach((fn) => fn(e)),
    onLine,
  );
  duck.start();
  const sim = createDuckSimAdapter(duck, (fn) => {
    relay.add(fn);
    return () => void relay.delete(fn);
  });
  return {
    sim,
    duck,
    dispose: () => {
      sim.dispose();
      duck.stop();
    },
  };
}
