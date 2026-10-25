// Microduck policy interface, from pollen-robotics/microduck-simulator
// (app/src/game/constants.js, revision ad9d41a). Changing any of these
// breaks the trained policies; see public/microduck/PROVENANCE.md.

export const ASSET_DIR = "/microduck";
export const ROBOT_DIR = `${ASSET_DIR}/robot`;

export const POLICIES = {
  walk: `${ASSET_DIR}/policies/BEST_alpha_walking.onnx`,
  sitstand: `${ASSET_DIR}/policies/BEST_alpha_sitstand.onnx`,
  stand: `${ASSET_DIR}/policies/BEST_alpha_stand.onnx`,
  kickL: `${ASSET_DIR}/policies/ball_kick_left.onnx`,
  kickR: `${ASSET_DIR}/policies/ball_kick_right.onnx`,
  roll: `${ASSET_DIR}/policies/roulade.onnx`,
  peck: `${ASSET_DIR}/policies/alpha_ground_pick.onnx`,
} as const;
export type PolicyId = keyof typeof POLICIES;

// Actuator order in the MJCF and the ONNX metadata.
export const JOINT_NAMES = [
  "left_hip_yaw", "left_hip_roll", "left_hip_pitch", "left_knee", "left_ankle",
  "neck_pitch", "head_pitch", "head_yaw", "head_roll",
  "right_hip_yaw", "right_hip_roll", "right_hip_pitch", "right_knee", "right_ankle",
] as const;
export const DEFAULT_POSE = new Float32Array([
  0, -0.08726646259971647, -0.457924, -0.00494, 0.452984,
  0.3490658503988659, 0.3490658503988659, 0, 0,
  0, 0.08726646259971647, 0.457924, 0.00494, -0.452984,
]);
export const NUM_JOINTS = 14;
export const OBS_SIZE = 61;
export const CMD_SIZE = 13;
export const TIMESTEP = 0.005;
export const DECIMATION = 4;
export const CTRL_DT = TIMESTEP * DECIMATION; // 50 Hz

// Velocity limits the walking policy was trained to track.
export const VEL_FWD = 0.25;
export const VEL_BACK = -0.2;
export const VEL_ANG = 1.0;

export const KICK_STEPS = 25; // 0.5 s one-shot
export const POST_KICK_LOCK_STEPS = 20;
export const ROLL_MAX_STEPS = 150;
export const PECK_PERIOD_S = 4.0;
export const PECK_END_PHASE = 0.7;

// Fall recovery, mirroring the upstream runtime's state machine.
export const FALL_DEBOUNCE_STEPS = 10;
export const FALL_SETTLE_STEPS = 15;
export const RECOVER_UPRIGHT_STEPS = 50;
export const RECOVER_GIVEUP_STEPS = 300;

// The lab room: a 3 m square, walled so props and the duck stay in view.
export const ROOM_HALF = 1.5;
export const WALL_H = 0.25;
export const WALL_T = 0.05;
export const SPAWN: [number, number] = [-0.6, 0];

// The sandbox camera sits at this fixed offset from the duck, in three.js
// coordinates (x, y up, z). Directions a learner says ("push it right")
// mean what they see on screen, so they derive from the same offset.
export const CAMERA_OFFSET: [number, number, number] = [2.2, 2.1, 2.2];
const away: [number, number] = [-CAMERA_OFFSET[0], CAMERA_OFFSET[2]]; // MuJoCo (x, y) of "into the screen"
const n = Math.hypot(away[0], away[1]);
/** Unit vectors in MuJoCo ground coordinates for screen-relative directions. */
export const SCREEN_DIRS: Record<"left" | "right" | "forward" | "backward", [number, number]> = {
  forward: [away[0] / n, away[1] / n],
  backward: [-away[0] / n, -away[1] / n],
  right: [away[1] / n, -away[0] / n],
  left: [-away[1] / n, away[0] / n],
};
