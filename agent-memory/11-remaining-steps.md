# Remaining steps

_Created 2026-10-24. This is the full backlog for the teammate slice (voice + Pythagoras + Moments) and what it needs to merge into the product. `06-handoff.md` holds the immediate next steps; this file is everything. Tick items off here and log each one in `07-changelog.md`._

Status key: **[next]** do soon · **[later]** after the slice works · **[owner]** needs the owner's decision · **[blocked]** waiting on something outside the code.

## A. Finish the slice (voice + lessons)

1. **[done on `moments-floor-push`; live Claude verified by typing, spoken check pending] Moments: let the duck load the plank.** Built as a *physical* push instead of an authored placement: each weight rides a rail with a paddle in the duck's lane, so the schema is `place_weight {target, cm}` (the side is the weight's rail). Rails run 5–30 cm, so the balance is 200 g × 10 cm = 100 g × 20 cm. Measured results and the remaining voice check are in `04-status.md`. The original plan, for reference:
   - Add a bounded task `place_weight { weight: "weight-100" | "weight-200", side: "left" | "right", cm: 5–30 }` to `DuckTaskSchema`, the runner and the agent tool schema.
   - Implement it as an *authored station action*: the duck walks to the plank, then the weight is set onto the plank at that distance. Label it honestly in the UI and docs; it is not a physical lift.
   - The result must report the measured plank tilt, e.g. "placed 100 g at 40 cm right; plank now level (±1°)".
   - Acceptance: say "balance the plank" and the duck places 100 g at 40 cm opposite 200 g at 20 cm; the plank ends within ±2° of level, measured.
2. **[done on `moments-floor-push`; live Claude verified by typing, spoken check pending] Moments guidance for Claude.** Add a Moments section to the system prompt in `apps/api/src/agent.ts`: moment = mass × distance, ask for a prediction first, place, observe the tilt, explain (200 g × 20 cm = 100 g × 40 cm). It should also offer "what happens if…" variations.
   - Acceptance: "What are moments?" gives a 1–3 sentence spoken explanation plus a placement demo in the same turn.
3. **[next] Make the 3-square Pythagoras demo reliable.**
   - Apply the largest-first order (5 → 4 → 3) in the prompt, and raise the push budget from 120 to 150 s (update `tasks.test.ts` to match).
   - Investigate the duck falling after pushes, which happens near tile edges. Likely fixes: a back-off step after a push completes, and stopping the turn-creep while standing close to tiles.
   - If a placed tile is knocked out, let Claude re-push it once.
   - Acceptance: 3 of 3 consecutive runs of `tests/.probe-demo.mjs` end with all three slots filled (±4 cm) and an honest summary.
4. **[later] Pythagoras levels 2–5 in 3D**, from `09-pythagoras-gamification.md`:
   - missing square (tray of candidates)
   - choose the hypotenuse
   - good teacher / bad teacher (needs item 8)
   - "doesn't close" (4 + 9 ≠ 16)
   - Each level is a `LabKit` variant plus prompt guidance.
5. **[later] Hint ladder** (ADR 0004) as explicit behaviour: another try, then a hint, then a demonstration, then a new variant. Track attempts per learner question in the agent session.
6. **[later] UI polish.**
   - Keep the duck's bubble from overlapping the lesson card (offset or reposition).
   - Show the measured tilt or slot distances as on-screen readouts, not just in chat.
   - Add a visible "Claude is thinking" state on the duck itself.
   - Check mobile layout and reduced-motion behaviour.
7. **[later] Spoken-reply timing.** Today the duck waits for TTS to finish before acting. Consider speaking while the action starts, and measure the end-to-end latency per turn (STT + Claude + TTS) and record it.

## B. Multiple bots

8. **[done on `two-duck-lab`, not merged] A second duck in the same MuJoCo model.** Pip and Nova are namespaced copies in one MjModel/MjData, each with its own observation, previous action and task runner; a compile-time check refuses shared addresses. Measured on an M3 Pro: 120 fps with both robots, a 0.92 ms control step, no long tasks.
   - Still open: avoiding each other while both walk the same lane (lanes are scheduled one at a time instead), and a third bot.
9. **[later] Bot-to-bot exchange.** Per the owner's rules: user-triggered, bounded turns (proposed 2), with stop and reset, explicit sender and recipient, and object ownership so two bots can't push the same tile.
10. **[later] Good-teacher / bad-teacher mode.** One bot demonstrates a plausible mistake (3 + 4 = 7) and the learner judges from the measured evidence. It must be labelled as a deliberate mistake.

## C. Quality, tests and repo hygiene

11. **[next] Convert the scratch probes into real Playwright specs** with mocked Claude: `tests/.probe-demo.mjs`, `.probe-right.mjs` and `.probe-moments.mjs` (currently gitignored). Keep `scripts/live-voice-check.mjs` as the only paid end-to-end check, run by hand.
12. **[next] Update the repo `README.md` on the branch.** It still says live AI and voice are not integrated. Document `/sandbox.html`, the `.env` variables (no values), the paid checks and the honest limits.
13. **[later] Re-run the full suite:** `pnpm check` and `pnpm test:e2e`, including the old flaky chat-scroll test (it passes alone and times out under parallel load). Check the bundle size (MuJoCo and ONNX WASM).
14. **[later] Prettier.** `pnpm format:check` flags many files on Windows (CRLF). Settle `.gitattributes` and line endings with the team before formatting anything.
15. **[blocked] Disk space** on the teammate's C: drive (about 0.15 GB free). Free several GB before more installs, Playwright runs or model downloads.

## D. Merge into the product

16. **[next][owner] Reconcile with the owner's branch `microduck-lab-windows`.** It also has real Microduck robots, per-bot agent windows and station actions. Compare architectures (simulation adapter, task executor, agent loop) and agree which parts to keep before opening a PR from `as-kestrel`.
17. **[later] Rebase or merge `as-kestrel` onto `origin/main`** (currently `32c575d`, a DESIGN.md update), then open a PR with a clear capability boundary.
18. **[owner] Provider decisions:**
    - Claude on Bedrock plus ElevenLabs, instead of the planned OpenAI.
    - Whether natural-language TTS is adopted (the planning notes said "not selected").
    - Record the decisions in `05-decisions.md` only once the owner confirms.
19. **[owner][blocked] Microduck asset licences.** They're vendored from the HF Space under its Apache-2.0 licence; separate mesh and policy licences aren't stated upstream. Confirm with Pollen Robotics before any public demo or release.

## E. Safety, cost and deployment

20. **[owner] Youth-audience safeguards before any learner testing.**
    - Under-18 terms for ElevenLabs and Bedrock.
    - Don't store audio or transcripts (currently nothing is persisted; keep it that way).
    - ElevenLabs request logging: zero-retention mode is enterprise-only.
    - Content rules in the prompt.
21. **[later] Cost controls.**
    - Cache the stable system prompt and tool definitions on Bedrock.
    - Cap actions per turn (currently 6) and turns per minute.
    - Show a cost and latency readout in dev.
    - Measured so far: about $0.08 per 6-request bench run, and about $0.10 per full demo.
22. **[later] Bedrock model access.** Haiku 4.5 needs `aws-marketplace:Subscribe` and `aws-marketplace:ViewSubscriptions` on the IAM user. Haiku 5.5, Sonnet 5 and Sonnet 5.5 are unavailable to this account. Re-benchmark with `apps/api/scripts/agent-bench-bedrock.mjs` if access changes, because a faster model would cut latency.
23. **[later][owner] Hosting.** The servers bind to loopback today, and the browser mic needs HTTPS off-localhost. Decide the hosting and auth before any shared demo.

## F. Longer term (product roadmap, owner-led)

24. **[later] New trained skills.** A jump, a dedicated push or a gentle "place": train with Isaac Lab and RSL-RL keeping the same 61-input / 14-output policy interface, then export to ONNX. Needs Linux with an NVIDIA GPU (not this machine).
25. **[later] Projectile Playground** and further missions, reusing the kit/prop/task/agent loop.
26. **[later] Final Kestrel art** replacing the Microduck shell, keeping the physics body compatible with the policies (see the planning notes on rig versus dynamics).

## Two-bot demo follow-ups

- [x] Implement `SimAdapter` over `duckSim` and wire the two-bot coordinator to it (branch `two-bot-real-sim`, `?demo=two-bot&sim=mujoco`). Unit, `two-bot-demo`, `pacing` and `integration` specs green; `tests/two-bot-real-sim.spec.ts` moves a real weight.
- [next] Teammate review of the seam change (`apply` async with a signal, `failed` reason, optional `summary`, `actTimeoutMs`, cap paused while acting).
- [later] Demo: a release-and-measure step so the room shows the measured plank tilt, not the ideal beam; a "moving…" cue during the 5–15 s push; reply text written after the measured result.
- [later] Decide whether `?sim=mujoco` becomes the default once the 3D room replaces the 2D placeholder stage.
- [owner] Default presentation speed (1x vs 0.75x); whether Pause holds the in-flight model call.
