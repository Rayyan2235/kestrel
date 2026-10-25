# Claude Code handoff: Kestrel classroom redesign

> Superseded on 2026-10-25: the owner replaced the classroom with a playground. Current state is in `agent-memory/06-handoff.md` and `DESIGN.md`.

## Starting prompt

Continue on `lab-workshop-camera`. Read AGENTS.md and agent-memory first, then this document. Improve the real `/console` into an immersive Botanical Studio **classroom** with beautiful apparatus, worktops, floor materials, and purposeful educational details. Study Bruno Simon's My Room in 3D and Folio source and running demos using REA; translate their techniques into this existing R3F/WebGL application. Apply design-taste-frontend with the owner's palette taking precedence. Preserve both physical bots, lesson interactions, camera controls and MuJoCo authority. Implement and visually verify desktop/mobile results, update agent memory, and leave the same branch ready for owner review. Do not merge or push without a new instruction.

## State and owner intent

- Branch: `lab-workshop-camera`; verify current Git status before touching files. Do not reset, switch to main, or create a competing worktree.
- Baseline commits: `ceaaa48` added room/camera; `e856749` rebuilt Botanical materials/console. Current HEAD also contains the classroom refinement and this handoff; inspect the diff/log rather than assuming the earlier baseline is current.
- Owner liked the Botanical direction but said it should simulate a classroom. This pass replaces the decorative shelf/sign wall with a large lesson-specific teaching board, chalk tray, labeled equipment storage, and a learning-station marker. Keep the daylight, plants and tactile materials without making it feel like a private office.
- Real product is `/console`; scripted preview was removed. Both Pip and Nova belong in the scene. Landing already opens the real console. Landing styling is outside this pass.
- Earlier requests for purple glass were superseded by the owner's explicit **Botanical Studio — warm stone, forest green, sage, brass** choice. Nova can retain its identity accent.
- Owner scope: environment/level design and camera movement. Other teammates own conversation bubbles, per-bot speech delegation, quizzes, AI verbosity and beep-bop audio. Avoid unrelated behavior changes.

## Palette and visual target

| Role             | Color                 |
| ---------------- | --------------------- |
| Warm stone shell | `#E8E2D6`             |
| Forest panels    | `#293D35`             |
| Sage furniture   | `#9BAE97`             |
| Brass details    | `#B99250`             |
| Clay accents     | `#BC816B`             |
| Primary text     | `#F3EEE3`             |
| Muted text       | `#CED6C7`             |
| Glass surface    | `rgb(35 55 45 / 92%)` |

Aim for an inviting shared science classroom: a legible teaching wall, organized experiment storage, credible apparatus and surfaces, clear circulation and visual focus on the current lesson. Prefer fewer well-modeled details over lots of tiny labels. Check silhouettes, rounded edges, roughness, contact shadows, light direction and material scale. Classroom diagrams are illustrative; never present them as live measured results. The live crew display really reads simulation positions.

The current room remains procedural. It has original texture maps, approximate static AO and real-time lighting, **not** Bruno's fully authored baked asset pipeline. Do not promise parity from a palette swap or bloom pass. If custom UV-mapped models/full GI baking are needed, identify and implement a bounded asset workflow with original or appropriately licensed assets.

## Reference findings: inspect these again before adapting

### My Room in 3D — primary material and room reference

- [Repository](https://github.com/brunosimon/my-room-in-3d)
- [Running demo](https://my-room-in-3d.vercel.app/)
- Inspected revision: `5d00b3f870da81f103e901e0d12e20bbcc816834`.
- `src/Experience/Baked.js`: loads baked day/night/neutral textures, correct flipY and color space, custom shader.
- `src/Experience/shaders/baked/fragment.glsl`: blends those baked images; RGB lightmap channels isolate TV, desk and PC light contributions for independent tint/strength.
- The reference has a Draco room GLB and three 4096² baked textures plus a 4096² lightmap. Richness comes predominantly from modeled forms and authored lighting; `Renderer.js` has postprocessing disabled.
- `Screen.js`: separate dynamic VideoTexture screens. Our measured-position display follows the separation principle without copying media.
- `CoffeeSteam.js` and shaders: restrained noise-driven motion; `TopChair.js`: isolated animated geometry using the baked material.
- `Navigation.js`: bounded spherical navigation and smoothing. Kestrel cannot blindly adopt orbit because spoken movement directions depend on its fixed camera orientation.
- REA parsed 21 JavaScript files without failures and captured the rendered demo. This is source/screenshot evidence, not proof of every interaction.

### Folio 2025 — navigation and interaction reference

- [Repository](https://github.com/brunosimon/folio-2025)
- [Running demo](https://bruno-simon.com)
- Inspected revision: `41046b57eeed8d156d9c3fd7fa259900baef7816`.
- `sources/Game/View.js`: perspective camera, smoothed tracking, drag-to-explore, wheel/pinch zoom and transitions. Translate follow/explore/frame behavior, not its renderer or camera settings wholesale.
- `sources/Game/Materials/MeshDefaultMaterial.js`: tinted shadows, terrain bounce, fog and reveal. `sources/Game/Ligthing.js` is the actual misspelled filename for shared lighting/shadow controls.
- `sources/Game/Rendering.js`: WebGPU/TSL rendering, bloom and depth of field. Kestrel uses Three 0.164 WebGL/R3F; don't migrate to Folio's Three 0.183 stack as a cosmetic change.
- `Reveal.js`, `InteractivePoints.js`: world reveal and readable interaction feedback. Keep motion restrained and respect reduced motion.
- `World/Areas/Area.js`: spatial bounds/update gating; `World/PoleLights.js`: efficient instanced motion.
- REA parsed 127 JS files; live screenshot reached the introduction, not a complete interactive playthrough. Do not overstate that evidence.

Other earlier references: [Open Space](https://github.com/Fantomiald/open-space) for glass panels, [Principia](https://github.com/Bithack/principia) for apparatus interaction, [Duckverse](https://github.com/ros-claw/microduck) for embodied coordination. These do not authorize replacing Kestrel's physics or copying assets.

## Reverse-engineering workflow with REA

[REA repository and docs](https://github.com/morluto/rea). Read `docs/cli.md`, `docs/browser-observation.md`, `docs/website-script-export.md` and `docs/browser-scenario-contract.md`; check current CLI help rather than guessing schemas. The previous run resolved `rea-agents@latest` to 6.7.0.

1. Clone reference source into a disposable directory outside this repo; record the revision. Read source directly and identify how geometry, materials, lighting and motion are separated.
2. Run static analysis scoped to the relevant source directory. Use `rtk proxy` so RTK does not truncate large JSON output:

```sh
rtk proxy npx --yes --package=node@24.22.1 --package=rea-agents@latest rea analyze-javascript-application /absolute/reference/src --json > /tmp/room-analysis.json 2> /tmp/room-analysis.log
```

3. Use a dedicated temporary Chrome profile and loopback debugging port. Never attach REA to a personal logged-in browser. Example for macOS:

```sh
rtk proxy /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless=new --remote-debugging-address=127.0.0.1 --remote-debugging-port=9334 --user-data-dir=/tmp/kestrel-reference-browser https://my-room-in-3d.vercel.app/
```

4. Invoke the following via the same temporary npx runtime (replace TARGET_ID with the returned target):

```text
rea list-browser-targets http://127.0.0.1:9334 --allowed-origins https://my-room-in-3d.vercel.app --json
rea inspect-web-page http://127.0.0.1:9334 TARGET_ID --observation-ms 1000 --include-console-text --json
rea capture-web-screenshot http://127.0.0.1:9334 TARGET_ID --json
```

Read `normalized_result`. Screenshot bytes were in `normalized_result.artifact.data_base64`; decode to a local image and actually inspect it. Observe only the intended origin. Close the disposable browser afterward. Avoid `rea setup` unless installation/configuration is explicitly needed; it changes agent MCP config.

5. Use Playwright or browser tools for interaction and viewport checks. Passive REA observation does not prove behavior, and static dependency graphs do not prove execution.
6. Write a short evidence-to-implementation mapping: reference file/technique → Kestrel adaptation → expected benefit → verification. Use original geometry/textures. Do not copy reference GLBs, baked JPGs, videos or other assets without checking license and attribution requirements.

## Taste skill

Owner explicitly requested [design-taste-frontend](https://github.com/Leonxlnx/taste-skill). First inspect `.agents/skills/design-taste-frontend/SKILL.md`; a local installation exists and is intentionally untracked. If unavailable, install for Claude Code using the CLI's current agent name/options:

```sh
rtk npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend
```

Read the skill before using it. Apply its spacing, hierarchy, motion and craft guidance, but keep the owner's palette and requested subtle glass. Generic taste rules do not override explicit user choices. Read `.impeccable/design.json` and DESIGN.md for existing product context. Don't introduce a new generic dashboard or rebuild the landing page.

## Implementation map and invariants

- `apps/web/src/sandbox/Workshop.tsx`: room shell, fitted furniture details, teaching board, plants, lamp, measured-position display, subtle fan/dust and focus marker. Canvas textures and generated geometry require disposal.
- `studioMaterials.ts`: original deterministic wood, plaster and stone maps; radial contact texture.
- `StudioLighting.tsx`: PMREM RoomEnvironment, restores scene environment and disposes resources on cleanup.
- `SandboxScene.tsx`: physics-backed props and both bot rigs, bevels, lighting and scene composition.
- `LabCamera.tsx`, `camera.ts`: follow/explore/experiment modes; drag/pinch/wheel, bounded pan/zoom, keyboard and toolbar controls. Preserve focus behavior and stopPropagation for Space/Enter keydown **and keyup** so controls don't trigger voice/movement.
- `Sandbox.module.css`: scoped console palette/glass, desktop/mobile layout and accessibility. Lesson panels must not cover the experiment or camera toolbar.
- `scripts/bake-workshop.mjs`: deterministic 256²/48-ray approximate static AO bake for fixed room geometry. Revisit if static occluders move substantially.
- `apps/web/public/workshop/PROVENANCE.md`: original generated assets and limitations; update when asset pipeline changes.
- `tests/workshop-camera.spec.ts`: navigation, both lessons, keyboard isolation and mobile pinch.

MuJoCo owns all physical poses, contacts and results. Do not add fake apparatus movement, move rendered objects independently from colliders, or place non-colliding furniture in robot walk paths. Decorative wall details stay out of the usable floor area. Stone inlay remains flush at z≈0. Keep both Pip and Nova visible and functional. Preserve the fixed camera orientation unless updating and testing the spoken direction contract too. Do not trigger paid AI calls during visual checks or expose secrets to Vite.

## Verification and finish

Use Node 24 and pnpm. Commands in this workspace must have the `rtk` prefix; use `rtk proxy` for tools needing raw output. Read the runbook for current setup. The existing local `pnpm dev` server was at web 5180/API 5181, serving this branch, but verify processes before assuming it is running. Open `/console`, not an older preview port.

- Run `rtk pnpm check`: typecheck, tests, web/API build and health smoke. Botanical baseline had 185 passing tests.
- Run the relevant Playwright checks. Prior camera suite: 7 passed, one intentional desktop skip for mobile-only pinch. Use the actual project's configuration or a temporary config with desktop 1440×1000 and touch mobile 390×844, baseURL pointing to the correct running server. Headless WebGL may require `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- Inspect actual screenshots of **Pythagoras and Moments** at desktop and mobile, plus zoomed experiment framing. Check board readability, material scale, occlusion, text contrast, both bots, pan/pinch/wheel/follow/reset, and reduced motion. Do not treat a successful build as visual approval.
- Use deterministic UI/physics interactions; avoid sending model/voice requests just to take screenshots.
- Report known limits honestly. Small in-world text requires zoom on mobile; essential lesson instructions must remain accessible in HTML.
- Update DESIGN.md if the design contract changes, and agent-memory status/handoff/changelog as required. Keep private vault notes, credentials and local-only skill installation out of commits.
- Review the diff, commit only relevant changes on this same branch, and leave it for the owner. No merge, deployment or push requested for this handoff.
