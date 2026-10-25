# Microduck assets: provenance

These files are copied unmodified from the Hugging Face Space `pollen-robotics/microduck-simulator`:

- Revision: `ad9d41a763f30dc770817c33d92dcfec0205db1e` (2026-10-09)
- Paths: `app/public/robot/mjlab/` and `app/public/policies/`
- Space license: Apache-2.0 (`LICENSE-Apache-2.0.txt`). The upstream robot software repo (`pollen-robotics/microduck`) also declares Apache-2.0. Separate licenses for the CAD-derived meshes and the ONNX policies are **not stated** upstream. Confirm with Pollen Robotics before any public or commercial release.
- **Mesh licence caution (added 2026-10-24):** ROSClaw Duckverse (`ros-claw/microduck` @ `1034ed0`, `THIRD_PARTY.md` and `upstream.lock.yaml`) records the `pollen-robotics/microduck_rl` 3D models as **CC BY-SA-NC** (attribution, share-alike, non-commercial), separately from its Apache-2.0 code. The collision meshes here come from that robot. Until Pollen Robotics confirms otherwise, treat the meshes and `microduck.glb` as non-commercial with attribution, and don't assume the Space's Apache-2.0 covers them.
- Checksums: `SHA256SUMS`. Every file was checked to be real binary content, not a Git LFS pointer.

## Contents

| File | Role |
| --- | --- |
| `robot/robot_allcollisions.xml` | MJCF used for physics (visual geoms stripped at load time) |
| `robot/kinematics.json` | Body tree used to drive the render rig from `qpos` |
| `robot/microduck.glb` | Render meshes |
| `robot/meshes/*.stl` | The 9 collision meshes the physics model references |
| `policies/BEST_alpha_walking.onnx` | Velocity-tracking walk and turn |
| `policies/BEST_alpha_sitstand.onnx` | Sit and stand (`cmd[0]` is the posture flag) |
| `policies/BEST_alpha_stand.onnx` | Get-up policy used for fall recovery |
| `policies/ball_kick_left.onnx`, `ball_kick_right.onnx` | One-shot kicks (0.5 s window) |
| `policies/roulade.onnx` | One-shot roll |
| `policies/alpha_ground_pick.onnx` | One-shot ground peck (phase-encoded) |

Policy interface: observation 61D = gyro(3), projected gravity(3), joint pos − default(14), joint vel(14), last action(14), command(13). Action 14D position offsets from the default pose. Runs at 50 Hz (timestep 0.005 s × decimation 4).

The base model has **no jump skill**.
