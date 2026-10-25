# Botanical Studio material rebuild

**Goal:** Apply the owner's selected Botanical Studio palette and replace the blocky workshop appearance with tactile surfaces and richer room detail informed by the inspected My Room in 3D source.

**Approved direction:** Warm stone #E8E2D6, forest #293D35, sage #9BAE97, brass #B99250, clay #BC816B. Retain robot identity colors and all lesson/control behavior. Console scope only; landing unchanged.

**Implementation:** Original procedural texture maps and detailed geometry; offline static ambient-occlusion maps; dynamic shadows and a filtered reflection environment. No Blender installation, imported reference models, or copied lighting atlases. This is not a full global-illumination bake.

- [x] Generate deterministic room AO maps from fixed wall/furniture envelopes.
- [x] Add oak floor/worktops, stone inlay, plaster walls, window recess/mullions, cabinet fronts, brass fittings, shelves/books/jars/plants and task lamp.
- [x] Add live measured robot-position display, slow fan and dust; preserve reduced motion.
- [x] Bevel dynamic box meshes within their existing dimensions; preserve grid/ruler textures and physics poses.
- [x] Apply scoped console theme and clean up allocated material/texture resources.
- [x] Verify both lessons, desktop/mobile camera controls, screenshots, pnpm check and independent review.

**Review focus:** Texture disposal on kit changes; shadow/UV correctness; no lesson geometry or action changes; useful mobile controls; room detail must not make the lab unreadable.

Validation: pnpm check passed (185 tests, builds and API health); 7 browser checks passed with one intentional desktop skip of mobile pinch; final desktop/mobile screenshots inspected after reflection-intensity adjustment and Moments output contrast correction. Independent review found no significant issues. Mobile overview labels remain small; frame/zoom provides inspection.
