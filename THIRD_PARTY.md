# References and provenance

- [Open Space](https://github.com/Fantomiald/open-space), MIT: visual/interaction reference for an inhabited room, character identity, bubbles and compact conversation windows. No source, screenshots or art from it is bundled in this scaffold.
- [Microduck simulator](https://huggingface.co/spaces/pollen-robotics/microduck-simulator), Apache-2.0 application: intended physics/policy integration reference. Robot geometry and policy assets can have separate licenses; verify each before importing. No upstream robot mesh, MJCF or ONNX policy asset is bundled yet.
- [Burrow](https://github.com/jerryjlwang/Burrow): prior art for conversational embodied interaction, not a runtime dependency.
- Font: Plus Jakarta Sans, supplied through its Fontsource package; its license is included in `apps/web/public/licenses/PlusJakartaSans-OFL.txt` and copied to the built site.
- All room and robot geometry in the scaffold is newly authored procedural placeholder geometry. It is not a BD-1 asset or a recovered practice export.
- Gamification, adapted from MIT sources (patterns re-implemented in TypeScript; no files copied; permissive notices kept here):
  - [CodeCombat](https://github.com/codecombat/codecombat) at `2e7ea4b`, MIT code (art CC BY 4.0, levels reserved and not used): the two-segment XP bar with level-up wrap (`AchievementPopup.js`, `calculateData`) informs `apps/web/src/progress/barSegments.ts`; the earned-record `triggeredBy` shape (`earned_achievement.js`) informs the award entry in `packages/contracts/src/progress.ts`.
  - [DiceBear](https://github.com/dicebear/dicebear) at `4db7af0`, MIT code (avatar styles carry their own licences, none used): the seeded PRNG pattern (`Prng.ts`, `Mulberry32.ts`) informs `apps/web/src/progress/rng.ts`; the `contrastTo`/`notEqualTo` slot constraints with a WCAG contrast sort (`getRandomOptions.ts`, `sortByContrast.ts`) inform `apps/web/src/cosmetics/constraints.ts`.
  - [Open Space](https://github.com/Fantomiald/open-space) at `3f971d1`, MIT: the per-field look parser (`parseLook`) informs `parseBotLook` in `packages/contracts/src/progress.ts`; the Workshop dialog and look editor layout inform `apps/web/src/cosmetics/WorkshopDialog.tsx`.
  - Habitica, Moodle block_xp (GPL-3.0) and Exercism (AGPL-3.0) are ideas only: no code is copied or translated, and no Habitica art or content is used.

Installed dependencies retain their respective licenses. Public repository visibility does not automatically grant a license to original project code; the owner can choose that license separately.
