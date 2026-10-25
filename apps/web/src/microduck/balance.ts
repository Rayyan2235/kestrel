import { BALANCE_FIXTURE } from "@kestrel/contracts";

export type Side = "left" | "right";

// The floor balance, in MuJoCo coordinates (metres, z up). The lab draws it ×4
// (physics.ts SCALE), so one lab "centimetre" on the ruler is 1/128 m, the same
// enlarged display scale as BALANCE_FIXTURE (cm / 32 scene metres).
const CM_PER_METRE = BALANCE_FIXTURE.station.centimetersPerSceneMeter * 4;
const BEAM_Y = -0.05; // scene z = 0.2, behind the push lane
const PIVOT_Z = 0.035;
const BEAM = { halfLength: 0.375, halfDepth: 0.0375, halfThick: 0.006, mass: 0.3, tilt: 0.07 };
// Paddles reach from the beam to just past the push lane, where a duck's chest meets them.
const PADDLE = { halfThick: 0.006, halfReach: 0.0475, halfHeight: 0.0425 };
// The fixture's 200 g and 100 g weights, as real masses.
const MASS = { left: 0.2, right: 0.1 } as const;

export const BALANCE = {
  cmPerMetre: CM_PER_METRE,
  beamY: BEAM_Y,
  pivotZ: PIVOT_Z,
  beam: BEAM,
  paddle: PADDLE,
  mass: MASS,
  /** The push lane (paddles reach across it, scene z 0.65) and the transit lane, ~7 cm clear of the paddle tips (scene z 1.32). */
  pushLaneY: -0.1625,
  transitLaneY: -0.33,
  /** Closest the two paddles may come: room for a duck to stand between them. */
  minGap: 0.14,
  /** Where an idle duck waits, a body-width clear of the transit lane (scene z 2.1). */
  homes: { pip: { px: -0.3, py: -0.525, yaw: Math.PI / 2 }, nova: { px: 0.3, py: -0.525, yaw: Math.PI / 2 } },
  /** hinge, left slide, right slide */
  restQpos: [0, -20 / CM_PER_METRE, 20 / CM_PER_METRE] as const,
  minCm: 5,
  maxCm: 45,
  /** Slide coordinate (metres along the beam) for a lab-cm position on one side. */
  slideFor: (side: Side, cm: number) => (side === "left" ? -cm : cm) / CM_PER_METRE,
};

/** MJCF for the apparatus, appended to the shared world. */
export function apparatusXml() {
  const lo = BALANCE.minCm / CM_PER_METRE,
    hi = BALANCE.maxCm / CM_PER_METRE;
  const carriage = (side: Side, mass: number, half: number) => `
      <body name="carriage_${side}" pos="0 0 ${BEAM.halfThick}">
        <joint name="carriage_${side}_slide" type="slide" axis="1 0 0" range="${side === "left" ? `${-hi} ${-lo}` : `${lo} ${hi}`}" damping="3" frictionloss="0.05" armature="0.01"/>
        <geom name="carriage_${side}_block" type="box" size="${half} 0.03 0.02" pos="0 0 0.02" mass="${mass}" rgba="0.08 0.08 0.08 1"/>
        <geom name="carriage_${side}_paddle" type="box" size="${PADDLE.halfThick} ${PADDLE.halfReach} ${PADDLE.halfHeight}" pos="0 ${-(BEAM.halfDepth + PADDLE.halfReach)} ${PADDLE.halfHeight - BEAM.halfThick}" mass="0.01" friction="0.6 0.005 0.0001" rgba="0.49 0.29 0.7 1"/>
      </body>`;
  return `
    <body name="balance_base" pos="0 ${BEAM_Y} 0">
      <geom name="pivot_block" type="box" size="0.03 0.03 ${PIVOT_Z / 2}" pos="0 0 ${PIVOT_Z / 2}" rgba="0.08 0.08 0.08 1"/>
      <body name="balance_beam" pos="0 0 ${PIVOT_Z}">
        <joint name="beam_hinge" type="hinge" axis="0 1 0" range="${-BEAM.tilt} ${BEAM.tilt}" damping="0.03" armature="0.002"/>
        <geom name="beam" type="box" size="${BEAM.halfLength} ${BEAM.halfDepth} ${BEAM.halfThick}" mass="${BEAM.mass}" rgba="0.97 0.97 0.96 1"/>
        ${carriage("left", MASS.left, 0.028)}
        ${carriage("right", MASS.right, 0.022)}
      </body>
    </body>
    <contact>
      <exclude body1="carriage_left" body2="balance_beam"/>
      <exclude body1="carriage_right" body2="balance_beam"/>
      <exclude body1="balance_beam" body2="balance_base"/>
    </contact>`;
}
