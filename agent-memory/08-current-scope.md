# Current scope: two-robot lesson and voice flow

## Pulled baseline

`HEAD` and `origin/main` are `e4c5d87` (2026-10-25 refresh). No changes were pushed. The current feature work is local and uncommitted; see `06-handoff.md` for paths and validation status.

## Target behavior

- Broad novice questions about the selected lesson start one short intro, then open a scrollable lesson book.
- The sequence is book → learner-started coordinated demo → measured conclusion and mixed Maths/Physics quiz → follow-up questions.
- “Quiz me” directly opens the selected lesson quiz.
- Pythagoras uses one shared plan: Pip and Nova push different squares together, then Pip moves the last one. Moments uses the existing coordinated weights experiment.
- Text and bubble output are concise and grounded. Routine movement and individual tool calls stay out of chat. Skill-only buttons light while active without narration.
- Learner can select Pip, Nova or Both. Hold-to-talk and Space use ElevenLabs STT. Typed prompts use the agent path. A toggle plays the owner-provided MP3 with meaningful replies instead of full-text narration.

## Current status

Implemented in local source; `pnpm typecheck` passes. The restarted dev server is `http://127.0.0.1:5180` (API `:5181`, session 22399). Fresh browser startup, Bedrock, real ElevenLabs STT, and full interaction sequence still need direct verification. No automated test suite was run for these changes.

## Main files

- `apps/api/src/agent.ts`, `live.ts`, `voice.ts`
- `packages/contracts/src/agent.ts`
- `apps/web/src/sandbox/agentSession.ts`, `SandboxApp.tsx`, `SandboxScene.tsx`, `Sandbox.module.css`
- `apps/web/src/lessons/lessonContent.ts`, `LessonBookOverlay.tsx`, `QuizOverlay.tsx`, `Lessons.module.css`
- `apps/web/public/audio/bd1-reply.mp3`
- Simulation coordination/physics stays in `apps/web/src/simulation/duckSim.ts`, `tasks.ts`, and `moments.ts`.

## Explicitly excluded

Background artwork, room dressing and level-design changes.
