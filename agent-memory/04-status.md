# Status

_Updated 2026-10-25 after pull from `origin/main` and implementation work._

## Repository baseline

- `HEAD` and `origin/main` are both `e4c5d875f822453c65f8ef213f584474b2782c85` (`e4c5d87`, merge PR #5, Moments floor push). The working branch is `as-kestrel`; no push was made. The separate remote tracking ref `origin/as-kestrel` is older and is not the pulled-main baseline.
- The owner-provided root `handoff-kestrel.md` is preserved. `agent-memory/` was preserved across the refresh and updated to this handoff.
- Application changes listed below are uncommitted local work on top of the pulled main snapshot.

## Implemented in the current worktree

- `/console` lesson conversation now uses Claude on Bedrock via `/api/agent/turn`, with ElevenLabs speech-to-text via `/api/voice/transcribe` and the existing server-only `/api/voice/speak` route.
- Hold-to-talk button and Space capture audio; typed prompts also go through Claude when needed. The response schema supports Pip, Nova or Both and lesson-book/quiz UI actions.
- Natural introductory lesson questions are prompted to open a short intro and lesson book. The intended sequence is book → coordinated two-bot demonstration → mixed maths/physics quiz → follow-up questions. “Quiz me” opens the active lesson quiz directly.
- Book overlays cover Pythagoras and Moments with formulas and live placement/moment/tilt values. Quiz overlay selects three Maths and three Physics questions, grades them and explains answers.
- Robot replies stay in chat and a speaker bubble. Routine action tool output is suppressed; demo completion yields one measured summary. Skill-only actions avoid chat narration and use the skill tray state.
- Pip/Nova/Both recipient selection is in the console. The shared Pythagoras build assigns 5×5 to Pip and 4×4 to Nova together, then Pip moves 3×3. Moments uses the existing coordinated balance experiment.
- The owner's MP3 is at `apps/web/public/audio/bd1-reply.mp3`; Web Audio is primed from the learner gesture to address browser autoplay blocking. In the lesson sequence it is intended to play with the first reply before the book opens and when the robots begin moving. The measured conclusion and quiz score are silent.

## Verification and limits

- `pnpm typecheck` passes after the Web Audio change on Node 22.23.1, with the repository's Node >=24 engine warning.
- `git diff --check` reports no whitespace errors.
- Dev server was restarted after the latest edits and HMR errors: `pnpm dev`, web at `http://127.0.0.1:5180`, API at `http://127.0.0.1:5181` (session 9762).
- The prior server session logged MuJoCo binding errors after hot-reloading the simulation. The MP3 and `/console` both return HTTP 200. Actual sound output, fresh browser simulation boot, and live Bedrock/ElevenLabs voice round trip have not been verified after this feature work. Do not claim those live flows passed yet.
- No automated tests or paid provider checks were run in this turn.
- Background and level-design changes remain excluded.

## Main risks to check next

1. Open a fresh `/console` page after server restart and verify MuJoCo initializes without browser errors.
2. Do one live spoken introductory question end-to-end: transcription → Claude book action → intro → book → both-bot demo → quiz; then verify follow-up and the local reply sound.
3. Test a simple targeted request such as “Nova, move the box to the right”, then “Both, move forward”, and check measured outcomes and recipient labels.
4. The learner-facing broad-intro classification currently depends on the Bedrock system prompt/tool choice. Validate varied novice phrasings; add a local intent fallback only if real responses miss them.

- Latest follow-up: a full simulated demo completed all three pushes but settled with only 1/3 squares in slots; later pushes displaced the first two. Added a capped spring-damper hold in pps/web/src/simulation/duckSim.ts for squares already within their slot while another square is pushed. pnpm typecheck passes. The live page on port 5180 returns HTTP 200, but the latest physical run with this fixture is still pending; do not claim the board or full voice sequence is demo-ready until it passes.

- ElevenLabs 400 diagnosis (2026-10-25): the robot's enabled sound is the local MP3 and does not call ElevenLabs. The surfaced provider error therefore came from the microphone transcription request to /api/voice/transcribe; it was not a PowerShell execution failure. Updated the API wrapper to surface ElevenLabs' safe validation detail on provider errors without exposing headers or credentials. pnpm typecheck passes; retry transcription to see the precise provider reason.

- Retried live ElevenLabs transcription against the local API using the project MP3 fixture: API reports speech capability enabled and returned HTTP 200 with empty transcript (expected for a non-speech beep-bop file). This confirms the key and MP3 STT request path work; it does not validate actual browser microphone WebM upload or prove the earlier 400 is resolved.
