# Current handoff — Botanical classroom

Continue on `lab-workshop-camera`. The owner likes Botanical Studio and asked for a more classroom-like room, then a Claude Code handoff to attempt further redesign on this same branch.

This pass replaces the studio shelving/sign with a large teaching board that changes with Pythagoras/Moments, a chalk tray and eraser, equipment labels, and a learning-station marker. Original materials, lighting, both bots, camera controls and physics remain intact.

Read `docs/handoffs/claude-code-classroom-redesign.md`: owner intent, palette, reference source findings/revisions, reproducible REA workflow, taste skill, code map, physics/interaction invariants and verification checklist. The user will start Claude manually. No push or merge. Local `.agents/` and `skills-lock.json` remain untracked.

Validation: pnpm check passes (185 tests, typecheck, web/API builds and API health smoke). Browser visual verification recorded in the changelog. Prior Botanical camera suite passed 7 checks with one intentional desktop skip. Static AO is approximate, not a full baked GI asset pipeline; small world text needs zoom on mobile.
