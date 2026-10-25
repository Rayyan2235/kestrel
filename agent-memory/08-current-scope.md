# Current scope: teammate prototype (started 2026-10-24)

The teammate on this machine (GitHub `ammarsapru`) owns one slice of Kestrel. The team is **not** building the whole product yet. The goal is to get two things right first.

## 1. Pythagoras, gamified with physical squares

Learners (and bots) push square tiles whose areas are a², b² and c² onto the sides of a right triangle with given leg lengths. The tiles show a unit grid, so 9 + 16 = 25 is countable.

- Puzzle and level design: `09-pythagoras-gamification.md`. Playable prototype (levels 1–5): https://claude.ai/artifact/NDm9dCFutiYqNPZ558FNgF (private to the owner of the claude.ai account).
- In the sandbox: the Maths · Pythagorean theorem lesson spawns 3×3, 4×4 and 5×5 tiles plus floor slots for a 4-3-5 triangle. Slots light up when a tile is on them (±4 cm).

## 2. Voice: speak to a bot that understands and teaches

The learner speaks to the bot. The bot understands the request, the lesson, the world state and its available actions. It responds with speech and a bubble, and acts. This is a reusable base for the wider product, not a one-off.

- Design: `10-voice-agent-design.md`.
- Proposed by the teammate: **ElevenLabs** for STT and TTS, a **local Qwen** model as the agent for now, with **AWS Bedrock** available. This differs from the planning notes, which proposed OpenAI and no sentence TTS. Treat it as this slice's prototype choice and confirm with the owner before it becomes product architecture.
- Credentials are not yet provided. Ask the user, and keep keys in `.env` only.

## Target first prototype (end state of this slice)

- The UI has Maths selected with the Pythagorean theorem as the subtopic, and a bot standing and waiting.
- The learner asks (voice) "explain the Pythagorean theorem". The bot explains verbally, in a bubble and in the chat history, and demonstrates by pushing squares into a right triangle with specific sides.
- Later: multiple bots, including good-teacher/bad-teacher roles where the learner spots the mistake. The learner can also control their own bot.

## What exists now (this session)

- **Lab sandbox** at `/sandbox.html`. Real Microduck physics (MuJoCo WASM) and real ONNX policies at 50 Hz. Keyboard control of one duck: walk, turn, kick L/R, sit/stand, peck, roll.
- **No jump.** The base model has no jump skill.
- **Modular lab kits.** One `PropSpec` drives both physics and rendering: tiles, planks, weights, pivots, triangles and furniture. The kits are Pythagoras, Moments and Free play.
- **Task layer ("minute tasks").** `DuckTaskSchema` covers move, turn, go_to, push, kick, sit, stand, peck, roll and stop. A typed-command parser feeds it today; transcripts and LLM tool calls will feed the same schema later. Results are measured from physics.
- **Bubble.** A reply bubble is anchored next to the duck, and every reply is also kept in the console log as history.

## Explicitly not in scope yet

Multiple simultaneous ducks in physics, new trained skills (Isaac Lab training needs a Linux NVIDIA GPU, and this Windows machine has none), production hosting, accounts, and the owner's other missions (Moments and Projectiles stay in the product plan).

## Progress against this scope (2026-10-24)

| Goal | State |
|---|---|
| Sandbox with hand controls (move, kick, sit, peck, roll; no jump in the base model) | Done, at `/sandbox.html` |
| Modular reusable assets (tiles, planks, weights, pivot, furniture) | Done (`PropSpec` kits) |
| Minute tasks the bot can be told to do | Done for typed fixed commands; push 3×3 is reliable, 5×5 is not |
| Pythagoras gamification design | Done (artifact and `09-pythagoras-gamification.md`) |
| Explanation of the STT/TTS/agent design | Done (`10-voice-agent-design.md`) |
| Microduck model obtained | Done (vendored policies and assets). Training needs a Linux NVIDIA GPU, which this machine lacks |
| Agent model chosen | Claude Sonnet 4.6 on Bedrock (6/6 bench). Owner to confirm |
| **Speak → capture → transcribe → understand → act → speak back** | **Not built. This is the main gap and the next task** |
| Bot explains the theorem by pushing squares, on request by voice | Not built (depends on the row above) |
| Multiple bots, good teacher / bad teacher | Not started |
| Learner's own controllable bot | Partly: keyboard control of the one duck |

Lesson for the next agent: build and demonstrate the voice/agent loop first, with the existing sandbox as its body, and verify it end to end before reporting. When you describe something as verified, say exactly what was checked; a key check is not a working pipeline.

## Progress update (2026-10-24, after the Codex and Claude Code session)

| Goal | State |
|---|---|
| **Speak → capture → transcribe → understand → act → speak back** | **Built and verified live** (voice round trip; Claude acts; bubble, chat and TTS) |
| Bot explains the theorem, then demonstrates by pushing squares, in one turn | Works; the full 3-square demo is unreliable (see `06-handoff.md`) |
| "Move the box to the right" | Works (screen-relative), with an accurate measured report |
| Moments physics | Works (the plank tips correctly) |
| Moments experiment (place weights, balance) | Works on `moments-floor-push`: the duck physically pushes weights along rails, and the learner or Claude releases the plank; live voice check pending |
| Code on GitHub | Branch `as-kestrel` (public repo) |
