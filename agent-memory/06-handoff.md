# Current handoff — crew windows

Branch `crew-windows` (worktree `../kestrel-crew-windows`) = `lab-workshop-camera` + main (#11, #12) + collapsible Pip/Nova windows. Its PR targets `lab-workshop-camera`; merging it clears PR #14's conflicts with main. Codex's `rescue-navigation` (main checkout, uncommitted) also edits `SandboxApp.tsx` and will need a merge after this lands.

# Earlier handoff — playground console

Continue on `lab-workshop-camera`. Work from the 2026-10-25 Claude Code session is **uncommitted** in the working tree (the owner reviews before any commit; no push or merge).

The owner turned the classroom into a bright playground: full-screen 3D scene, open court with no furniture (physics too: `roomProps()` is empty), a storybook garden picket fence on the boundary wall, swings, slide, seesaw, sandpit, bench, bunting, a lesson chalkboard, Folio-technique trees and grass, and clouds. All panels float over it as General Intelligence Company glass from the owner's design-system artifact (Inter, ArrowPill, solid/link buttons, light toast glass for legibility over the sunny scene). The Home button is gone; the Kestrel mark links home. Details: `DESIGN.md` (Playground console), `apps/web/src/sandbox/PROVENANCE.md`, `03-codebase-map.md`.

Next:
1. Owner reviews in the browser (`pnpm dev`, `/console`) and decides on committing.
2. Open options the owner raised: fence styling is now the garden picket; a gate arch or hedge variant is possible.
3. Check frame time on a real phone GPU; software WebGL uses the low-power path (`?hq` forces full quality).

Untracked local-only: `.agents/`, `skills-lock.json` (taste skill install), `tests/.probe-*.mjs` (gitignored probes).
