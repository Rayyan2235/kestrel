# Microduck foundation — provenance

Source: https://huggingface.co/spaces/pollen-robotics/microduck-simulator
Pinned revision: `ad9d41a763f30dc770817c33d92dcfec0205db1e` (Space last modified 2026-10-09).

| Kestrel path | Upstream path | Licence | SHA-256 (first 16) |
| --- | --- | --- | --- |
| `apps/web/src/vendor/microduck/duck.js` | `app/src/game/duck.js` | Apache-2.0 (Space app code) | modified: `MODEL_DIR` |
| `apps/web/src/vendor/microduck/variants.js` | `app/src/game/variants.js` | Apache-2.0 | header only |
| `apps/web/src/vendor/microduck/constants.js` | `app/src/game/constants.js` | Apache-2.0 | header only |
| `apps/web/src/vendor/microduck/signed.js` | `app/src/game/signed.js` | Apache-2.0 | header only |
| `apps/web/public/microduck/robot/mjlab/robot_allcollisions.xml` | `app/public/robot/mjlab/robot_allcollisions.xml` | Apache-2.0 (pollen-robotics/microduck_rl) | `7a6fdf437f5a80c7` |
| `apps/web/public/microduck/robot/mjlab/kinematics.json` | `app/public/robot/mjlab/kinematics.json` | Apache-2.0 | `099c64fa03280514` |
| `apps/web/public/microduck/robot/mjlab/microduck.glb` | `app/public/robot/mjlab/microduck.glb` (Git LFS, real binary verified: glTF v2, 1,279,444 bytes) | Apache-2.0 (pollen-robotics/microduck) | `ad0b8d1c886a857f` |
| `apps/web/public/microduck/policies/BEST_alpha_walking.onnx` | `app/public/policies/BEST_alpha_walking.onnx` (Git LFS, real binary verified: 793,705 bytes) | Apache-2.0 (pollen-robotics/microduck) | `e36332d383997d51` |

Licences checked 2026-10-24: the Space README and LICENSE (Apache-2.0 app code; policies and
MJCF from pollen-robotics/microduck and pollen-robotics/microduck_rl), and both GitHub
repositories report Apache-2.0. Meshes ship inside `microduck.glb`.

Not imported: the Space's React/MUI shell, multiplayer ghosts (Trystero/Nostr), audio,
stickers, props, other policies, and any network behaviour.
