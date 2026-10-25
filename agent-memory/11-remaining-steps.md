# Remaining steps

_Updated 2026-10-25. The previous backlog below was written for earlier branches and is historical unless listed as current._

## Current implementation status

The working tree is based on `origin/main` at `e4c5d87`. The requested voice/lesson/quiz/sound and Pip/Nova/Both changes are implemented locally; see `06-handoff.md`. `pnpm typecheck` passes. No push was made, and background/level-design changes are excluded.

## Remaining verification

1. **Fresh browser boot:** open `http://127.0.0.1:5180/console` after the server restart and check MuJoCo/ONNX load without console errors. Previous HMR emitted MuJoCo binding errors.
2. **Manual live round trip:** hold the mic button or Space, release, and verify ElevenLabs transcription reaches Claude on Bedrock. Try a broad novice Pythagoras question and observe intro → book → coordinated Pip/Nova square demo → one measured result → quiz → follow-up.
3. **Sound:** verify the optional toggle plays the supplied `bd1-reply.mp3` once for a meaningful reply and does not narrate the full text.
4. **Targeting:** try Pip-only, Nova-only and Both-safe movement prompts, including a box push with a single selected robot. Verify resulting measurements and labels.
5. If novice introductory phrasings fail inconsistently, add/test a local intent fallback; current classification is directed by the Bedrock prompt and UI tools.

Do not claim provider or physical interaction success until observed. No test suite was run in the latest implementation turn.

## Historical backlog

The remainder of this file documents earlier teammate slices, old branches, and unmerged ideas. Verify against the current source before using it; it is not the active scope.
