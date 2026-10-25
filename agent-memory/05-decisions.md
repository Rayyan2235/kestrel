# Decisions

Summaries only. For detail and rationale read the named planning note in `context/HackPSU-2026/`. Record a decision as settled only when the owner settles it.

## Settled (do not re-ask)

- Name **Kestrel**. Fresh public repo `usmannsiddiqui/kestrel`; practice repos are evidence only.
- Audience is roughly 13–16, mission-first, and the robots are knowledgeable assistants (the learner never teaches a novice bot).
- 2–3 selectable bots share one world, with addressed conversations and visible object interactions.
- The three differentiators (see `01-overview.md`).
- 3D Kestrel look in an Open Space-inspired isometric 3D room. Move away from Blender/MCP authoring.
- Hold-to-talk, thought bubbles and robot sounds. No natural-language TTS selected.
- Ordinary commands act directly; a whole-solution request gets another try and a hint first (ADR 0004).
- Pythagoras stays in scope. Projectile Playground stays a direction.
- Stack (October 24 recommendation, now scaffolded): pnpm, TypeScript, React 19/Vite, Three/Fiber 9, MuJoCo WASM + onnxruntime-web, CSS Modules/Radix/Motion/Lucide, Zustand, Fastify, Zod, Vitest, Playwright. OpenAI is the proposed provider; Gemini is excluded for under-18 audiences.

Sources: `build-order.md` ("Settled"), `adr/README.md`, `codebase-architecture.md`.

## Open (owner decides; builders may recommend)

| Question | Current recommendation | Note |
| --- | --- | --- |
| Opening mission | Moments/pivot first | `build-order.md` queue #1, `product-journey.md` |
| How a bot moves and operates apparatus | Pick authored movement or compatible MuJoCo walking; one visible station action | queue #2, `codebase-architecture.md` |
| Bot-to-bot triggers and limits | User-triggered, max 2 bot turns, then return control | `PRODUCT.md`, ADR 0006 |
| What collaboration teaches; bot roles | One bot sets up while the other observes and reports | `docs/ROADMAP.md` step 5 |
| Selection change during a running action | Continue or cancel, but show which, and reject stale work | `codebase-architecture.md` |
| Kestrel asset provenance; Microduck MJCF/policy compatibility | Benchmark one body, then two | `apps/web/src/simulation/README.md` |
| Latency and cost budget, target device, hosting, demo duration, team owners | — | queue #6 |
| ADR 0005 (data and grounded actions) | Still **proposed**; don't treat it as accepted | `adr/0005-…` |

## 2026-10-25 — UI treatment

Owner requested a separate UI branch from main, to merge later: `glass-windows`. Owner selected Nox Noir #141414, Royal Amethyst #7E49B3 and Steel Mist #CFCFCF, Open Space-inspired glass windows, and rounded buttons from the supplied visual prompt. This pass applies to the sandbox panels and controls; wider scene art remains outside this pass.

## 2026-10-25 — Main product entry and merge authorization

Owner directs deletion of the original scripted view, landing Open console navigation to the existing real voice/physics lab, dark-purple glass windows, and merging landing plus console to main for teammates. Canonical console URL is `/console`; `/lab` and `/sandbox.html` retain compatibility. The separate teammate demo and unrelated two-robot integration branches are outside this merge. This supersedes the earlier freeze on main for this specific integration.
