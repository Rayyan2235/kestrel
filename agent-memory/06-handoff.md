# Handoff

_Updated 2026-10-25. Pulled baseline is `origin/main` at `e4c5d87`; current application and memory changes are uncommitted on `as-kestrel`. No push was made._

## Owner's goal

Make the live console a voice-and-text learning assistant for Pythagoras and Moments. A novice introductory question about the selected lesson starts the complete learning sequence. Keep visible robot communication concise and grounded in measured results. The owner supplied a BD-1 MP3 for optional short reply sounds. Background artwork, room dressing and level design are out of scope.

## Required learner sequence

1. A broad novice question about the selected lesson (for example “What is the Pythagorean theorem?” or “Can you tell me about this?”) gets one concise intro and opens the relevant scrollable book. Avoid relying on one exact trigger phrase.
2. The book teaches formulas and graphs tied to current simulation values.
3. Finishing the book lets the learner start the demonstration. Both robots coordinate the lesson task. For Pythagoras, Pip pushes 5×5 while Nova pushes 4×4, then Pip pushes 3×3. For Moments, the existing shared experiment moves the two weights.
4. Once the complete demo finishes, show one concise measured conclusion and open the mixed Maths + Physics quiz.
5. After the quiz, the learner can ask either robot about mistakes or concepts. “Quiz me” opens the selected lesson quiz directly.

## Output and controls

- Support hold-to-talk and Space; release submits the recording for ElevenLabs transcription. Typed text also reaches Claude when it is not handled as a supported local action.
- Claude on Bedrock chooses whether to respond, open a lesson overlay or request a bounded physical task. Use current room state and measured tool results.
- Keep concise useful replies in chat and the bubble. Do not publish hidden reasoning, routine micro-movement, repeated task descriptions or every action tool call. Summarize meaningful failures/milestones and final measured outcomes once.
- Optional robot sound uses Web Audio and is primed on the learner's click/key gesture to avoid autoplay rejection. In the lesson flow it plays at exactly two points: with the first concise response (before the book opens) and at demo start (while the robots begin moving). The measured conclusion and quiz score stay silent. STT remains ElevenLabs; server TTS route remains available.
- Address Pip, Nova or Both. Both may coordinate safe simultaneous work. Avoid assigning two robots to push the same object.
- Skill-only actions (roll, peck, kick, sit, stand) light their tray controls and create no chat/bubble line.

## Current implementation paths

- Agent prompt, Bedrock tool schemas and validation: `apps/api/src/agent.ts`.
- Provider routes and private credentials: `apps/api/src/live.ts`, `apps/api/src/voice.ts`.
- Shared request/response/action contracts: `packages/contracts/src/agent.ts`.
- Recording, STT request, agent/tool loop, task execution, robot sound and cancellation: `apps/web/src/sandbox/agentSession.ts`.
- Recipient dropdown, chat, speech controls, skill tray and book→demo→quiz orchestration: `apps/web/src/sandbox/SandboxApp.tsx`.
- Robot-specific bubble placement and console styles: `apps/web/src/sandbox/SandboxScene.tsx`, `Sandbox.module.css`.
- Lesson and quiz content: `apps/web/src/lessons/lessonContent.ts`.
- Lesson and quiz overlays: `apps/web/src/lessons/LessonBookOverlay.tsx`, `QuizOverlay.tsx`, `Lessons.module.css`.
- Existing physics/coordinator: `apps/web/src/simulation/duckSim.ts`, `tasks.ts`, `moments.ts`.
- MP3 asset: `apps/web/public/audio/bd1-reply.mp3`.

## Latest validation and next action

`pnpm typecheck` passes. The dev server was restarted again after HMR reproduced MuJoCo binding errors; current session is 9762 at `http://127.0.0.1:5180/console`, API at `http://127.0.0.1:5181`. Both console HTML and MP3 returned HTTP 200 before this restart. Browser simulation startup and audible playback have not yet been rechecked in a fresh browser. Live provider flow and real speech round trip have not been run after these changes, so report them as unverified until actually observed.

Next: verify fresh browser boot, then perform one manual speech round trip and the complete book→coordinated demo→quiz→follow-up flow. Do not make background/level-design changes.
