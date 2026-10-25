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
- [x] Live Claude provider for Pip and Nova (`&provider=live`, mock fallback labelled).
- [owner] Retarget PR #7's base from `two-duck-lab` to `moments-floor-push` (#6 merged there).
- [later] Live replies: word the reply after the measured result (today Nova says "moving now" after the push has landed).
- [owner] Default presentation speed (1x vs 0.75x); whether Pause holds the in-flight model call.

## UI pass — 2026-10-25

- [done on glass-windows] Sandbox windows and pill buttons in the owner's noir/amethyst/silver palette; desktop/mobile browser regression and three-width visual checks passed.
- [owner] Review and later merge the UI branch. Further 3D environment and per-robot window work remains separate.

## Product entry — 2026-10-25

- [done on glass-windows] Import the approved landing assets/components, route Open console to the actual lab, remove original scripted screen, and add dark-purple glass.
- [authorized] Merge the combined landing/console PR to main once CI passes. Earlier owner-review merge hold is superseded for this PR.
- [later] Two-robot physics and cooperative experiments still require their separate integration; not implied by the landing artwork.

- [x] Owner environment/camera pass: noir/amethyst/silver workshop, pan and pinch/wheel zoom, explicit follow/frame/reset, reduced-motion support.

- [x] Replace the initial dark workshop with the owner-selected Botanical Studio material/detail pass; original maps and detailed furniture, static AO, dynamic shadows, live wall display.
- [x] Playground: open court, garden fence on the boundary wall, equipment outside it, Folio-style foliage/grass, clouds, GIC glass console, low-power mode.
- [owner] Review the playground branch; choose whether to commit, then merge.
- [next] Optional: a gate arch with roses in the fence, a hedge or flower border variant, and a real-GPU frame-time check on a phone.

- [x] Crew windows: merge main into the playground console; teammate Pip/Nova rail as a collapsible accordion (branch `crew-windows`, PR into `lab-workshop-camera`).
- [next] Bubble anchors are fixed stage percentages from the teammate's layout; with the full-screen stage they can sit over the lesson board. Consider anchoring to the robots' projected positions (teammate's area: agree first).

The remainder of this file documents earlier teammate slices, old branches, and unmerged ideas. Verify against the current source before using it; it is not the active scope.
