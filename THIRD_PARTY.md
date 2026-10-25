# References and provenance

- [Open Space](https://github.com/Fantomiald/open-space) @ `3f971d1`, MIT (Copyright (c) 2026 VibesMoney): the per-bot agent-window model. Window geometry helpers in `apps/web/src/windows/geometry.ts` are adapted from its `src/state/windows.ts`; the licence is at `apps/web/src/windows/OPEN-SPACE-LICENSE`. Its coding-agent backend, terminal controls, permission system and pixel-art office are not used.
- [Microduck simulator](https://huggingface.co/spaces/pollen-robotics/microduck-simulator) @ `ad9d41a`, Apache-2.0: the robot rig, colourways and constants are vendored in `apps/web/src/vendor/microduck/` (licence and per-file provenance there), and the MJCF, kinematics, GLB meshes and the walking policy are pinned in `apps/web/public/microduck/`. The physics loop in `apps/web/src/microduck/` is adapted from its `game.js`. The policies and MJCF originate in pollen-robotics/microduck and pollen-robotics/microduck_rl (both Apache-2.0).
- [Burrow](https://github.com/jerryjlwang/Burrow): prior art for conversational embodied interaction, not a runtime dependency.
- Font: Plus Jakarta Sans, supplied through its Fontsource package; its license is included in `apps/web/public/licenses/PlusJakartaSans-OFL.txt` and copied to the built site.
- The open floor and balance apparatus are newly authored procedural geometry. The procedural placeholder robots remain only as a fallback when the Microduck physics cannot start.

Installed dependencies retain their respective licenses. Public repository visibility does not automatically grant a license to original project code; the owner can choose that license separately.
