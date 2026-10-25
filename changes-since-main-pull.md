# Changes since pulling `main`

Baseline: `e4c5d87` (`origin/main`, pulled 2026-10-25). This handoff describes the local implementation being committed on `as-kestrel`.

## What changed

- Added a Claude-on-Bedrock lesson flow for introductory questions: concise reply, lesson book, coordinated robot demonstration, measured conclusion, quiz, and follow-up questions. The agent can also route ordinary targeted actions to Pip, Nova, or both.
- Added hold-to-talk and Space microphone capture through the ElevenLabs transcription route. Typed messages can also use the agent when local parsing does not handle them.
- Added the owner's BD-1 MP3 as the optional local robot reply sound. It plays with the first response and when a demonstration starts; it does not depend on ElevenLabs TTS.
- Added book and quiz overlays for Pythagoras and Moments, including lesson content, measured values, quizzes, scoring, and explanations.
- Added measured completion gates. The Pythagoras quiz waits until the demonstration reports all squares in slots; incomplete runs offer reset and retry. Moments coordinates the two weight placements, releases and measures the balance, and reports predicted versus measured tilt before the quiz can continue.
- Refined Pythagoras push alignment, settling, retries, and recovery behavior. A bounded spring-damper force now helps preserve squares already in their slots while later squares are pushed. It does not teleport squares.
- Changed ElevenLabs provider errors to include a bounded validation detail when returned, without exposing credentials.
- Updated `agent-memory/` with the post-pull implementation, test evidence, current limitations, and handoff notes.

## Verification and known gaps

- `pnpm typecheck` passes on Node 22.23.1; the repo declares Node >=24, so pnpm prints an engine warning.
- `git diff --check` passes (Git reports normal LF/CRLF conversion warnings for several files).
- Local `/console` and API health endpoints return HTTP 200. A live ElevenLabs STT request using the local non-speech MP3 returned HTTP 200 with an empty transcript, as expected. This confirms the MP3 request path and configured credentials, but does not reproduce the browser microphone recording.
- The user reports the microphone flow responded fairly well, but the Pythagoras demonstration stalled on the last square. The final-square placement is not yet reliable and needs a repeatable full physical run.
- The Moments book → two-robot demonstration → measured result → quiz → follow-up flow is wired in code, but has not yet been verified end to end in a live run.
- Audible playback on the user's device, a fresh browser simulation boot after the last physics changes, and live Bedrock/Moments flow have not all been reverified. No claim of full demo readiness is made.

## Files modified

- `agent-memory/02-runbook.md`
- `agent-memory/03-codebase-map.md`
- `agent-memory/04-status.md`
- `agent-memory/05-decisions.md`
- `agent-memory/06-handoff.md`
- `agent-memory/07-changelog.md`
- `agent-memory/08-current-scope.md`
- `agent-memory/10-voice-agent-design.md`
- `agent-memory/11-remaining-steps.md`
- `apps/api/src/agent.ts`
- `apps/api/src/voice.ts`
- `apps/web/src/sandbox/Sandbox.module.css`
- `apps/web/src/sandbox/SandboxApp.tsx`
- `apps/web/src/sandbox/SandboxScene.tsx`
- `apps/web/src/sandbox/agentSession.ts`
- `apps/web/src/simulation/duckSim.ts`
- `apps/web/src/simulation/moments.ts`
- `apps/web/src/simulation/tasks.ts`
- `packages/contracts/src/agent.ts`
- `packages/contracts/src/lab.ts`

## Files added

- `apps/web/public/audio/bd1-reply.mp3`
- `apps/web/src/lessons/DemoOutcomeOverlay.tsx`
- `apps/web/src/lessons/LessonBookOverlay.tsx`
- `apps/web/src/lessons/Lessons.module.css`
- `apps/web/src/lessons/QuizOverlay.tsx`
- `apps/web/src/lessons/lessonContent.ts`
- `handoff-kestrel.md` (owner-provided handoff, preserved)
- `changes-since-main-pull.md` (this summary)
