# Working on Kestrel

Read PRODUCT.md, DESIGN.md and docs/ROADMAP.md before changing behavior. README distinguishes implemented preview behavior from the intended product.

- This is the fresh product repo. Do not migrate practice code or private Obsidian notes wholesale.
- Preserve the three differentiators: interactive embodied bots, excellent Open Space-inspired UI, and meaningful bot-to-bot collaboration.
- The user controls experiments. Models request validated actions; simulation owns state and measured results.
- Keep recipient identity, cancellation, reset versions, object ownership and bounded autonomous turns explicit.
- Never expose API secrets to Vite or ship hidden paid/background model calls. Do not store learner audio/transcripts by default.
- Mark scripted behavior and capability gaps honestly. Bubbles are public plans/explanations, not hidden reasoning.
- Keep the visual loop central. Do not turn the lab into a generic card dashboard.
- Preserve planning and research. Do not mass-delete/archive notes to make context lean; improve reading paths.
- Use RTK for shell commands when available (owner convention). Standard pnpm scripts work without RTK for teammates and CI.
- Verify pnpm check; run relevant browser checks for UI changes. Add behavior tests for routing, science, cancellation and concurrency; avoid tests that merely mirror constants or prose.
