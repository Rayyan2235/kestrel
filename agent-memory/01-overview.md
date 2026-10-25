# Kestrel overview

## One line

A 3D science and maths lab for learners aged about 13–16. The learner directs two or three small robot companions, watches experiments unfold, and works out why with them.

## The core loop

1. The learner selects a robot (Pip or Nova today) and speaks or types a request.
2. That robot replies with a short public thought bubble and does a supported, visible action at a lab station.
3. The **simulation** measures the result. The model never invents or overrides a measurement.
4. The robot explains from the measurement. Optionally, one robot asks a peer to observe, report or disagree.
5. The exchange is capped (proposed: 2 bot turns). Then control returns to the learner, who predicts and tries again.

## Three differentiators (owner-confirmed, must be preserved)

1. **Interactive embodied bots.** Robots visibly act on the apparatus. They are not chat windows.
2. **Exceptional UI.** An Open Space-inspired isometric 3D room (https://github.com/Fantomiald/open-space) with compact agent windows, distinct identities and bubbles. The room leads; it must not become a card dashboard.
3. **Bot-to-bot collaboration.** Addressed messages between bots about the shared world, with a purpose, bounded and stoppable.

## Subject scope

- **Moments / pivot balance:** recommended first slice and the only one built. Not a confirmed release order.
- **Projectile Playground** and collision play remain product directions.
- **Pythagoras** (squares on sides as tile areas, 3-4-5 then 6-8-10) is the required maths direction.

## Tutoring policy (accepted, ADR 0004)

- Ordinary experiment commands execute directly.
- When the learner asks for the whole solution, encourage another try and give one small hint.
- If they are still stuck, give a more specific hint grounded in their attempt.
- After a further explicit request, demonstrate the solution and offer a changed challenge.

## Ground rules (from AGENTS.md; do not violate)

- The learner controls experiments. Models request validated actions; the simulation owns state and results.
- Recipient identity, cancellation, reset versions, object ownership and bounded autonomous turns stay explicit in code.
- API secrets never reach Vite. No hidden paid or background model calls.
- No stored learner audio or transcripts by default. Youth audience: follow OpenAI under-18 guidance. Gemini is excluded by its terms.
- Label scripted behavior honestly. Bubbles are public plans and explanations, never "hidden reasoning".
- Don't add disabled decorative buttons for features that don't exist.
- Never copy private vault notes or practice-repo source into this repo.
- Don't mass-delete or archive planning notes.
- Don't create Orca feature worktrees unless the owner asks.

## People

- Owner/repo: `usmannsiddiqui`. Teammates with write access: `ammarsapru`, `rayyan2235`.
- This machine belongs to a teammate (Windows). The planning notes' macOS paths are the owner's machine.
