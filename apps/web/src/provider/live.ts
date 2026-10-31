import { RespondSchema, type World } from "@kestrel/contracts";
import type { Provider } from "./types.js";

type LiveProviderOptions = {
  /** The measured world the bot sees when it answers. */
  world: () => World;
  /** Answers instead when the live call fails; its replies stay labelled `mock`. */
  fallback: Provider;
  fetch?: typeof fetch;
};

/** Claude, via the local API, behind the same Provider shape as the mock. */
export const createLiveProvider = (options: LiveProviderOptions): Provider => ({
  async respond(req, signal) {
    const { leftCm, rightCm, leftGrams, rightGrams } = options.world();
    try {
      const r = await (options.fetch ?? fetch)("/api/two-bot/respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bot: req.bot,
          input: req.input,
          peer: req.peer,
          world: { leftCm, rightCm, leftGrams, rightGrams },
        }),
        signal,
      });
      if (!r.ok) throw new Error(`Live reply failed (${r.status}).`);
      const parsed = RespondSchema.safeParse(await r.json());
      if (!parsed.success) throw new Error("Live reply broke the contract.");
      return { respond: parsed.data, source: "live" };
    } catch (error) {
      // A stopped turn stays stopped; anything else falls back, labelled mock.
      if (signal.aborted) throw signal.reason ?? error;
      console.warn("[two-bot] live provider fell back to the mock:", error);
      return options.fallback.respond(req, signal);
    }
  },
});
