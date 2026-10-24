# Simulation integration boundary

The scaffold renders an original Three.js room and uses explicit analytic balance quantities. MuJoCo 3.11.0 and ONNX Runtime Web 1.27.0 are pinned as the upstream integration baseline, but neither is loaded or exercised yet. No trained walking or contact manipulation is claimed.

Next: pin a Microduck source revision and compatible real MJCF, kinematics, meshes and ONNX policy files; verify licenses per asset, file checksums and non-LFS-pointer downloads. Add a simulation adapter that exposes snapshots and accepts bounded tasks, with its timestep independent of React/model requests. Benchmark one body, then two. Preserve joint ordering/normalization/body dynamics. Do not blindly attach a policy to a changed rig.

Source: https://huggingface.co/spaces/pollen-robotics/microduck-simulator
